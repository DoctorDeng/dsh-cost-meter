import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { setTimeout as delay, setImmediate } from 'node:timers/promises'
import { createBillionInventory } from '../lib/billion-context-inventory.js'
import { installBillionContextBilling } from '../lib/billion-context-billing.js'
import { billionRoot, billionStreamPath, billionSessionKey, readBillionStreamFileAsync } from '../lib/billion-context-history.js'
import { archiveSealedJournals } from '../lib/journal-storage.js'
import { fetchWorkBuddyAccounts } from '../lib/workbuddy-accounts.js'
import { queryGatewayQuota, GATEWAY_MANAGEMENT_PATHS } from '../lib/gateway-quotas.js'
import { collectBillingExport, createBillingExporter } from '../lib/billing-export.js'
import { sanitizeConfig, localDayKey } from '../lib/store.js'
import { costOf } from '../lib/pricing.js'
import { z } from 'zod'

const errors = []
const check = async (name, run) => {
  try { await run(); console.log('[ok] ' + name) }
  catch (error) { errors.push(error); console.error('[fail] ' + name + ': ' + error.message) }
}
const ioError = () => Object.assign(new Error('simulated disk failure'), { code: 'EIO' })
const directory = fs.mkdtempSync(join(tmpdir(), 'cm-review-io-'))
const path = join(directory, 'ledger.json'), root = billionRoot(path)
const stream = { protocol: 1, streamId: randomUUID(), sessionId: 'retry', finished: true, model: 'main', provider: 'fixture',
  startedAtMs: Date.now() - 1000, policies: {}, coverage: { version: 1, mode: 'host' },
  reported: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } }
