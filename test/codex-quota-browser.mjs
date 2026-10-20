// Shipped client + real DSH Connection RPC; quota/account data are synthetic.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'

const modules = resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-context-host/node_modules')
const req = createRequire(join(modules, '__quota.cjs'))
const host = createRequire(join(resolve(process.env.DSH_TEST_NODE_MODULES ?? modules), '__quota.cjs'))
const { chromium } = req('playwright-core')
const executablePath = process.env.CM_TEST_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const connectionManifest = process.env.DSH_TEST_CONNECTION_MANIFEST ?? host.resolve('@deepseek-ai/dsh-client-connection/package.json')
const connectionExport = JSON.parse(readFileSync(connectionManifest, 'utf8')).exports['./client']
const connectionEntry = typeof connectionExport === 'string' ? connectionExport : connectionExport.browser ?? connectionExport.default
const connectionSource = readFileSync(resolve(dirname(connectionManifest), connectionEntry), 'utf8')
const state = { config: sanitizeConfig({ locale: 'zh', codexQuotaEnabled: true, codexQuotaSource: 'subscription', peakEnabled: false,
  hideOfficialBalance: true, sidebar: false, hideTodayCost: true, goQuota: { enabled: false }, budget: { enabled: false }, quotaStrip: { enabled: true, budget: false, go: false, plans: false } }),
  codingPlans: { workbuddy: { status: 'ok', message: '', fetchedAt: 0, windows: { balance: { text: '1,117', resetsAt: '' } } } },
  today: zeroDay(), month: zeroDay(), total: zeroDay(), history: [] }
const code = `
import React from ${JSON.stringify(req.resolve('react'))};
import {createRoot} from ${JSON.stringify(req.resolve('react-dom/client'))};
window.__ModuleLoader__={load:mod=>window.connectionUI=mod.factory(()=>({}))};
${connectionSource}
const costRequire=name=>name==='react'?React:{Tooltip:({children})=>children};
costRequire.async=async path=>{if(path!=='./client.codex.js')throw Error('Unexpected chunk');return window.codexUI};
window.__ModuleLoader__={load:mod=>window.codexUI=mod.factory(costRequire)};
${readFileSync('lib/client.codex.js', 'utf8')}
window.__ModuleLoader__={load:mod=>window.costUI=mod.factory(costRequire)};
${readFileSync('lib/client.js', 'utf8')}
let state=${JSON.stringify(state)};const entries=new Map(),disposers=[];const services={};
const context={fiber:{uid:1},remote:{$mount:async()=>()=>{}},on:()=>()=>{},inject:(names,fn)=>{if(names.every(name=>services[name]))fn(context)},provide:(name,value)=>services[name]=value,
 effect:fn=>{const cleanup=fn();if(typeof cleanup==='function')disposers.push(cleanup);return cleanup},get:name=>services[name]};
connectionUI.installConnection(context);
services['remote.costMeter']={getLocalState:async()=>({ok:true,value:state}),getState:async()=>({ok:true,value:state}),
 updateConfig:async patch=>{state={...state,config:{...state.config,...patch}};return{ok:true,value:state}}};
services.slots={entries:()=>[],inject:(name,fn)=>fn(),register:(options,component)=>{entries.set(options.name+':'+options.id,{options,component});return()=>{}}};
await costUI.apply(context);
await new Promise(resolve=>setTimeout(resolve,0));
const slot=entries.get('sidebar.footer.action:cost-meter'),stripSlot=entries.get('conversation.input.dock:cost-meter-qstrip'),injected=slot.options.inject(),store=injected.hooks.cost;
function useCost(pick){return pick(React.useSyncExternalStore(store.subscribe,store.getSnapshot))}
window.configure=patch=>injected.api.updateConfig(patch);
window.dispose=()=>{root.unmount();for(const fn of disposers.reverse())fn()};
function App(){const[wide,setWide]=React.useState(true);window.setWide=setWide;return React.createElement(React.Fragment,null,React.createElement(slot.component,{...injected,useCost,wide}),React.createElement('div',{id:'composer'},React.createElement(stripSlot.component,{...injected,useCost})))}
const root=createRoot(document.getElementById('root'));root.render(React.createElement(App));
`
const compiled = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'esm', platform: 'browser' })
let signedIn = false, hasFive = true, reset = Date.parse('2026-10-25T00:10:00Z') / 1000
const calls = [], chatgptCalls = []
let chatgptSignedIn = false, chatgptHasFive = true
const server = createServer(async (request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); return response.end(compiled.outputFiles[0].contents) }
  if (request.url === '/api/codex-subscription/usage') {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const message = JSON.parse(Buffer.concat(chunks)); calls.push(message)
    assert.equal(message.type, 'client-request'); assert.equal(message.method, 'codex-subscription/usage')
    response.setHeader('content-type', 'application/json')
    return response.end(JSON.stringify({ type: 'server-response', rpcId: message.rpcId, result: signedIn
      ? { ok: true, value: { rateLimits: [{ id: 'codex', windows: [...hasFive ? [{ windowSeconds: 18000, remainingPercent: 60, resetsAt: Date.parse('2026-10-19T10:10:00Z') / 1000 }] : [], { windowSeconds: 604800, remainingPercent: 83, resetsAt: reset }] }] } }
      : { ok: false, error: { code: 'internal', message: 'ChatGPT subscription is not signed in', details: { issues: [] } } } }))
  }
  if (request.url === '/api/dsh-chatgpt-subscription/status' || request.url === '/api/dsh-chatgpt-subscription/quota/refresh') {
    const force = request.url.endsWith('/quota/refresh')
    assert.equal(request.method, force ? 'POST' : 'GET')
    chatgptCalls.push({ force })
    const quota = { state: chatgptSignedIn ? 'ready' : 'signed-out', buckets: [{ id: 'codex', windows: [
      ...chatgptHasFive ? [{ usedPercent: 66, windowDurationMins: 300, resetsAt: 1792404600 }] : [],
      { usedPercent: 21, windowDurationMins: 10080, resetsAt: 1792887000 },
    ] }] }
    response.setHeader('content-type', 'application/json')
    return response.end(JSON.stringify(force ? chatgptSignedIn ? { ok: true, value: quota } : { ok: false } : { ok: true, value: { authenticated: chatgptSignedIn, quota } }))
  }
  if (request.url !== '/') { response.statusCode = 404; return response.end() }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html><head><meta charset="utf-8"><style>${readFileSync('test/fixtures/peak-theme.css', 'utf8')}body{margin:0;padding:24px}#root{width:280px}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 600, height: 400 }, timezoneId: 'Asia/Shanghai' })
