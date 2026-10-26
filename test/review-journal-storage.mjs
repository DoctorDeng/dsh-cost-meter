import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { gzipSync } from 'node:zlib'
import { mkdtempSync, rmSync, appendFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { recordNativeSearchUsage, nativeSearchRecordsFor, listNativeSearchHistory, nativeSearchHistoryRoot } from '../lib/native-search-history.js'
import { JOURNAL_SEGMENT_BYTES, archiveSealedJournals, journalChunks } from '../lib/journal-storage.js'

const dir = mkdtempSync(join(tmpdir(), 'cm-journals-fixed-')), path = join(dir, 'ledger.json')
try {
  const event = () => ({ model: 'deepseek-v4-flash', provider: 'deepseek-official', startedAtMs: Date.now(), requestId: randomUUID(),
    usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } })
  const a = event(), b = event()
  recordNativeSearchUsage(path, 'session', a)
  const active = listNativeSearchHistory(path)[0]
  appendFileSync(active, '\n' + 'x'.repeat(JOURNAL_SEGMENT_BYTES) + '\n')
  recordNativeSearchUsage(path, 'session', b)
  const root = nativeSearchHistoryRoot(path)
  assert.equal(listNativeSearchHistory(path).length, 2)
  assert.equal((await nativeSearchRecordsFor(path, 'session')).length, 2)
  const sealed = readdirSync(root).find(name => name.endsWith('.sealed.jsonl'))
  const original = readFileSync(join(root, sealed))
  assert.equal(await archiveSealedJournals(root, { minAgeMs: 0 }), 1)
  const compressed = join(root, sealed + '.gz'), chunks = []
  for await (const chunk of journalChunks(compressed, original.length - 100)) chunks.push(chunk)
  assert.deepEqual(Buffer.concat(chunks), original.subarray(original.length - 100), 'archived readers preserve the uncompressed byte offset')
  assert.equal((await nativeSearchRecordsFor(path, 'session')).length, 2, 'archive retains historical details')
  recordNativeSearchUsage(path, 'session', a)
  assert.equal((await nativeSearchRecordsFor(path, 'session')).length, 2, 'request identities deduplicate across active and compressed segments')
  assert.equal(await archiveSealedJournals(root, { minAgeMs: 0 }), 0, 'active journal is not archived')
  assert.equal(listNativeSearchHistory(path, new Set(['session'])).length, 0)
  const racePath = join(dir, 'race.json')
  recordNativeSearchUsage(racePath, 'race', a)
  const raceActive = listNativeSearchHistory(racePath)[0]
  const raceSealed = raceActive.slice(0, -6) + '.' + randomUUID() + '.sealed.jsonl'
  fs.renameSync(raceActive, raceSealed)
  recordNativeSearchUsage(racePath, 'race', b)
  const lstat = fs.lstatSync
  let moved = false
  fs.lstatSync = (file, ...args) => {
    if (file === raceSealed && !moved) {
      moved = true
      writeFileSync(raceSealed + '.gz', gzipSync(readFileSync(raceSealed)))
      fs.unlinkSync(raceSealed)
    }
    return lstat(file, ...args)
  }
  syncBuiltinESMExports()
  try {
    assert.equal((await nativeSearchRecordsFor(racePath, 'race')).length, 2, 'archival between inventory and open refreshes paths without losing cost history')
    assert.equal(moved, true)
  } finally { fs.lstatSync = lstat; syncBuiltinESMExports() }
  writeFileSync(compressed, Buffer.alloc(4))
  await assert.rejects(() => nativeSearchRecordsFor(path, 'session'), /Invalid archived/)
} finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
console.log('[ok] journals: size rotation, safe sealed-only compression, transparent history and offsets, cross-segment dedup')