const file = billionStreamPath(root, stream.sessionId, stream.streamId)
fs.mkdirSync(join(file, '..'), { recursive: true }); fs.writeFileSync(file, JSON.stringify(stream))
try {
  await check('invalid JSON metadata is skipped instead of entering the I/O retry queue', async () => {
    try {
      for (const body of ['null', '[]', '12', '{}', '{invalid']) {
        fs.writeFileSync(file, body)
        assert.equal(await readBillionStreamFileAsync({ path: file, key: billionSessionKey(stream.sessionId) }), null)
      }
    } finally { fs.writeFileSync(file, JSON.stringify(stream)) }
  })
  await check('oversized constrained collections fail without allocating an error for every element', async () => {
    const schema = z.array(z.number()).max(2)
    assert.deepEqual(schema.parse([1, 2]), [1, 2])
    const result = schema.safeParse(Array(2000).fill('invalid'))
    assert.equal(result.success, false)
    assert.ok(result.error.issues.some(issue => issue.code === 'too_big'))
    assert.ok(result.error.issues.length < 10)
  })
  await check('invalid token buckets preserve charges for valid usage', async () => {
    const rate = { cacheMiss: 2, cacheHit: .5, output: 8, longContext: { aboveInputTokens: 100000, cacheMiss: 4, cacheHit: 1, output: 16 } }
    for (const key of ['output', 'cacheRead', 'cacheWrite', 'reasoning']) for (const value of [Infinity, -Infinity, NaN])
      assert.equal(costOf({ input: 1000, [key]: value }, rate, Date.now(), { enabled: false }), .002)
  })
  await check('inventory retries directories after an incomplete poll', async () => {
    const inventory = createBillionInventory(path), original = fs.promises.lstat
    fs.promises.lstat = async (target, ...args) => { if (target === join(root, 'calls')) throw ioError(); return original(target, ...args) }
    syncBuiltinESMExports()
    try { await assert.rejects(inventory.poll(), { code: 'EIO' }) }
    finally { fs.promises.lstat = original; syncBuiltinESMExports() }
    assert.equal((await inventory.poll()).streams.length, 1)
  })
  await check('stream read failures retry without blocking healthy records or duplicating charges', async () => {
    const healthy = { ...stream, streamId: randomUUID() }, healthyFile = billionStreamPath(root, healthy.sessionId, healthy.streamId)
    fs.writeFileSync(healthyFile, JSON.stringify(healthy))
    const archive = join(root, 'stream-archives', billionSessionKey(stream.sessionId), randomUUID() + '.jsonl.gz')
    fs.mkdirSync(join(archive, '..'), { recursive: true })
    fs.writeFileSync(archive, gzipSync(JSON.stringify({ ...stream, streamId: randomUUID() }) + '\n'))
    const original = fs.promises.readFile, effects = [], accounts = new Set()
    const ledger = { path, config: { billingStorageRetentionDays: 0 }, refresh() {}, advanceUsageCursor() {},
      account(_u, _m, _s, _at, _p, meter) { accounts.add(meter.source) } }
    fs.promises.readFile = async (target, ...args) => { if (target === file || target === archive) throw ioError(); return original(target, ...args) }
    syncBuiltinESMExports()
    const bridge = installBillionContextBilling({ effect: fn => effects.push(fn()), on() {}, get() {} }, ledger)
    try {
      await bridge.ingest()
      assert.equal(accounts.size, 1, 'healthy stream was imported')
      assert.equal(bridge.status().failed, true, 'disk failure remains visible')
      fs.promises.readFile = original; syncBuiltinESMExports()
      await bridge.ingest(); await bridge.ingest()
      assert.equal(accounts.size, 3, 'failed stream and archive were retried after recovery')
      assert.equal(bridge.status().failed, false)
    } finally {
      fs.promises.readFile = original; syncBuiltinESMExports()
      for (const dispose of effects.reverse()) dispose?.()
      await bridge.ingest()
    }
  })
  await check('archive sync failure preserves the original journal', async () => {
    const dir = join(directory, 'journals'); fs.mkdirSync(dir)
    const journal = join(dir, randomUUID() + '.sealed.jsonl'); fs.writeFileSync(journal, '{"seq":1}\n')
    const original = fs.promises.open
    fs.promises.open = async (target, ...args) => {
      const handle = await original(target, ...args)
      if (String(target).endsWith('.tmp')) handle.sync = async () => { throw ioError() }
      return handle
    }
    syncBuiltinESMExports()
    try { await assert.rejects(archiveSealedJournals(dir, { minAgeMs: 0, now: Date.now() + 1000 }), { code: 'EIO' }) }
    finally { fs.promises.open = original; syncBuiltinESMExports() }
    assert.equal(fs.readFileSync(journal, 'utf8'), '{"seq":1}\n')
    assert.deepEqual(fs.readdirSync(dir), [journal.slice(dir.length + 1)])
  })
  const source = { id: 'cancel-test', type: 'cliproxyapi', baseURL: 'http://127.0.0.1:8317', enabled: true, display: 'both', includeProviders: ['claude'] }
  const ctx = { get: () => ({ resolve: async () => ({ value: 'fixture-key' }) }) }
  for (const provider of ['workbuddy', 'gateway']) await check(provider + ' cancels a pending response body', async () => {
    const controller = new AbortController(); let cancelled = 0
    const fetchImpl = async () => {
      let timer
      return new Response(new ReadableStream({
        start(body) { timer = setTimeout(() => { body.enqueue(new TextEncoder().encode(JSON.stringify(provider === 'gateway' ? { auth_files: [] } : { accounts: [{ id: 'a', credits: 10 }] }))); body.close() }, 80) },
        cancel() { clearTimeout(timer); cancelled++ },
      }))
    }
    const pending = provider === 'gateway' ? queryGatewayQuota(ctx, source, { signal: controller.signal, fetchImpl })
      : fetchWorkBuddyAccounts('http://127.0.0.1:9999', { accountSource: 'connect' }, { signal: controller.signal, fetchImpl })
    const timer = setTimeout(() => controller.abort(), 10)
    try { await assert.rejects(pending, { name: 'AbortError' }); assert.ok(cancelled > 0) }
    finally { clearTimeout(timer) }
  })
  await check('gateway abort stops management backoff and queued accounts', async () => {
    for (const phase of ['management', 'accounts']) {
      const controller = new AbortController(); let calls = 0
      const pending = queryGatewayQuota(ctx, source, { signal: controller.signal, fetchImpl: async url => {
        if (phase === 'accounts' && new URL(url).pathname === GATEWAY_MANAGEMENT_PATHS.authFiles)
          return Response.json({ auth_files: Array.from({ length: 10 }, (_, i) => ({ auth_index: 'a' + i, provider: 'claude' })) })
        calls++; controller.abort()
        return Response.json({}, { status: 503 })
      } })
      await assert.rejects(pending, { name: 'AbortError' })
      assert.ok(calls <= (phase === 'management' ? 1 : 3), 'no subsequent retry or queued account request')
    }
  })
  const at = Date.now(), date = localDayKey(at), config = sanitizeConfig({ currency: 'USD', includeSubagentCost: false })
  const usage = { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, calls: 1, cost: 1, apiCost: 1 }
  const ledger = { config, days: { [date]: { ...usage, sessions: [{ id: 'one', title: 'One', ...usage }] } } }
  const query = { from: date, to: date, format: 'json' }
  const data = { sessions: [], locale: 'en' }
  await check('idle export expires without a subsequent API request', async () => {
    let active
    const exporter = createBillingExporter(ledger, {}, { ttlMs: 20, collect: async (_l, _c, _q, options) => { active = options.active; return data } })
    try { exporter.get(query); await delay(50); assert.equal(active(), false) }
    finally { exporter.dispose() }
  })
  await check('large single-conversation exports yield for cancellation and enforce a byte budget during collection', async () => {
    for (const mode of ['cancel', 'budget']) {
      let active = true, visited = 0
      const calls = Array.from({ length: 5000 }, () => ({ atMs: at, rows: [], get model() { visited++; return 'm'.repeat(300) } }))
      const detail = async () => { if (mode === 'cancel') setImmediate().then(() => { active = false }); return { calls } }
      await assert.rejects(collectBillingExport(ledger, {}, query, { detail, active: () => active, maxBytes: mode === 'budget' ? 10000 : undefined }), mode === 'cancel' ? /cancelled/ : /EXPORT_LIMIT/)
      assert.ok(visited < calls.length, 'stops before copying every call')
    }
  })
} finally { fs.rmSync(directory, { recursive: true, force: true }) }
if (errors.length) throw new AggregateError(errors, `${errors.length} I/O lifecycle regressions`)
