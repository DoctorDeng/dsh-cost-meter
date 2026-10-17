/** Sanitized proxy call journals and explicit links to the host's original usage. */
import { createHash } from 'node:crypto'
import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, readdirSync, createReadStream } from 'node:fs'
import { join } from 'node:path'

export const BILLION_USAGE_EVENT = 'cost-meter/billion-context-usage'
export const BILLION_REPLACEMENT_EVENT = 'cost-meter/billion-context-replacement'
export const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
export const validSessionId = value => typeof value === 'string' && value.length > 0 && value.length <= 512
export const billionRoot = ledgerPath => ledgerPath + '.billion-context'
export const billionSessionKey = id => createHash('sha256').update(id).digest('hex')
export const billionStreamPath = (root, sessionId, streamId) => join(root, 'streams', billionSessionKey(sessionId), streamId + '.json')
const tokenKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'reasoningTokens']
export const usageOnly = usage => Object.fromEntries(tokenKeys.map(key => [key, usage?.[key] ?? 0]))
export const validUsage = usage => !!usage && tokenKeys.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)
export const usageSignature = usage => JSON.stringify(tokenKeys.map(key => usage?.[key] ?? 0))
export const usageBuckets = usage => Object.fromEntries(['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'].map((key, i) => [key, usage[tokenKeys[i]]]))

export function readBillionJson(path) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw Error('Invalid proxy billing metadata')
  return JSON.parse(readFileSync(path, 'utf8'))
}
export function writeBillionJson(path, value) {
  const parent = join(path, '..')
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  if (lstatSync(parent).isSymbolicLink()) throw Error('Unsafe proxy billing directory')
  const temp = path + '.' + process.pid + '.tmp'
  writeFileSync(temp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, path)
}
export function validBillionCall(row) {
  if (!row || row.protocol !== 1 || !uuid(row.source) || !uuid(row.callId) || !uuid(row.groupId) || !uuid(row.streamId)
    || !Number.isSafeInteger(row.seq) || row.seq < 1 || !validSessionId(row.sessionId)
    || !['model', 'compaction'].includes(row.kind) || !['complete', 'error', 'cancelled'].includes(row.status)
    || typeof row.complete !== 'boolean' || !Number.isSafeInteger(row.attempt) || row.attempt < 1 || row.attempt > 1000 || !Number.isFinite(row.startedAtMs) || row.startedAtMs <= 0
    || typeof row.model !== 'string' || !/^[\w./:@+-]{1,200}$/.test(row.model)
    || !(row.usage === null || validUsage(row.usage))) return false
  try { const url = new URL(row.upstream); return ['http:', 'https:'].includes(url.protocol) && url.origin === row.upstream } catch { return false }
}
function directories(path) {
  try { if (lstatSync(path).isSymbolicLink()) return []; return readdirSync(path, { withFileTypes: true }) } catch { return [] }
}
export function listBillionFiles(ledgerPath, sessionId) {
  if (!ledgerPath) return []
  const root = join(billionRoot(ledgerPath), 'calls')
  const sessions = sessionId ? [billionSessionKey(sessionId)] : directories(root).filter(row => row.isDirectory() && /^[a-f\d]{64}$/.test(row.name)).map(row => row.name)
  const files = []
  for (const key of sessions) for (const entry of directories(join(root, key))) {
    if (entry.isFile() && uuid(entry.name.replace(/\.jsonl$/, '')) && entry.name.endsWith('.jsonl')) files.push({ path: join(root, key, entry.name), key, source: entry.name.slice(0, -6) })
    if (files.length > 20000) throw Error('Proxy billing source limit exceeded')
  }
  return files
}
export function billionSourcePaths(ledgerPath, sessionId) {
  if (!ledgerPath) return []
  const streamRoot = join(billionRoot(ledgerPath), 'streams', billionSessionKey(sessionId))
  return [...listBillionFiles(ledgerPath, sessionId).map(row => row.path),
    ...directories(streamRoot).filter(row => row.isFile() && row.name.endsWith('.json') && uuid(row.name.slice(0, -5))).map(row => join(streamRoot, row.name))]
}
/** Bounded UTF-8 rows; offsets only advance through complete newline-terminated writes. */
export async function* iterateBillionCalls(file, start = 0) {
  const stat = lstatSync(file.path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024) throw Error('Invalid proxy billing journal')
  let pending = Buffer.alloc(0), dropping = false, offset = start
  for await (const chunk of createReadStream(file.path, { start, highWaterMark: 32 * 1024 })) {
    const bytes = Buffer.concat([pending, chunk]); let from = 0, end
    while ((end = bytes.indexOf(10, from)) >= 0) {
      const line = bytes.subarray(from, end); offset += end - from + 1; from = end + 1
      if (dropping) { dropping = false; continue }
      let row
      if (line.length > 0 && line.length <= 4096) { try { row = JSON.parse(line.toString('utf8')) } catch {} }
      if (row && validBillionCall(row) && row.source === file.source && billionSessionKey(row.sessionId) === file.key) yield { row, offset }
    }
    pending = bytes.subarray(from)
    if (pending.length > 4096) { offset += pending.length; pending = Buffer.alloc(0); dropping = true }
  }
}
const providerHosts = { 'api.deepseek.com': 'deepseek-official', 'api.openai.com': 'openai', 'chatgpt.com': 'codex', 'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'google', 'openrouter.ai': 'openrouter', 'api.z.ai': 'zai', 'open.bigmodel.cn': 'zhipu', 'api.moonshot.cn': 'moonshot', 'api.kimi.com': 'kimi',
  'api.minimax.io': 'minimax', 'api.minimaxi.com': 'minimax', 'api.siliconflow.cn': 'siliconflow', 'amr-link.open-design.ai': 'opendesign' }
