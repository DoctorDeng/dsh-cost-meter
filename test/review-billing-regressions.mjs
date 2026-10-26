import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { zstdCompressSync } from 'node:zlib'
import { iterateSessionRecords, replaySessionRecords } from '../lib/backfill.js'
import { __testProjection } from '../lib/index.js'
import { createUsageDeduper } from '../lib/usage-dedup.js'
import { totalUsageTokens } from '../lib/usage-totals.js'
import { Ledger, sanitizeConfig, splitLedgerApiCost } from '../lib/store.js'
import { buildPlanStats, quotaWindowStart, recordSamples, HOUR_BUCKET_RETENTION_MS, pruneHourBuckets } from '../lib/plan-billing.js'
import { clampPct, parseCodexUsage } from '../lib/gateway-quota-adapters.js'
import { readTextBounded, readJsonBounded } from '../lib/net.js'

const dir = mkdtempSync(join(tmpdir(), 'cm-review-fixed-'))
const collect = async source => { const rows = []; for await (const row of source) rows.push(row); return rows }
const config = sanitizeConfig({ codexQuotaEnabled: true, peakEnabled: false, prices: { providers: {
  codex: { models: { fixture: { cacheMiss: 1, cacheHit: 0, output: 1 } } },
} } })
try {
  const event = message => JSON.stringify({ type: 'assistant/message', data: { message } }) + '\n'
  const large = event(randomBytes(9 * 1024 * 1024).toString('base64'))
  const file = join(dir, 'large.jsonl.zstd'), compressed = zstdCompressSync(Buffer.from(large))
  assert.ok(compressed.length > 8 * 1024 * 1024)
  writeFileSync(file, compressed)
  assert.equal((await collect(iterateSessionRecords(file))).length, 1, 'a valid frame crossing a read block is retained')
  const budget = join(dir, 'budget.jsonl.zstd')
  writeFileSync(budget, zstdCompressSync(Buffer.from(event('x'.repeat(65536)))))
  await assert.rejects(() => collect(iterateSessionRecords(budget, { maxDecompressed: 1024 })), /budget/)
  const plain = join(dir, 'plain.jsonl')
  writeFileSync(plain, event('中文😀'.repeat(2000)))
  await assert.rejects(() => collect(iterateSessionRecords(plain, { maxDecompressed: 1024 })), /budget/)
  await assert.rejects(() => collect(iterateSessionRecords(plain, { maxLineBytes: 1024 })), /line/)
  writeFileSync(plain, JSON.stringify({ type: 'text-chunks', content: 'x'.repeat(4096) }) + '\n' + event('after-packed'))
  assert.equal((await collect(iterateSessionRecords(plain, { maxLineBytes: 1024 }))).length, 1, 'oversized packed text is discarded without losing subsequent usage')
  writeFileSync(plain, event('one') + event('two'))
  await assert.rejects(() => collect(iterateSessionRecords(plain, { maxEvents: 1 })), /event limit/)
  writeFileSync(file, Buffer.concat([zstdCompressSync(Buffer.from(event('first'))), compressed.subarray(0, 9 * 1024 * 1024)]))
  assert.deepEqual((await collect(iterateSessionRecords(file))).map(row => row.data.message), ['first'], 'truncated tail does not corrupt prior complete frames')

  const usage = { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, reasoning: 30 }
  const deduper = createUsageDeduper({ now: () => 30000 })
  for (const at of [21000, 1000]) assert.equal(deduper.admit('s', 'fixture', 'modlens-opencode-go', usage, at), 'opencode-go')
  for (const at of [21000, 1000]) assert.equal(deduper.admit('s', 'fixture', 'opencode-go', usage, at), null, 'each out-of-order call still suppresses its own forwarded duplicate')
  const independent = createUsageDeduper({ now: () => 30000 })
  assert.equal(independent.admit('s', 'fixture', 'opencode-go', usage, 1000), 'opencode-go')
  assert.equal(independent.admit('s', 'fixture', 'opencode-go', usage, 1001), 'opencode-go', 'equal ordinary calls remain independent')
  const records = [{ type: 'request/header', seq: 0, time: 1, data: { header: { config: { provider: 'modlens-opencode-go', model: 'fixture' } } } },
    ...[21000, 1000].map((time, i) => ({ type: 'assistant/message', time, seq: i + 1, data: { turn: i + 1, step: 1, usage: { inputTokens: 100, outputTokens: 50 } } }))]
  const replay = replaySessionRecords(records, config)
  assert.equal(Object.values(replay.days).reduce((n, day) => n + Object.values(day).reduce((sum, row) => sum + row.calls, 0), 0), 2)
  const projection = __testProjection.makeCostUsageProjection({ config })
  let projected = projection.init()
  for (const row of records) projected = projection.apply(projected, row)
  assert.equal(projected.totals.input, 200, 'live projection and historical replay both retain out-of-order independent calls')
  assert.equal(totalUsageTokens(usage), 150)
  assert.equal(totalUsageTokens({ input: NaN, output: -1, cacheRead: Infinity, reasoning: 200 }), 0)

  const ledger = new Ledger(config, {}, join(dir, 'ledger.json'))
  ledger.account(usage, 'fixture', 's', Date.now(), 'codex')
  assert.equal(Object.values(ledger.planHourBuckets.codex)[0].tokens, 150)
  const apiBefore = ledger.sumDays().apiCost
  ledger.config = sanitizeConfig({ ...ledger.config, codexQuotaEnabled: false, codingPlans: { minimax: { enabled: true } } })
  splitLedgerApiCost(ledger)
  assert.equal(ledger.sumDays().apiCost, apiBefore, 'quota queries cannot rewrite API attribution')
  assert.deepEqual(ledger.config.planBilling.autoProviders, config.planBilling.autoProviders)
  ledger.close()
  const reopened = Ledger.load(ledger.path)
  assert.deepEqual(reopened.config.planBilling.autoProviders, config.planBilling.autoProviders)
  reopened.close()

  const now = new Date(2026, 9, 22, 12).getTime(), reset = new Date(2026, 9, 23).toISOString()
  const planConfig = sanitizeConfig({ planBilling: { providers: { minimax: 'plan' } } })
  const win = { percent: 10, resetsAt: reset }
  const days = { '2026-10-17': { byProviderModel: { 'minimax:fixture': { input: 1000, output: 0, cost: 10 } } } }
  const stats = buildPlanStats({ days, hourBuckets: {}, samples: {}, codingPlans: { minimax: { status: 'ok', windows: { weekly: win } } }, config: planConfig, nowMs: now })
  assert.equal(stats.providers.minimax.windows.weekly.localTokens, 1000)
  assert.equal(stats.providers.minimax.windows.weekly.fullTokens, 10000)
  assert.equal(quotaWindowStart('fiveHour', now, { rolling: true, resetsAt: reset }), now - 5 * 3600000)
  const march = new Date(2026, 2, 31, 8).getTime()
  assert.equal(new Date(quotaWindowStart('monthly', new Date(2026, 2, 15).getTime(), { resetsAt: new Date(march).toISOString() })).getMonth(), 1)
  const samples = recordSamples({}, 'minimax', { weekly: win }, { forWindow: (name, original) => {
    assert.equal(original, win); return { tokens: 1000, cost: 10 }
  } }, now)
  assert.equal(samples.minimax.weekly[0].s, Date.parse(reset) - 7 * 86400000)
  const oldHour = now - 7 * 86400000
  assert.equal(pruneHourBuckets({ minimax: { [oldHour]: { tokens: 10, cost: 1 } } }, now).minimax[oldHour].tokens, 10)
  assert.ok(HOUR_BUCKET_RETENTION_MS >= 32 * 86400000)

  for (const raw of [null, '', ' ', false, true, [], {}]) {
    assert.equal(clampPct(raw), null)
    assert.equal(parseCodexUsage({ rate_limit: { primary_window: { used_percent: raw, limit_reached: true, limit_window_seconds: 18000 } } }).windows[0].percent, 100)
    assert.throws(() => parseCodexUsage({ rate_limit: { primary_window: { used_percent: raw, limit_window_seconds: 18000 } } }), /未解析/)
  }
  assert.equal(clampPct('17'), 17)
  let cancelled = false
  const tooLarge = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2048)) }, cancel() { cancelled = true } }))
  await assert.rejects(() => readJsonBounded(tooLarge, 1024), /too large/)
  assert.equal(cancelled, true)
  cancelled = false
  const slow = new Response(new ReadableStream({ cancel() { cancelled = true } }))
  const keepAlive = setTimeout(() => {}, 100)
  try { await assert.rejects(() => readTextBounded(slow, 1024, { timeoutMs: 10 }), error => error.name === 'TimeoutError') }
  finally { clearTimeout(keepAlive) }
  assert.equal(cancelled, true)
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  assert.ok(new Set(manifest.dshhub.permissions.network).has('https://chatgpt.com'))
} finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
console.log('[ok] review regressions: large/truncated frames, output/line/event budgets, out-of-order calls, token totals, stable classification, real reset cycles, null quotas and bounded responses')
