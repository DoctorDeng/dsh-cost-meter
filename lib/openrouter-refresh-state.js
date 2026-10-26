import { readFileSync, statSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { withLedgerLock } from './ledger-persistence.js'

export const OPENROUTER_REFRESH_MS = 3600_000

/** A tiny sibling file keeps restart cooldown independent of ledger size and writes. */
export function createOpenRouterRefreshState(ledgerPath, now = Date.now) {
  const path = ledgerPath + '.openrouter-prices.json'
  const read = time => {
    let raw
    try {
      if (statSync(path).size <= 4096) raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error }
    const stamp = value => Number.isSafeInteger(value) && value > 0 && value <= time + OPENROUTER_REFRESH_MS ? value : 0
    return { fetchedAt: stamp(raw?.fetchedAt), attemptedAt: stamp(raw?.attemptedAt) }
  }
  const fresh = (state, time) => {
    const latest = Math.max(state.fetchedAt, state.attemptedAt)
    return latest > 0 && time - latest < OPENROUTER_REFRESH_MS
  }
  const update = change => withLedgerLock(path, () => {
    const time = now(), state = read(time)
    if (!change(state, time)) return false
    const temp = path + '.' + process.pid + '-' + randomUUID() + '.tmp'
    try {
      writeFileSync(temp, JSON.stringify(state), { encoding: 'utf8', flag: 'wx' })
      renameSync(temp, path)
    } finally {
      try { unlinkSync(temp) } catch (error) { if (error.code !== 'ENOENT') throw error }
    }
    return true
  }, 0)
  return {
    retryAfterMs() {
      const time = now(), state = read(time)
      return Math.max(0, OPENROUTER_REFRESH_MS - (time - Math.max(state.fetchedAt, state.attemptedAt)))
    },
    claim() {
      try {
        // A recent snapshot needs reads only, including no lock-file writes.
        const time = now()
        if (fresh(read(time), time)) return false
        return update((state, time) => {
          if (fresh(state, time)) return false
          // Persist before downloading, so failure or a killed host cannot reset the cooldown.
          state.attemptedAt = time
          return true
        })
      } catch (error) { if (error.code === 'EBUSY') return false; throw error }
    },
    success() {
      try { return update((state, time) => { state.fetchedAt = Math.max(state.fetchedAt, time); return true }) }
      catch (error) { if (error.code === 'EBUSY') return false; throw error }
    },
  }
}
