// Desktop workers do not inherit the DSH resolver. Use a directory with no
// node_modules and exercise the shipped worker, failure and disposal paths.
import assert from 'node:assert/strict'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Ledger, sanitizeConfig } from '../lib/store.js'
import { startLedgerWrite } from '../lib/ledger-writer.js'

const work = mkdtempSync(join(tmpdir(), 'cm-isolated-worker-')), ledgers = []
const warnings = [], warn = console.warn
console.warn = (...args) => warnings.push(args.join(' '))
const calls = path => Object.values(JSON.parse(readFileSync(path, 'utf8')).days).reduce((n, row) => n + row.calls, 0)
const account = (ledger, name) => ledger.account({ input: 100, output: 50 }, 'deepseek-v4-flash', name, Date.now(), 'deepseek')
const make = (name, options, writer = (payload, receive) => startLedgerWrite(payload, receive, options)) => {
  const ledger = new Ledger(sanitizeConfig({}), {}, join(work, name + '.json'), [], {
    backgroundWriter: writer,
  })
  ledgers.push(ledger)
  account(ledger, name)
  return ledger
}
try {
  const worker = join(work, 'worker.mjs')
  copyFileSync(new URL('../lib/ledger-writer-worker.js', import.meta.url), worker)
  const isolated = make('isolated', { workerUrl: pathToFileURL(worker) })
  await isolated.flushAsync()
  assert.equal(isolated.pendingWrite, false, 'shipped worker runs without host peers or a module loader')
  assert.equal(calls(isolated.path), 1)

  const broken = join(work, 'broken.mjs')
  writeFileSync(broken, 'import "@deepseek-ai/dsh-home-paths"')
  let attempts = 0
  const failed = make('failed-import', undefined, (payload, receive) => {
    attempts++
    return startLedgerWrite(payload, receive, { workerUrl: pathToFileURL(broken) })
  })
  const failedWrite = failed.flushAsync()
  account(failed, 'during-failure')
  await failedWrite
  assert.equal(calls(failed.path), 2, 'worker failure saves both pending and intervening usage without closing')
  assert.equal(failed.pendingWrite, false)
  const warningCount = warnings.length
  assert.equal(warningCount, 1, 'an unavailable worker emits one warning')
  account(failed, 'after-failure')
  const scheduledUntil = performance.now() + 4000
  while (failed.pendingWrite && performance.now() < scheduledUntil) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(failed.pendingWrite, false, 'the routine save timer continues after worker failure')
  assert.equal(calls(failed.path), 3)
  assert.equal(attempts, 1, 'later routine writes do not restart the broken worker')
  assert.equal(warnings.length, warningCount, 'later writes do not repeat the warning')
  await failed.close()

  let spawnAttempts = 0
  const spawnFailed = make('failed-spawn', undefined, () => { spawnAttempts++; throw new Error('synthetic worker startup failure') })
  await spawnFailed.flushAsync()
  account(spawnFailed, 'after-spawn-failure'); await spawnFailed.flushAsync()
  assert.equal(calls(spawnFailed.path), 2, 'synchronous startup failure also preserves subsequent writes')
  assert.equal(spawnAttempts, 1)
  assert.equal(warnings.length, warningCount + 1)

  const busy = join(work, 'busy.mjs')
  writeFileSync(busy, `import { workerData } from 'node:worker_threads';
    workerData.port.postMessage({ error: { code: 'EBUSY', message: 'Ledger busy' } }); workerData.port.close()`)
  let busyAttempts = 0
  const contended = make('contended', undefined, (payload, receive) => startLedgerWrite(payload, receive, {
    workerUrl: pathToFileURL(busyAttempts++ === 0 ? busy : worker),
  }))
  await contended.flushAsync()
  assert.equal(contended.pendingWrite, true, 'temporary contention keeps the write pending')
  await contended.flushAsync()
  assert.equal(busyAttempts, 2, 'temporary contention does not disable a healthy worker')
  assert.equal(calls(contended.path), 1)
  assert.equal(warnings.length, warningCount + 1, 'normal contention does not warn')

  const closing = make('failed-import-close', { workerUrl: pathToFileURL(broken) })
  let ticks = 0
  const heartbeat = setInterval(() => { ticks++ }, 5)
  const start = performance.now()
  closing.flushAsync()
  await closing.close()
  clearInterval(heartbeat)
  assert.ok(performance.now() - start < 2000, 'worker import failure cannot block close for the old 8-second synchronous wait')
  assert.ok(ticks > 0, 'the host loop stays responsive while unloading')
  assert.equal(calls(closing.path), 1, 'final synchronous write preserves usage after worker failure')

  const stalled = join(work, 'stalled.mjs')
  writeFileSync(stalled, 'setInterval(() => {}, 1000)')
  const timed = make('timed-out', { workerUrl: pathToFileURL(stalled), timeoutMs: 100 })
  const timeoutStart = performance.now()
  await timed.flushAsync()
  assert.ok(performance.now() - timeoutStart < 2000, 'a silent worker cannot keep disposal pending forever')
  assert.equal(calls(timed.path), 1, 'bounded failure preserves the pending transaction once')
  assert.equal(timed.pendingWrite, false, 'timeout falls back without requiring shutdown')
  const locked = join(work, 'locked.mjs')
  writeFileSync(locked, `import { workerData } from 'node:worker_threads';
    import { withLedgerLock } from ${JSON.stringify(new URL('../lib/ledger-persistence.js', import.meta.url).href)};
    withLedgerLock(workerData.path, () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10000), 5000, workerData.lockId)`)
  const killed = make('killed-with-lock', { workerUrl: pathToFileURL(locked), timeoutMs: 500 })
  const lockedStart = performance.now()
  killed.flushAsync()
  while (!existsSync(killed.path + '.lock') && performance.now() - lockedStart < 2000) await new Promise(resolve => setTimeout(resolve, 5))
  assert.ok(existsSync(killed.path + '.lock'), 'fixture worker really owns the ledger lock')
  await killed.close()
  assert.equal(existsSync(killed.path + '.lock'), false, 'termination releases only the stopped worker lock')
  assert.equal(calls(killed.path), 1, 'lock recovery permits the final write without dropping usage')
  console.log('[ok] standalone worker; failed import/startup/timeout falls back once; scheduled saves, lock contention and responsive close retain all usage')
} finally {
  for (const ledger of ledgers) await ledger.close()
  console.warn = warn
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
