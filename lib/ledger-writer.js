/** Serialize daily writes in a worker; explicit flush/close can join the same transaction. */
import { Worker, MessageChannel, receiveMessageOnPort } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { unlinkSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'

export function startLedgerWrite(payload, receive, { timeoutMs = 15000, workerUrl = new URL('./ledger-writer-worker.js', import.meta.url) } = {}) {
  const { port1, port2 } = new MessageChannel()
  const signal = new Int32Array(new SharedArrayBuffer(4))
  let finished = false, resolve, timeoutError, workerError
  const lockId = randomUUID()
  const promise = new Promise(done => { resolve = done })
  const worker = new Worker(workerUrl, {
    workerData: { ...payload, signal, port: port2, lockId }, transferList: [port2], execArgv: [],
  })
  const finish = message => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    try { receive(message) }
    finally { port1.close(); void worker.terminate(); resolve() }
  }
  // A stalled worker must settle so disposal cannot hold the reload queue.
  // Terminate it before reporting failure; the caller can then safely retry.
  const timer = setTimeout(() => {
    timeoutError = { error: { message: 'Ledger worker timed out', code: 'ETIMEDOUT' } }
    void worker.terminate().then(() => finish(timeoutError))
  }, timeoutMs)
  timer.unref?.()
  port1.on('message', finish)
  worker.on('error', error => { workerError = { error: { message: error.message, code: error.code } } })
  worker.on('exit', code => {
    if (finished) return
    // A terminated thread shares our PID, so ordinary dead-process recovery
    // cannot release its lock. Remove only this worker's unique owner, after exit.
    try { unlinkSync(join(`${payload.path}.lock`, `${process.pid}-${lockId}`)); rmdirSync(`${payload.path}.lock`) } catch {}
    finish(receiveMessageOnPort(port1)?.message ?? timeoutError ?? workerError ?? { error: { message: `Ledger worker exited (${code})` } })
  })
  return { promise, wait(timeoutMs = 8000) {
    const until = Date.now() + timeoutMs
    while (!finished) {
      const result = receiveMessageOnPort(port1)
      if (result) { finish(result.message); break }
      if (Date.now() >= until) return false
      Atomics.wait(signal, 0, 0, Math.min(50, until - Date.now()))
    }
    return true
  } }
}