export function billionProvider(row, stream) {
  if (row.kind === 'model' && row.model === stream?.model && typeof stream.provider === 'string' && stream.provider) return stream.provider
  const host = new URL(row.upstream).hostname
  return providerHosts[host] ?? host
}
export function readBillionStream(ledgerPath, row) {
  try {
    const stream = readBillionJson(billionStreamPath(billionRoot(ledgerPath), row.sessionId, row.streamId))
    return stream.protocol === 1 && stream.streamId === row.streamId && stream.sessionId === row.sessionId ? stream : null
  } catch { return null }
}
export async function billionRecordsFor(ledgerPath, sessionId) {
  const records = [], streams = new Map(), seen = new Set()
  for (const file of listBillionFiles(ledgerPath, sessionId)) for await (const { row } of iterateBillionCalls(file)) {
    if (!row.usage || seen.has(row.callId)) continue
    const stream = readBillionStream(ledgerPath, row)
    if (!stream?.finished || !['full', 'partial'].includes(stream.policies?.[row.groupId])) continue
    seen.add(row.callId); streams.set(stream.streamId, stream)
    records.push({ type: BILLION_USAGE_EVENT, time: row.startedAtMs, data: { provider: billionProvider(row, stream), model: row.model, usage: row.usage,
      startedAtMs: row.startedAtMs, requestId: row.callId, kind: row.kind, turn: stream.turn ?? null, step: stream.step ?? null,
      metering: { source: 'billion-context', requestId: row.callId, attempt: row.attempt, complete: row.complete, status: row.status, upstream: row.upstream } } })
    if (records.length > 200000) throw Error('Proxy billing detail limit exceeded')
  }
  for (const stream of streams.values()) if (stream.covered && validUsage(stream.reported)) records.push({ type: BILLION_REPLACEMENT_EVENT, data: {
    streamId: stream.streamId, sourceSeqs: stream.sourceSeqs ?? [], turn: stream.turn ?? null, step: stream.step ?? null, usage: stream.reported,
    provider: stream.provider, model: stream.model } })
  return records
}
export function excludeBillionReportedUsage(records) {
  const replacements = records.filter(row => row.type === BILLION_REPLACEMENT_EVENT).map(row => row.data)
  if (!replacements.length) return records
  return records.filter(row => {
    const usage = row.type === 'assistant/message' || row.type === 'compaction/summary' ? row.data?.usage
      : row.type === 'assistant/chunk' && row.data?.chunk?.type === 'usage' ? row.data.chunk.usage : null
    if (!usage) return true
    return !replacements.some(replacement => replacement.sourceSeqs.includes(row.seq) || (replacement.step != null && replacement.turn != null
      && row.data?.turn === replacement.turn && row.data?.step === replacement.step && (row.type === 'assistant/chunk' || usageSignature(usage) === usageSignature(replacement.usage))
      && (!row.data?.message?.source?.model || row.data.message.source.model === replacement.model)))
  })
}