const errors = [], external = []
page.on('pageerror', error => errors.push(String(error)))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); return route.abort() }
  return route.continue()
})
const output = resolve('.tmp-codex-quota-browser'); mkdirSync(output, { recursive: true })
try {
  await page.clock.install()
  await page.goto(origin)
  const card = page.locator('[data-cm-display="codex"]')
  await card.getByText(/未取得额度/).waitFor()
  assert.equal(calls.length, 1, 'card and sidebar share the real Connection request')
  await page.screenshot({ path: join(output, 'unavailable.png') })
  signedIn = true
  await page.clock.fastForward(61_000)
  await card.getByText('剩余 60%', { exact: true }).waitFor()
  await card.getByText('剩余 83%', { exact: true }).waitFor()
  await page.locator('#composer').getByText(/周 剩余 83%/).waitFor()
  await card.locator('.cm-codex-resets').getByText('5h · 10/19 18:10 重置', { exact: true }).waitFor()
  await card.locator('.cm-codex-resets').getByText('7d · 10/25 08:10 重置', { exact: true }).waitFor()
  assert.equal(await card.locator('.cm-mm-row .cm-bbox-fill').evaluateAll(nodes => nodes.map(n => n.style.width).join(',')), '60%,83%')
  assert.equal(calls.length, 2, 'sign-in recovers through the real RPC without remounting')
  await page.screenshot({ path: join(output, 'quota-dual.png') })
  const layouts = []
  const checkLayout = async (locale, mode, theme, width, rows) => {
    await page.evaluate(({ locale, mode, theme, width }) => {
      document.documentElement.dataset.theme = theme
      document.getElementById('root').style.width = width + 'px'
      return window.configure({ locale, sidebarSimple: mode === 'simple', sidebarStyle: mode === 'compact' ? 'compact' : 'standard' })
    }, { locale, mode, theme, width })
    const values = await card.evaluate(node => {
      const box = node.getBoundingClientRect(), head = node.querySelector('.cm-codex-head').getBoundingClientRect(), reset = node.querySelector('.cm-codex-resets').getBoundingClientRect()
      return { overflow: node.scrollWidth > node.clientWidth, right: box.right - parseFloat(getComputedStyle(node).paddingRight) - reset.right,
        top: Math.abs(head.top - reset.top), bars: [...node.querySelectorAll('.cm-mm-row .cm-bbox-bar')].map(n => n.getBoundingClientRect().width),
        firstRowTop: node.querySelector('.cm-mm-row').getBoundingClientRect().top, headBottom: head.bottom }
    })
    assert.equal(values.overflow, false, [locale, mode, theme, width].join('/'))
    assert.ok(Math.abs(values.right) <= 2 && values.top <= 2, 'reset times stay at the top right: ' + JSON.stringify(values))
    assert.ok(values.bars.length === rows && values.bars.every(width => width >= 25), 'all actual windows retain visible progress bars: ' + JSON.stringify(values))
    assert.ok(values.firstRowTop >= values.headBottom, 'reset times do not overlap the progress rows')
    layouts.push({ locale, mode, theme, width, rows })
    if (width === 324 && locale === 'zh') await page.screenshot({ path: join(output, `progress-${theme}-${mode}-${rows}.png`) })
  }
  for (const locale of ['zh', 'en']) for (const mode of ['standard', 'compact', 'simple']) for (const theme of ['light', 'dark']) for (const width of [324, 280, 200]) await checkLayout(locale, mode, theme, width, 2)
  await page.evaluate(() => window.configure({ locale: 'zh', sidebarSimple: false, sidebarStyle: 'standard' }))
  hasFive = false
  await card.click(); await page.waitForFunction(() => document.querySelector('[data-cm-display="codex"]').getAttribute('aria-busy') === 'false')
  assert.doesNotMatch(await card.innerText(), /5h/, 'weekly-only accounts never render a 5h row')
  assert.equal(await page.locator('#composer .cm-qseg').count(), 1, 'weekly-only accounts render exactly one composer segment')
  assert.equal(calls.at(-1).payload.force, true)
  await card.locator('.cm-codex-resets').getByText('10/25 08:10 重置', { exact: true }).waitFor()
  for (const mode of ['standard', 'compact', 'simple']) for (const theme of ['light', 'dark']) await checkLayout('zh', mode, theme, 324, 1)
  await page.screenshot({ path: join(output, 'quota.png') })
  await page.evaluate(() => window.configure({ barDirections: { plan: 'used' } }))
  await card.getByText('剩余 83%', { exact: true }).waitFor()
  await page.evaluate(() => { document.getElementById('root').style.width = '200px' })
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.screenshot({ path: join(output, 'quota-narrow.png') })
  await page.evaluate(() => window.configure({ locale: 'en' }))
  await card.getByText('83% remaining', { exact: true }).waitFor()
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.screenshot({ path: join(output, 'quota-en.png') })
  await page.evaluate(() => window.setWide(false))
  await card.getByText('83% remaining', { exact: true }).waitFor()
  assert.equal(await card.evaluate(node => node.scrollWidth <= node.clientWidth), true)
  await page.evaluate(() => window.setWide(true))
  for (const missing of [null, 'invalid']) {
    reset = missing
    await card.click(); await page.waitForFunction(() => document.querySelector('[data-cm-display="codex"]').getAttribute('aria-busy') === 'false')
    assert.equal(await card.locator('.cm-codex-resets > span').count(), 0, 'missing or invalid reset times do not invent a date')
    assert.equal(await card.locator('.cm-mm-row .cm-bbox-fill').evaluate(node => node.style.width), '83%')
  }
  await page.evaluate(() => window.configure({ codexQuotaStrip: false }))
  await page.locator('#composer .cm-qchip').waitFor({ state: 'detached' })
  assert.equal(await card.count(), 1, 'composer switch keeps the sidebar')
  await page.evaluate(() => window.configure({ codexQuotaStrip: true, codexQuotaSidebar: false }))
  await card.waitFor({ state: 'detached' })
  await page.locator('#composer').getByText('83% remaining', { exact: true }).waitFor()
  await page.evaluate(() => window.configure({ codexQuotaStrip: false }))
  await page.locator('#composer .cm-qchip').waitFor({ state: 'detached' })
  const count = calls.length
  await page.clock.fastForward(360_000)
  assert.equal(calls.length, count, 'hiding both surfaces stops quota reads without changing the enabled account')
  await page.evaluate(() => window.configure({ sidebarSimple: false, sidebarStyle: 'standard', codingPlans: { workbuddy: { enabled: true, display: 'sidebar' } } }))
  const workbuddy = page.locator('[data-cm-plan="workbuddy"]')
  await workbuddy.waitFor()
  assert.equal((await workbuddy.innerText()).split('1,117').length - 1, 1, 'WorkBuddy balance appears once')
  assert.match(await workbuddy.locator('.cm-mm-title').innerText(), /WorkBuddy[\s\S]*1,117/)
  await page.evaluate(() => window.configure({ locale: 'zh' }))
  assert.match(await workbuddy.innerText(), /WorkBuddy 积分/)
  await workbuddy.screenshot({ path: join(output, 'workbuddy-balance.png') })
  await page.evaluate(() => window.configure({ codingPlans: { workbuddy: { enabled: false, display: 'sidebar' } } }))
  await workbuddy.waitFor({ state: 'detached' })
  const oldCalls = calls.length
  await page.evaluate(() => window.configure({ codexQuotaSource: 'chatgpt', codexQuotaSidebar: true, codexQuotaStrip: true }))
  await card.getByText(/未取得额度/).waitFor()
  assert.equal(chatgptCalls.length, 1, 'both display positions share one ChatGPT status read')
  chatgptSignedIn = true
  await page.clock.fastForward(61_000)
  await card.getByText('剩余 34%', { exact: true }).waitFor()
  await card.getByText('剩余 79%', { exact: true }).waitFor()
  await page.locator('#composer').getByText(/周 剩余 79%/).waitFor()
  assert.equal(calls.length, oldCalls, 'explicit ChatGPT quota never reads the other subscription account')
  assert.equal(await card.locator('.cm-mm-row .cm-bbox-fill').evaluateAll(nodes => nodes.map(n => n.style.width).join(',')), '34%,79%')
  await card.screenshot({ path: join(output, 'chatgpt-quota-dual.png') })
  chatgptHasFive = false
  await card.click(); await page.waitForFunction(() => document.querySelector('[data-cm-display="codex"]').getAttribute('aria-busy') === 'false')
  assert.equal(chatgptCalls.at(-1).force, true, 'click uses the ChatGPT refresh endpoint')
  assert.doesNotMatch(await card.innerText(), /5h/)
  assert.equal(await page.locator('#composer .cm-qseg').count(), 1)
  chatgptSignedIn = false
  await card.click(); await card.getByText(/未取得额度/).waitFor()
  assert.equal(calls.length, oldCalls, 'a signed-out explicit source keeps its retry entry')
  chatgptSignedIn = true
  await card.click(); await card.getByText('剩余 79%', { exact: true }).waitFor()
  signedIn = false
  const chatgptCount = chatgptCalls.length
  await page.evaluate(() => window.configure({ codexQuotaSource: 'auto' }))
  await page.waitForFunction(() => document.querySelector('[data-cm-display="codex"]').getAttribute('aria-busy') === 'false')
  await card.getByText('剩余 79%', { exact: true }).waitFor()
  assert.equal(calls.length, oldCalls + 1, 'auto first checks the original subscription RPC')
  assert.equal(chatgptCalls.length, chatgptCount + 1, 'auto recovers through ChatGPT when the first source is signed out')
  await card.screenshot({ path: join(output, 'chatgpt-quota-weekly.png') })
  await page.evaluate(() => window.configure({ codexQuotaSidebar: false, codexQuotaStrip: false }))
  const stopped = chatgptCalls.length
  await page.clock.fastForward(360_000)
  assert.equal(chatgptCalls.length, stopped, 'hiding both ChatGPT quota positions stops reads')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  writeFileSync(join(output, 'result.json'), JSON.stringify({ passed: true, calls: calls.length, chatgptCalls, layouts, remainingBars: true, resetTopRight: true, weeklyOnly: true, missingReset: true, externalRequests: 0, browserErrors: errors }, null, 2))
  await page.evaluate(() => window.dispose())
  console.log('[ok] Codex quota: shipped assets, DSH Connection RPC and ChatGPT HTTP, login recovery, both windows, source fallback and disable cleanup')
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
