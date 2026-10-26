import { workerData } from 'node:worker_threads'
import { statSync } from 'node:fs'
import { Ledger } from '../lib/store.js'
import { withLedgerLock, writeLedger, mergeLedger, cleanWriteReceipts } from '../lib/ledger-persistence.js'
import { repairDailySessionTotals } from '../lib/ledger-totals.js'

const revisionOf = path => {
  try { const info = statSync(path, { bigint: true }); return `${info.ino}:${info.mtimeNs}:${info.size}` }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
const { path, base, local, pending, repairs, revision, backupHistory, transactionId, now, port, signal, lockId } = workerData
try {
  const result = withLedgerLock(path, () => {
    const sameDisk = revisionOf(path) === revision
    const repaired = repairDailySessionTotals(local.days)
    if (repaired.includes(local.balanceRef?.date)) local.balanceRef = null
    const ownDisk = sameDisk && !repairs.length && !repaired.length
    let merged = local
    if (!ownDisk) {
      const reader = new Ledger(local.config, {}, path, [], { pricingHistory: local.pricingHistory })
      reader.writeBase = base
      merged = mergeLedger(base, local, reader.readDiskSnapshot(), pending, now, repairs, { ownLocal: true })
    }
    merged.writeReceipts = cleanWriteReceipts([...(merged.writeReceipts ?? []), transactionId])
    writeLedger(path, merged, backupHistory)
    return { ownDisk, ...(ownDisk ? {} : { merged }), writeReceipts: merged.writeReceipts, revision: revisionOf(path) }
  }, 5000, lockId)
  port.postMessage(result)
} catch (error) { port.postMessage({ error: { message: String(error?.message ?? error), code: error?.code } }) }
finally { Atomics.store(signal, 0, 1); Atomics.notify(signal, 0); port.close() }
