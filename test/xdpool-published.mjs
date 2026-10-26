// Execute unmodified status/route functions from the pinned published package.
// Isolate them from unrelated model-provider imports, plugin startup and automation.
import assert from 'node:assert/strict'
import { parse } from 'acorn'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { queryCodingPlan } from '../lib/coding-plans.js'

const root = resolve(process.env.DSH_TEST_XDPOOL_DIR ?? '.tmp-xdpool-published/package')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(pkg.name, 'dsh-xdpool'); assert.equal(pkg.version, '2.4.6')
const source = readFileSync(join(root, 'lib/index.js'), 'utf8'), ast = parse(source, { sourceType: 'module', ecmaVersion: 'latest' })
const names = ['poolWebStatus', 'registerPoolStatusRoute', 'toWebAccount', 'toWebModel', 'json', 'loopbackOrigin', 'safeMessage', 'emptyAutomationJob', 'isGatewayRejectionError']
const nodes = ast.body.filter(node => node.type === 'FunctionDeclaration' && names.includes(node.id?.name)
  || node.type === 'VariableDeclaration' && node.declarations.every(d => /^(POOL_|GATEWAY_REJECTION_MESSAGE$)/.test(d.id?.name) && d.init?.type === 'Literal'))
assert.equal(nodes.filter(node => node.type === 'FunctionDeclaration').length, names.length, 'all executed helper functions come from the published artifact')
const temp = mkdtempSync(join(tmpdir(), 'cm-xdpool-published-')), path = join(temp, 'status.mjs')
writeFileSync(path, 'import { basename } from "node:path";\n' + nodes.map(node => source.slice(node.start, node.end)).join('\n') + '\nexport { registerPoolStatusRoute };\n')
const { registerPoolStatusRoute } = await import(pathToFileURL(path).href)
const account = (id, region) => ({ id, label: region + ' ' + id, credential: { id, region, domain: region === 'cn' ? 'codebuddy.cn' : 'workbuddy.ai', accessToken: 'PRIVATE-TOKEN', expiresAtMs: 0 }, modelCooldowns: {}, cooldownUntilMs: 0, rateLimitHits: 0 })
const cn = [account('a', 'cn'), account('b', 'cn')], global = [account('a', 'global')], balances = { 'cn:a': 100, 'cn:b': 20, 'global:a': 0 }
let unavailable = false
const routes = new Map(), requests = [], stops = [], measured = []
const catalog = { currentSelection: () => ({}), current: () => [], currentSource: () => 'fixture', catalogUpdatedAt: () => undefined, lastFetchError: () => undefined }
const originalFetch = globalThis.fetch
globalThis.fetch = () => assert.fail('no external request or model probe is allowed')
let server
try {
  registerPoolStatusRoute({ effect: fn => { stops.push(fn()) }, webServer: { register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) } } }, {
    pool: { list: region => region === 'cn' ? cn : global, preferredId: () => undefined, lastServedId: () => 'a',
      isDisabled: () => false, creditReserveOf: () => 0, isReserved: () => false, noteCredits() {}, clearCredentialDead() {},
      currentDistribution: () => 'priority', creditReservesInOrder: () => [], skippedFilesInOrder: () => [] },
    catalogs: { cn: catalog, global: catalog }, client: {
      fetchCredits: async credential => { measured.push('credits:' + credential.region + ':' + credential.id); if (unavailable && credential.region === 'cn' && credential.id === 'a') throw Error('PRIVATE-UPSTREAM'); return { total: balances[credential.region + ':' + credential.id], packages: [] } },
      fetchCheckinStatus: async () => { measured.push('read-checkin'); return { active: false } },
    },
  })
  assert.ok(routes.has('/plugins/dsh-xdpool/status'))
  server = createServer((req, res) => {
    requests.push({ path: new URL(req.url, 'http://localhost').pathname, method: req.method, auth: req.headers.authorization })
    const handler = routes.get(new URL(req.url, 'http://localhost').pathname)
    if (!handler) { res.writeHead(404); res.end('{}'); return }
    Promise.resolve(handler(req, res)).catch(error => { res.writeHead(500); res.end(JSON.stringify({ error: error.message })) })
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const key = { hostOrigin: 'http://127.0.0.1:' + server.address().port, readFile: () => assert.fail('no desktop credential reads') }
  const query = options => queryCodingPlan('workbuddy', key, 'zh', (_, code) => code, { workbuddyConfig: options })
  assert.equal((await query({})).windows.balance.text, '100', 'automatic discovery uses the actual status route')
  assert.equal((await query({ accountSource: 'xdpool', accountScope: 'all' })).windows.balance.text, '120')
  assert.equal((await query({ accountSource: 'xdpool', accountScope: 'selected', accountIds: ['cn:xdpool:b'] })).windows.balance.text, '20')
  unavailable = true
  const partial = await query({ accountSource: 'xdpool', accountScope: 'all' })
  assert.equal(partial.windows.balance.text, '—'); assert.equal(partial.workbuddy.knownRemaining, 20)
  assert.equal(partial.workbuddy.unknownCount, 1)
  assert.doesNotMatch(JSON.stringify(partial), /PRIVATE-TOKEN|PRIVATE-UPSTREAM/)
  unavailable = false; cn[0].cooldownUntilMs = Date.now() + 3600000
  assert.equal((await query({ accountSource: 'xdpool' })).workbuddy.accounts.find(a => a.id === 'cn:xdpool:a').remaining, null)
  assert.ok(measured.some(row => row === 'credits:global:a'))
  assert.ok(requests.every(row => row.method === 'GET' && row.auth === undefined))
  assert.ok(requests.every(row => ['/plugins/dsh-connect-workbuddy/account-credits', '/plugins/dsh-xdpool/status'].includes(row.path)))
  console.log('[ok] published dsh-xdpool ' + pkg.version + ': actual status route and serializers, two regions, automatic/current/all/selected, missing/cooling credits, no credentials or mutations')
} finally {
  for (const stop of stops.reverse()) stop?.()
  globalThis.fetch = originalFetch
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)) }
  rmSync(temp, { recursive: true, force: true })
}
