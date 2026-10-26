import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Ledger, sanitizeConfig } from '../lib/store.js'
import { createOpenRouterPriceRefresh } from '../lib/openrouter-pricing.js'
import { createOpenRouterRefreshState, OPENROUTER_REFRESH_MS } from '../lib/openrouter-refresh-state.js'

const filename = fileURLToPath(import.meta.url)
if (process.argv[2] === '--claim') {
  process.send('ready')
  process.once('message', () => {
    process.send(createOpenRouterRefreshState(process.argv[3], () => Number(process.argv[4])).claim())
    process.disconnect()
  })
} else {
  const root = mkdtempSync(join(tmpdir(), 'cm-openrouter-restart-')), ledgers = [], controllers = [], children = []
  let clock = Date.parse('2026-10-23T00:00:00Z'), calls = 0, bad = false
  const path = join(root, 'ledger.json'), metadata = path + '.openrouter-prices.json'
  const open = () => {
    const ledger = Ledger.load(path); ledgers.push(ledger)
    const refresh = createOpenRouterPriceRefresh(ledger, { now: () => clock, fetchImpl: async () => {
      calls++
      return bad ? new Response('broken JSON') : Response.json({ data: [{ id: 'vendor/live', pricing: { prompt: '0.000002', completion: '0.000003' } }] })
    } }); controllers.push(refresh)
    return { ledger, ...refresh }
  }
  try {
    const initial = new Ledger(sanitizeConfig({}), {}, path); initial.scheduleWrite(); initial.close()
    const first = open()
    await first.refresh({ automatic: true })
    assert.equal(calls, 1)
    assert.deepEqual(JSON.parse(readFileSync(metadata)), { attemptedAt: clock, fetchedAt: clock })
    const snapshot = readFileSync(path), state = readFileSync(metadata), ledgerTime = statSync(path).mtimeMs, stateTime = statSync(metadata).mtimeMs
    first.dispose(); first.ledger.close()
    for (let n = 0; n < 4; n++) {
      clock += 11400
      const restarted = open()
      assert.equal((await restarted.refresh({ automatic: true })).skipped, true)
      assert.equal(restarted.ledger.config.prices.providers.openrouter.models['vendor/live'].cacheMiss, 2)
      restarted.dispose(); restarted.ledger.close()
    }
    assert.equal(calls, 1)
    assert.deepEqual(readFileSync(path), snapshot)
    assert.deepEqual(readFileSync(metadata), state)
    assert.equal(statSync(path).mtimeMs, ledgerTime, 'cooldown startup does not write the ledger')
    assert.equal(statSync(metadata).mtimeMs, stateTime, 'cooldown startup does not rewrite metadata')

    const manual = open()
    await manual.refresh()
    assert.equal(calls, 2, 'manual sync bypasses automatic cooldown')
    clock += OPENROUTER_REFRESH_MS - 1
    const almostDue = await manual.refresh({ automatic: true })
    assert.equal(almostDue.skipped, true)
    assert.equal(almostDue.retryAfterMs, 1, 'schedule the remaining cooldown instead of delaying another full hour')
    clock++
    await manual.refresh({ automatic: true })
    assert.equal(calls, 3, 'automatic refresh resumes at the exact hourly boundary')
    const success = JSON.parse(readFileSync(metadata)).fetchedAt, prices = structuredClone(manual.ledger.config.prices)
    clock += OPENROUTER_REFRESH_MS; bad = true
    await assert.rejects(manual.refresh({ automatic: true }))
    assert.equal(calls, 4)
    assert.equal(JSON.parse(readFileSync(metadata)).fetchedAt, success, 'failure cannot replace the successful timestamp')
    assert.deepEqual(manual.ledger.config.prices, prices)
    manual.dispose(); manual.ledger.close()
    clock += 11400
    const failedRestart = open()
    assert.equal((await failedRestart.refresh({ automatic: true })).skipped, true, 'failed or interrupted attempts retain cooldown across restart')
    assert.equal(calls, 4)
    failedRestart.dispose(); failedRestart.ledger.close()

    // Reported restart cadence over about 13.7 hours, using the actual durable guard.
    const stormPath = join(root, 'storm.json'), start = clock
    let claims = 0
    for (let n = 0; n < 4300; n++) {
      clock = start + n * 11400
      if (createOpenRouterRefreshState(stormPath, () => clock).claim()) claims++
    }
    assert.equal(claims, 14, '4,300 restart attempts admit 14 automatic refreshes, including failures')

    const parallelPath = join(root, 'parallel.json')
    const jobs = Array.from({ length: 4 }, () => {
      const child = fork(filename, ['--claim', parallelPath, String(clock)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true }); children.push(child)
      const ready = new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject) })
      const result = ready.then(() => new Promise((resolve, reject) => { child.once('message', resolve); child.once('error', reject) }))
      const done = new Promise((resolve, reject) => { child.once('exit', code => code === 0 ? resolve() : reject(Error('claim worker failed: ' + code))) })
      return { child, ready, result, done }
    })
    await Promise.all(jobs.map(job => job.ready))
    for (const job of jobs) job.child.send('go')
    assert.equal((await Promise.all(jobs.map(job => job.result))).filter(Boolean).length, 1, 'parallel hosts share one atomic refresh claim')
    await Promise.all(jobs.map(job => job.done))
    for (const invalid of ['{broken', JSON.stringify({ fetchedAt: 'tomorrow', attemptedAt: 1e100 }), JSON.stringify({ fetchedAt: clock + 10 * OPENROUTER_REFRESH_MS })]) {
      writeFileSync(parallelPath + '.openrouter-prices.json', invalid)
      assert.equal(createOpenRouterRefreshState(parallelPath, () => clock).claim(), true, 'invalid metadata cannot suppress updates permanently')
    }
    console.log('[ok] #384: persisted hourly cooldown, restart snapshot reuse without writes, manual override, failure backoff, 4,300 restarts -> 14 claims, parallel hosts and invalid metadata')
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill()
    for (const controller of controllers) controller.dispose()
    for (const ledger of ledgers) ledger.close()
    assert.equal(dirname(root), tmpdir())
    rmSync(root, { recursive: true, force: true })
  }
}
