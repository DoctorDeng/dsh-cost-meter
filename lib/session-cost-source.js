/** Lightweight cache invalidation; conversation bodies are never read here. */
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { listSessionLogs } from './backfill.js'
import { sessionCostIds, readSessionHeaders } from './session-tree.js'
import { nativeSearchHistoryRoot } from './native-search-history.js'
import { billionSourcePaths } from './billion-context-history.js'

export async function sessionCostSource(ledger, ctx, sessionId) {
  const ids = await sessionCostIds(ledger, ctx, sessionId), home = resolveDshHome()
  const paths = listSessionLogs(join(home, 'sessions'), ids)
  const fileInfo = async path => { try { const info = await stat(path); return [path, info.size, info.mtimeMs] } catch { return [path, null] } }
  const live = [...ids].map(id => {
    const session = ctx?.get?.('sessions')?.get?.(id), records = session?.snapshotEvents?.()
    return [id, session?.header?.title, session?.header?.createdAt, Array.isArray(records) ? records.flatMap(row => {
      const data = row.data ?? {}
      if (!['turn/start', 'turn/end', 'step/start', 'request/header', 'assistant/message', 'compaction/summary', 'tool/call', 'tool/code-dispatch-start', 'tool/ptc-dispatch-start', 'cost-meter/native-search-usage'].includes(row.type) && !(row.type === 'assistant/chunk' && data.chunk?.type === 'usage')) return []
      return [[row.type, row.seq, row.time, data.turn, data.step, data.name, data.callId, data.subCallId, data.usage, data.chunk?.usage, data.provider, data.model, data.message?.source?.provider, data.message?.source?.model, data.requestId, data.startedAtMs, data.header?.config?.provider, data.header?.config?.model]]
    }) : null]
  })
  const native = ledger.path ? [...ids].map(id => join(nativeSearchHistoryRoot(ledger.path), createHash('sha256').update(id).digest('hex') + '.jsonl')) : []
  const headers = ledger.config?.includeSubagentCost ? (await readSessionHeaders(ctx)).filter(row => ids.has(row.id)) : []
  const proxy = [...ids].flatMap(id => billionSourcePaths(ledger.path, id))
  const recorded = Object.entries(ledger.days ?? {}).map(([date, day]) => [date, (day.sessions ?? []).filter(row => ids.has(row.id))]).filter(([, rows]) => rows.length)
  return createHash('sha256').update(JSON.stringify([live, headers, recorded, await Promise.all([...paths, ...native, ...proxy].map(fileInfo))])).digest('hex')
}

