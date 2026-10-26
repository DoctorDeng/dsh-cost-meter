import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { billionRoot, billionSessionKey, billionStreamPath, writeBillionJson } from '../lib/billion-context-history.js'

const baseline = process.argv.includes('--baseline'), count = Number(process.env.CM_STREAM_BENCHMARK_FILES) || 512
const module = baseline ? await import('../.tmp-baseline-billing.mjs') : await import('../lib/billion-context-billing.js')
const dir = mkdtempSync(join(tmpdir(), 'cm-inventory-397-')), path = join(dir, 'ledger.json'), root = billionRoot(path), effects = [], accounts = []
const ctx = { effect: fn => effects.push(fn()), on() {}, get() {} }
const ledger = { path, config: { billingStorageRetentionDays: 0 }, refresh() {}, account(...args) { accounts.push(args) }, advanceUsageCursor() {} }
const statSync = fs.statSync, asyncStat = fs.promises.lstat, now = Date.now
const targetFile = file => /[\\/]streams[\\/][a-f\d]{64}[\\/].+\.json$/.test(String(file))
const streams = []
let ticks = 0, maxGap = 0, last = performance.now(), timer, bridge
try {
  for (let i = 0; i < count; i++) {
    const stream = { protocol: 1, streamId: randomUUID(), sessionId: 'session-' + i % 38, finished: true, covered: false,
      model: 'main', provider: 'fixture', startedAtMs: now() - 1000, policies: {}, sourceSeqs: [], coverage: { version: 1, mode: 'proxy', known: 0, unknown: 0 } }
    const file = billionStreamPath(root, stream.sessionId, stream.streamId)
    mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(stream)); streams.push({ stream, file })
  }
  bridge = module.installBillionContextBilling(ctx, ledger)
  await bridge.ingest()
  let syncFiles = 0, asyncFiles = 0
  fs.statSync = (file, ...args) => { if (targetFile(file)) { syncFiles++; if (baseline) { const until = performance.now() + .25; while (performance.now() < until) {} } }; return statSync(file, ...args) }
  fs.promises.lstat = async (file, ...args) => { if (targetFile(file)) asyncFiles++; return asyncStat(file, ...args) }
  syncBuiltinESMExports()
  // Trigger the old 30-second forced rescan without waiting or changing real files.
  Date.now = () => now() + 31000
  timer = setInterval(() => { ticks++; const at = performance.now(); maxGap = Math.max(maxGap, at - last); last = at }, 5)
  last = performance.now()
  const start = performance.now(); await bridge.ingest(); const wallMs = performance.now() - start
  await new Promise(resolve => setTimeout(resolve, 15)); clearInterval(timer)
  if (baseline) assert.equal(syncFiles, count)
  else {
    assert.equal(syncFiles, 0, 'periodic inventory never statSyncs stream files')
    assert.equal(asyncFiles, 0, 'unchanged directories do not restat completed streams')
    assert.ok(ticks > 0)
    const old = streams[0], usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }
    writeBillionJson(old.file, { ...old.stream, reported: usage, coverage: { version: 1, mode: 'host', known: 0, unknown: 0 } })
    await bridge.ingest()
    assert.equal(accounts.length, 1, 'atomic replacement in a previously idle directory is discovered')
    assert.equal(syncFiles, 0)
    assert.ok(asyncFiles < count / 2, 'only the changed session is rescanned')
    const afterChange = asyncFiles
    await bridge.ingest()
    assert.equal(asyncFiles, afterChange, 'the updated directory returns to idle')
    assert.equal(accounts.length, 1)
    // A malformed or oversized metadata file must not block another stream's
    // once-per-stream fallback, or enter a perpetual idle retry loop.
    writeBillionJson(old.file, { ...old.stream, padding: 'x'.repeat(9000) })
    const next = streams[1]
    writeBillionJson(next.file, { ...next.stream, reported: usage, coverage: { version: 1, mode: 'host', known: 0, unknown: 0 } })
    await bridge.ingest()
    assert.equal(accounts.length, 2)
    const afterMalformed = asyncFiles
    await bridge.ingest()
    assert.equal(asyncFiles, afterMalformed)
  }
  console.log('[ok] #397 inventory ' + JSON.stringify({ implementation: baseline ? 'v1.9.33' : 'fixed', files: count, simulatedStatMs: baseline ? .25 : 0,
    idleWallMs: +wallMs.toFixed(2), maxEventLoopGapMs: +maxGap.toFixed(2), idleSyncStats: baseline ? syncFiles : 0, idleAsyncStats: 0 }))
} finally {
  clearInterval(timer); Date.now = now; fs.statSync = statSync; fs.promises.lstat = asyncStat; syncBuiltinESMExports()
  for (const dispose of effects.reverse()) dispose?.()
  await bridge?.ingest()
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
