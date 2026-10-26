import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { fetchWorkBuddyAccounts } from '../lib/workbuddy-accounts.js'
import { queryCodingPlan } from '../lib/coding-plans.js'
import { applyConfigPatch, sanitizeConfig } from '../lib/store.js'
import { billingClassOf, planProviderIdOf, enabledPlanSetOf } from '../lib/plan-billing.js'

const cn = () => ({ ok: true, region: 'cn', activeAccountId: 'a', accounts: [
  { id: 'a', label: '国内 A', credits: { total: 100 }, accessToken: 'PRIVATE-TOKEN' },
  { id: 'b', label: '国内 B', credits: { total: 20 } },
] })
let bodies = { cn: cn(), global: { ok: true, region: 'global', activeAccountId: 'a', accounts: [{ id: 'a', label: '国际 A', credits: { total: 0 } }] } }
let connector = false, failRegion = '', missing = false
const requests = [], server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost'), region = url.searchParams.get('region')
  requests.push({ path: url.pathname, region, method: req.method, auth: req.headers.authorization })
  res.setHeader('content-type', 'application/json')
  if (url.pathname === '/plugins/dsh-connect-workbuddy/account-credits' && connector) {
    res.end(JSON.stringify({ accounts: region === 'cn' ? [{ id: 'a', accountName: 'Connector A', credits: 999, selected: true }] : [] })); return
  }
  if (url.pathname !== '/plugins/dsh-xdpool/status' || missing) { res.writeHead(404); res.end('{}'); return }
  if (region === failRegion) { res.writeHead(503); res.end('{"error":"PRIVATE-UPSTREAM"}'); return }
  res.end(JSON.stringify(bodies[region]))
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const hostOrigin = 'http://127.0.0.1:' + server.address().port, key = { hostOrigin, readFile: () => assert.fail('pool data must not read desktop credentials') }
const text = (_, value) => value
const query = config => queryCodingPlan('workbuddy', key, 'zh', text, { workbuddyConfig: config })
try {
  const auto = await fetchWorkBuddyAccounts(hostOrigin)
  assert.equal(auto.knownRemaining, 100, 'current uses the pool active account in each region, including zero')
  assert.deepEqual(auto.selectedIds, ['cn:xdpool:a', 'global:xdpool:a'])
  assert.equal(auto.accounts.length, 3)
  assert.ok(auto.accounts[0].name.startsWith('XD Pool · '))
  assert.doesNotMatch(JSON.stringify(auto), /PRIVATE-TOKEN/)
  assert.equal((await query({ accountScope: 'all' })).windows.balance.text, '120')
  assert.equal((await query({ accountSource: 'xdpool', accountScope: 'selected', accountIds: ['cn:xdpool:b'] })).windows.balance.text, '20')
  const gone = await fetchWorkBuddyAccounts(hostOrigin, { accountSource: 'xdpool', accountScope: 'selected', accountIds: ['cn:a'] })
  assert.equal(gone.unknownCount, 1, 'connector account selection cannot accidentally select a pool account with the same raw ID')
  connector = true
  assert.equal((await query({ accountScope: 'all' })).windows.balance.text, '999', 'automatic preserves the existing connector priority')
  assert.equal((await query({ accountSource: 'xdpool', accountScope: 'all' })).windows.balance.text, '120', 'explicit source never adds another connector balance')
  const before = requests.length
  assert.equal((await query({ accountSource: 'connect', accountScope: 'all' })).windows.balance.text, '999')
  assert.ok(requests.slice(before).every(row => !row.path.includes('xdpool')))
  failRegion = 'global'
  const partial = await query({ accountSource: 'xdpool', accountScope: 'all' })
  assert.equal(partial.windows.balance.text, '—')
  assert.equal(partial.workbuddy.knownRemaining, 120)
  assert.equal(partial.workbuddy.incomplete, true)
  assert.doesNotMatch(JSON.stringify(partial), /PRIVATE-UPSTREAM/)
  failRegion = ''
  for (const bad of [null, -1, '0', undefined]) {
    bodies.cn.accounts[0].credits = { total: bad }
    const result = await query({ accountSource: 'xdpool', accountScope: 'current' })
    assert.equal(result.windows.balance.text, '—')
    assert.equal(result.workbuddy.unknownCount, 1)
  }
  bodies.cn = cn(); bodies.cn.accounts[0].creditsError = 'PRIVATE-UPSTREAM'
  assert.equal((await query({ accountSource: 'xdpool' })).workbuddy.accounts[0].remaining, null)
  bodies.cn = cn(); bodies.cn.ok = false; bodies.cn.accounts[0].cooling = true; delete bodies.cn.accounts[0].credits
  assert.equal((await query({ accountSource: 'xdpool' })).windows.balance.text, '—', 'cooling without fresh credits is unknown, never zero')
  bodies.cn = cn(); bodies.cn.accounts.push({ ...bodies.cn.accounts[0] })
  assert.equal((await query({ accountSource: 'xdpool' })).workbuddy.incomplete, true, 'duplicate IDs do not inflate the balance')
  bodies = { cn: { ok: false, region: 'cn', accounts: [] }, global: { ok: false, region: 'global', accounts: [] } }
  assert.equal((await query({ accountSource: 'xdpool' })).windows.balance.text, '—', 'an empty pool does not fall back to a different desktop login')
  missing = true
  await assert.rejects(query({ accountSource: 'xdpool' }), error => error.soft && error.message === 'workbuddyConnectUnavailable')
  await assert.rejects(fetchWorkBuddyAccounts(undefined, { accountSource: 'xdpool' }), error => error.code === 'workbuddyConnectUnavailable')
  for (const value of ['https://example.com', 'http://example.com', hostOrigin + '/other']) await assert.rejects(fetchWorkBuddyAccounts(value), error => error.code === 'workbuddyConnectUnavailable')
  const abort = new AbortController(); abort.abort()
  await assert.rejects(fetchWorkBuddyAccounts(hostOrigin, { accountSource: 'xdpool' }, { signal: abort.signal }), error => error.name === 'AbortError')
  const config = sanitizeConfig({ codingPlans: { workbuddy: { enabled: true, accountSource: 'xdpool' } } })
  assert.equal(config.codingPlans.workbuddy.accountSource, 'xdpool')
  assert.ok(applyConfigPatch(config, { codingPlans: { workbuddy: { accountSource: 'wrong' } } }).errors.length)
  assert.equal(sanitizeConfig({ codingPlans: { workbuddy: { accountSource: 'wrong' } } }).codingPlans.workbuddy.accountSource, 'auto')
  for (const route of ['xdpool', 'xdpool-global']) {
    assert.equal(planProviderIdOf(route), 'workbuddy')
    assert.equal(billingClassOf(route, 'm', config.planBilling, enabledPlanSetOf(config)), 'plan')
  }
  for (const route of ['xdpool-aggregate', 'xdpool-router', 'xdpool-channel-openai', 'xdpool-oauth-openai']) assert.equal(planProviderIdOf(route), null, 'other XD Pool products are not WorkBuddy credits')
  assert.ok(requests.every(row => row.method === 'GET' && row.auth === undefined))
  assert.ok(requests.every(row => ['/plugins/dsh-connect-workbuddy/account-credits', '/plugins/dsh-xdpool/status'].includes(row.path)))
  console.log('[ok] #404 XD Pool: CN/global credits, current/all/selected, source priority, identity isolation, partial/zero/failed/cooling data, safe fields, source validation and exact billing aliases')
} finally { server.closeAllConnections(); await new Promise(done => server.close(done)) }
