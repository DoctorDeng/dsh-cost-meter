import { fetchWorkBuddyLocal, workBuddyOrigin } from './workbuddy-transport.js'
import { fetchWithRetry, readJsonBounded } from './net.js'

export const validWorkBuddyAccountId = id => typeof id === 'string' && /^(cn|global):[^\s\u0000-\u001f\u007f]{1,256}$/.test(id)
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** Published local GET endpoints only; selection and credentials stay with the peer. */
async function readAccounts(origin, source, { signal, fetchImpl }) {
  return Promise.all(['cn', 'global'].map(async region => {
    try {
      const path = source === 'xdpool' ? '/plugins/dsh-xdpool/status' : '/plugins/dsh-connect-workbuddy/account-credits'
      const response = await fetchWithRetry(new URL(path + '?region=' + region, origin),
        { method: 'GET', redirect: 'error', signal }, { attempts: 1, timeoutMs: 35000, fetchImpl })
      if (response.status === 404 || response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel?.(); return { missing: true } }
      if (!response.ok) { await response.body?.cancel?.(); return { failed: true } }
      const body = await readJsonBounded(response, 262144, { signal })
      signal?.throwIfAborted()
      if (source === 'xdpool' && (!['cn', 'global'].includes(body?.region) || typeof body.ok !== 'boolean')) return { missing: true }
      if (!Array.isArray(body?.accounts) || body.accounts.length > 200) return { failed: true }
      if (source === 'xdpool' && body.region !== region) return { failed: true }
      const seen = new Set(), accounts = []
      for (const row of body.accounts) {
        const id = region + ':' + (source === 'xdpool' ? 'xdpool:' : '') + row?.id
        if (!validWorkBuddyAccountId(id) || typeof row?.id !== 'string' || seen.has(id)) return { failed: true }
        seen.add(id)
        const name = source === 'xdpool' ? row.label : row.accountName
        const credits = source === 'xdpool' ? row.creditsError || row.credentialDead === true ? null : row.credits?.total : row.credits
        accounts.push({ id, region, name: typeof name === 'string' ? (source === 'xdpool' ? 'XD Pool · ' + name : name).slice(0, 160) : '',
          current: source === 'xdpool' ? row.id === body.activeAccountId : row.selected === true,
          remaining: amount(credits) ? credits : null })
      }
      return { accounts }
    } catch { signal?.throwIfAborted(); return { failed: true } }
  }))
}

export async function fetchWorkBuddyAccounts(hostOrigin, config = {}, { signal, fetchImpl = fetchWorkBuddyLocal } = {}) {
  signal?.throwIfAborted()
  const source = config.accountSource ?? 'auto'
  const unavailable = () => Object.assign(new Error('workbuddyConnectUnavailable'), { code: 'workbuddyConnectUnavailable' })
  if (!hostOrigin) { if (source === 'xdpool') throw unavailable(); return null }
  const origin = workBuddyOrigin(hostOrigin), options = { signal, fetchImpl }
  let usingPool = source === 'xdpool'
  let results = await readAccounts(origin, usingPool ? 'xdpool' : 'connect', options)
  signal?.throwIfAborted()
  if (source === 'auto' && !results.some(row => row.accounts?.length)) {
    const pool = await readAccounts(origin, 'xdpool', options)
    if (pool.some(row => row.accounts?.length) || !results.some(row => row.accounts) && pool.some(row => !row.missing)) { results = pool; usingPool = true }
  }
  // An older connector has no account list; its selected-account route remains usable.
  if (!results.some(result => result.accounts)) { if (usingPool) throw unavailable(); return null }
  const accounts = results.flatMap(result => result.accounts ?? [])
  const scope = ['all', 'selected'].includes(config.accountScope) ? config.accountScope : 'current'
  const ids = new Set(Array.isArray(config.accountIds) ? config.accountIds : [])
  if (scope === 'selected') for (const id of ids) if (validWorkBuddyAccountId(id) && !accounts.some(row => row.id === id)) {
    accounts.push({ id, region: id.split(':')[0], name: '', current: false, remaining: null })
  }
  const selected = accounts.filter(row => scope === 'all' || (scope === 'current' ? row.current : ids.has(row.id)))
  const known = selected.filter(row => row.remaining !== null)
  return { scope, accounts, selectedIds: selected.map(row => row.id),
    knownRemaining: known.reduce((sum, row) => sum + row.remaining, 0),
    unknownCount: selected.length - known.length,
    incomplete: results.some(result => result.failed || usingPool && result.missing), fetchedAt: Date.now() }
}
