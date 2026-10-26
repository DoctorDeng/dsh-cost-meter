import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { performance } from 'node:perf_hooks'
import { Ledger, sanitizeConfig } from '../lib/store.js'
import { startLedgerWrite } from '../lib/ledger-writer.js'

const dir = mkdtempSync(join(tmpdir(), 'cm-writer-fixed-')), ledgers = []
const fresh = name => { const ledger = new Ledger(sanitizeConfig({}), {}, join(dir, name, 'ledger.json')); ledgers.push(ledger); return ledger }
const load = path => { const ledger = Ledger.load(path); ledgers.push(ledger); return ledger }
const call = (ledger, id) => ledger.account({ input: 100, output: 50 }, 'deepseek-v4-flash', id, Date.now(), 'deepseek')
const persistedCalls = path => Object.values(JSON.parse(readFileSync(path)).days).reduce((n, day) => n + day.calls, 0)
try {
  const a = fresh('normal')
  call(a, 'first')
  const write = a.flushAsync()
  call(a, 'during-write')
  await write; await a.flushAsync()
  assert.equal(persistedCalls(a.path), 2)
  assert.equal(a.pendingWrite, false)
  call(a, 'close-barrier'); a.flushAsync(); await a.close()
  assert.equal(persistedCalls(a.path), 3, 'close joins a worker instead of replaying committed calls twice')

  const b = fresh('peers'); call(b, 'seed'); b.flush()
  const c = load(b.path), d = load(b.path)
  call(c, 'c'); call(d, 'd')
  await Promise.all([c.flushAsync(), d.flushAsync()])
  assert.equal(persistedCalls(b.path), 3, 'concurrent background transactions retain both hosts')
  call(c, 'next-c'); call(d, 'next-d')
  c.flushAsync(); d.flush()
  await c.close(); await d.close()
  assert.equal(persistedCalls(b.path), 5)

  const reset = fresh('reset'); call(reset, 'old')
  const oldWrite = reset.flushAsync()
  reset.resetHistory(); call(reset, 'after-reset')
  await oldWrite; await reset.flushAsync()
  assert.equal(persistedCalls(reset.path), 1)
  const peer = load(reset.path); assert.equal(peer.sumDays().input, 100)

  const settings = fresh('settings'); call(settings, 'a')
  const writing = settings.flushAsync()
  settings.config.historyDays = 45; settings.scheduleWrite()
  await writing; await settings.flushAsync()
  assert.equal(JSON.parse(readFileSync(settings.path)).config.historyDays, 45)
  assert.equal(persistedCalls(settings.path), 1)

  let recoveredWrites = 0
  const lostAck = new Ledger(sanitizeConfig({}), {}, join(dir, 'lost-ack', 'ledger.json'), [], {
    backgroundWriter: (payload, receive) => {
      recoveredWrites++
      return startLedgerWrite(payload, () => receive({ error: { message: 'synthetic lost acknowledgement' } }))
    },
  })
  ledgers.push(lostAck)
  call(lostAck, 'once'); await lostAck.flushAsync()
  assert.equal(lostAck.pendingWrite, false)
  call(lostAck, 'twice'); await lostAck.flushAsync(); lostAck.flush()
  assert.equal(persistedCalls(lostAck.path), 2, 'an atomic commit with a lost worker acknowledgement is recovered, not replayed twice')
  assert.equal(recoveredWrites, 2, 'a recovered receipt keeps the working background writer enabled')

  const large = fresh('performance'), base = { input: 100, output: 50, cacheRead: 1000, cacheWrite: 0, reasoning: 0, calls: 1, cost: .1, apiCost: .1 }
  for (let n = 0; n < 100; n++) {
    const date = new Date(Date.UTC(2026, 4, 1 + n)).toISOString().slice(0, 10)
    const sessions = Array.from({ length: 100 }, (_, i) => ({ id: `${n}-${i}`, ...base, byProviderModel: { 'fixture:m': { ...base } } }))
    const totals = Object.fromEntries(Object.entries(base).map(([k, value]) => [k, value * sessions.length]))
    large.days[date] = { date, ...totals, byProviderModel: { 'fixture:m': { ...totals } }, sessions }
  }
  large.pendingWrite = true
  let ticks = 0, maxDelayMs = 0, last = performance.now()
  const heartbeat = setInterval(() => { const now = performance.now(); maxDelayMs = Math.max(maxDelayMs, now - last - 5); last = now; ticks++ }, 5)
  const started = performance.now(), task = large.flushAsync(), kickoffMs = performance.now() - started
  await task; clearInterval(heartbeat)
  assert.ok(ticks >= 2, 'main loop continues while the complete ledger is saved')
  assert.equal(persistedCalls(large.path), 10000)
  const metrics = { syntheticSessionRows: 10000, kickoffMs: Math.round(kickoffMs), maxEventLoopDelayMs: Math.round(maxDelayMs), wallMs: Math.round(performance.now() - started), heartbeatTicks: ticks }
  if (process.env.CM_REVIEW_PERF_FILE) { mkdirSync(dirname(process.env.CM_REVIEW_PERF_FILE), { recursive: true }); writeFileSync(process.env.CM_REVIEW_PERF_FILE, JSON.stringify(metrics, null, 2)) }
  console.log('[perf]', JSON.stringify(metrics))
} finally { for (const ledger of ledgers) await ledger.close(); rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
console.log('[ok] background ledger: intervening calls/settings/reset, two hosts, sync close barrier and responsive saving')
