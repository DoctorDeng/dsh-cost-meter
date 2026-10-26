import assert from 'node:assert/strict'
import { createChatgptSubQuota } from '../lib/chatgpt-sub-quota.js'
import { piAiCodexQuotaSchema } from '../lib/typert.host.js'

const jwt = (account, exp = Math.floor(Date.now() / 1000) + 3600) => 'fixture.' + Buffer.from(JSON.stringify({ exp,
  'https://api.openai.com/auth': { chatgpt_account_id: account } })).toString('base64url') + '.synthetic-signature'
let access = jwt('synthetic-account'), enabled = true, calls = 0, reads = 0, mode = 'ok'
const payload = { rate_limit: {
  primary_window: { used_percent: 36, limit_window_seconds: 18000, reset_at: 1792404600 },
  secondary_window: { used_percent: 14, limit_window_seconds: 604800, reset_at: 1792887000 },
} }
const reader = createChatgptSubQuota({ get: name => {
  assert.equal(name, 'credentials')
  return { resolve: async key => { assert.equal(key, 'OPENAI_CODEX_API_KEY'); reads++; return { value: access, source: 'file' } } }
} }, { enabled: () => enabled, fetchImpl: async (url, init) => {
  calls++
  assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage')
  assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error')
  assert.equal(init.headers.authorization, 'Bearer ' + access)
  assert.equal(init.headers['ChatGPT-Account-Id'], mode === 'rotated' ? 'rotated-account' : 'synthetic-account')
  if (mode === '401') return Response.json({ error: access }, { status: 401 })
  if (mode === 'broken') throw Error(access)
  if (mode === 'large') return new Response('x'.repeat(262145))
  return Response.json(payload)
} })
const pending = reader.read()
assert.equal(reader.read(), pending, 'both quota positions share one host request')
const result = await pending
assert.deepEqual(piAiCodexQuotaSchema.parse(result), result)
assert.equal(result.windows.five.percent, 36); assert.equal(result.windows.weekly.percent, 14)
assert.equal(calls, 1); assert.equal(reads, 1)
assert.ok(!JSON.stringify(result).includes('synthetic-account'))
mode = 'rotated'; access = jwt('rotated-account'); assert.equal((await reader.read()).status, 'ok')
access = jwt('synthetic-account')
for (mode of ['401', 'broken', 'large']) {
  const error = await reader.read()
  assert.equal(error.status, 'error'); assert.ok(error.message.includes('dsh-chatgpt-sub'))
  assert.ok(!JSON.stringify(error).includes(access))
}
const before = calls
for (access of [undefined, '', 'not-a-jwt', 'bad\nheader', jwt(''), jwt('bad\raccount')]) assert.equal((await reader.read()).status, 'off')
access = jwt('synthetic-account', 1)
assert.equal((await reader.read()).status, 'error'); assert.equal(calls, before)
enabled = false
const beforeReads = reads
assert.equal((await reader.read()).status, 'off'); assert.equal(reads, beforeReads)
reader.dispose(); enabled = true; assert.equal((await reader.read()).status, 'off')

const keepAlive = setInterval(() => {}, 1000)
try {
  let release, lateFetches = 0
  const stalled = createChatgptSubQuota({ get: () => ({ resolve: () => new Promise(resolve => { release = resolve }) }) },
    { timeoutMs: 25, fetchImpl: () => { lateFetches++; return Response.json(payload) } })
  assert.equal((await stalled.read()).status, 'error')
  release({ value: jwt('synthetic-account'), source: 'file' }); await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(lateFetches, 0, 'credential resolution after timeout cannot start a late request')
  stalled.dispose()
  const hanging = createChatgptSubQuota({ get: () => ({ resolve: async () => ({ value: jwt('synthetic-account'), source: 'file' }) }) }, { fetchImpl: () => new Promise(() => {}) })
  const task = hanging.read(); await new Promise(resolve => setTimeout(resolve, 0)); hanging.dispose()
  assert.equal((await task).status, 'error', 'unload settles even if a transport ignores cancellation')
} finally { clearInterval(keepAlive) }
console.log('[ok] dsh-chatgpt-sub: own credential slot, account claim, dual quota, rotation, bounded failures, safe result and disposal; no external requests')
