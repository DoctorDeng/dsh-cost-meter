// Shipped settings + lazy preview: real draft/autosave, synthetic data, no external requests.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, applyConfigPatch, zeroDay } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'
import { javascriptLiteral as literal } from '../scripts/javascript-literal.mjs'

const modules = resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-pr240-host/node_modules')
const req = createRequire(join(modules, '__display.cjs'))
const { chromium } = req('playwright-core')
const executablePath = process.env.CM_TEST_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const output = resolve('.tmp-display-review'); mkdirSync(output, { recursive: true })
let saved = sanitizeConfig({ locale: 'zh', exchangeRate: 1, currency: 'CNY', symbol: '¥', sidebarSimple: false, budget: { enabled: true, amount: 100 },
  sidebarModels: { enabled: true }, goQuota: { enabled: false }, quotaStrip: { enabled: true, budget: true, go: false, plans: true }, peakEnabled: true, peakNotice: true, position: 'off' })
const client = readdirSync('src/client').filter(n => n.endsWith('.js')).sort().map(n => readFileSync('src/client/' + n, 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.preview = { CostSection, parseConfig, SidebarFooter }; exports.apply = apply')
const day = { ...zeroDay(), cost: 1.28, apiCost: 1.28 }
const state = { config: saved, today: day, month: day, total: day, history: [], balance: { status: 'error', message: 'Synthetic balance error' }, codingPlans: {}, budgetUsed: 32 }
const code = `
import React from ${literal(req.resolve('react'))};import{createRoot}from ${literal(req.resolve('react-dom/client'))};
const h=React.createElement;
const mainRequire=name=>name==='react'?React:{Tooltip:({children})=>children};mainRequire.async=async()=>window.peakUI;
window.__ModuleLoader__={load:mod=>window.mainUI=mod.factory(mainRequire)};
${client}
window.__ModuleLoader__={load:mod=>window.peakUI=mod.factory(()=>React)};
${readFileSync('lib/client.peak.js', 'utf8')}
window.__ModuleLoader__={load:mod=>window.displayUI=mod.factory(()=>React)};
${readFileSync('lib/client.display.js', 'utf8')}
const Display=window.displayUI.mount({effect:()=>{}}),{CostSection,parseConfig,SidebarFooter}=window.mainUI.preview;
let state=${literal(state)};state.config=parseConfig(state.config,'config');window.patches=[];window.listeners=new Set();window.failSave=false;window.mounts=0;
const publish=()=>{for(const fn of window.listeners)fn({...state});return state};
window.current=()=>state.config;window.setConfig=patch=>{state={...state,config:parseConfig({...state.config,...patch},'config')};publish()};
window.changeLocale=locale=>window.setConfig({locale});
const api={loadDisplay:async()=>Display,loadCommunity:async()=>()=>null,loadStatistics:async()=>()=>null,updateConfig:async patch=>{
  if(window.failSave)throw Error('synthetic save failure');const config=await window.saveConfig(patch);window.patches.push(patch);state={...state,config:parseConfig(config,'config')};return publish()}};
function useCost(){const[value,setValue]=React.useState(state);React.useEffect(()=>{window.listeners.add(setValue);return()=>window.listeners.delete(setValue)},[]);return{state:value,status:'ready'}}
window.attachFixtureSidebar=container=>createRoot(container).render(h(SidebarFooter,{useCost,api,wide:true}));
function App(){return h(React.Fragment,null,h(CostSection,{useCost,api}),h('div',{id:'actual-sidebar',style:{position:'fixed',left:-2000,width:352,fontSize:14,lineHeight:1.6}},h(SidebarFooter,{useCost,api,wide:true})))}
const root=createRoot(document.getElementById('root'));window.remount=()=>root.render(h(App,{key:++window.mounts}));window.remount();
`
const compiled = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--dsw-font-family:"Segoe UI","Microsoft YaHei",sans-serif;--dsw-radius-md:12px;--dsw-radius-panel:26px;--dsw-alias-label-primary-inverted:#fff;--dsw-alias-border-l2:#e5e7eb;--dsw-specific-sidebar-fill:#f8f9fa;--dsw-specific-input-major:#fff;--dsw-alias-button-elevated-fill:#fff;--dsw-specific-selector:#eff0f2;--dsw-alias-label-primary:#25262b;--dsw-alias-label-secondary:#737780;--dsw-alias-label-tertiary:#858a94;--dsw-alias-border-l1:#e5e7eb;--dsw-alias-border-l3:#e5e7eb;--dsw-alias-bg-base:#fff;--dsw-alias-bg-layer-1:#f7f8fa;--dsw-alias-bg-layer-2:#fff;--dsw-alias-bg-layer-3:#edf0f4;--dsw-alias-state-business-primary:#4d6bfe;--dsw-alias-interactive-bg-hover:#f0f1f4;--ds-font-family-sans:system-ui}
html[data-theme=dark]{color-scheme:dark;--dsw-alias-label-primary-inverted:#202022;--dsw-alias-border-l2:#38383c;--dsw-specific-sidebar-fill:#252527;--dsw-specific-input-major:#303033;--dsw-alias-button-elevated-fill:#303033;--dsw-specific-selector:#353538;--dsw-alias-label-primary:#ececee;--dsw-alias-label-secondary:#a6a6ad;--dsw-alias-label-tertiary:#92929c;--dsw-alias-border-l1:#38383c;--dsw-alias-border-l3:#38383c;--dsw-alias-bg-base:#202022;--dsw-alias-bg-layer-1:#29292c;--dsw-alias-bg-layer-2:#29292c;--dsw-alias-bg-layer-3:#36363c;--dsw-alias-state-business-primary:#6a83ff;--dsw-alias-interactive-bg-hover:#38383c}
body{margin:0;padding:24px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:13px/1.6 system-ui}#root{max-width:960px;margin:auto}button{font:inherit}@media(max-width:480px){body{padding:12px}}
</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(compiled.outputFiles[0].contents) }
  else if (request.url === '/') { response.setHeader('content-type', 'text/html; charset=utf-8'); response.end(html) }
  else { response.statusCode = 404; response.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } })
// Both independently mounted sidebars must render at the same instant. Keep
// Date fixed across a minute boundary while leaving autosave/animation timers live.
await page.clock.setFixedTime(new Date('2026-10-16T04:30:00Z'))
page.setDefaultTimeout(15000)
const errors = [], external = [], previewQueries = []
page.on('pageerror', error => errors.push(String(error)))
await page.route('**/*', route => {
  if (new URL(route.request().url()).origin !== new URL(url).origin) { external.push(route.request().url()); return route.abort() }
  if (new URL(route.request().url()).pathname.startsWith('/plugins/')) previewQueries.push(route.request().url())
  return route.continue()
})
await page.exposeFunction('saveConfig', patch => {
  const result = applyConfigPatch(saved, patch); assert.deepEqual(result.errors, [])
  saved = stateSchema.shape.config.parse(sanitizeConfig(result.config))
  return saved
})
try {
  await page.goto(url)
  await page.evaluate(()=>{
    const host=document.createElement('div');host.id='host-fixture';host.style.cssText='position:absolute;top:5000px;height:1px;contain:strict;overflow:hidden'
    const sidebar=document.createElement('aside');sidebar.className='_2H3hWW_root';sidebar.style.cssText='background:rgb(238,243,248);border-radius:19px;width:324px'
    const composer=document.createElement('div');composer.className='RlGAzG_card';composer.style.cssText='background:rgb(244,248,252);border-radius:31px'
    const history=document.createElement('div');history.id='long-conversation'
    const fragment=document.createDocumentFragment()
    for(let i=0;i<20000;i++){const n=document.createElement('span');n.textContent='Long conversation '+i;fragment.appendChild(n)}
    history.appendChild(fragment);host.append(sidebar,composer,history);document.body.appendChild(host);window.attachFixtureSidebar(sidebar)
    window.outsideStyleReads=0;window.historyReads=0;window.historyClones=0;window.previewObservers=0;window.previewResizeObservers=0
    const read=window.getComputedStyle;window.getComputedStyle=(node,...args)=>{if(node.closest?.('#host-fixture'))window.outsideStyleReads++;if(node.closest?.('#long-conversation'))window.historyReads++;return read(node,...args)}
    const clone=Node.prototype.cloneNode;Node.prototype.cloneNode=function(...args){if(this.closest?.('#host-fixture'))window.historyClones++;return clone.apply(this,args)}
    const Resize=window.ResizeObserver;window.ResizeObserver=class extends Resize{active=false;observe(...args){if(!this.active){window.previewResizeObservers++;this.active=true}return super.observe(...args)}disconnect(){if(this.active){window.previewResizeObservers--;this.active=false}return super.disconnect()}}
    const Observe=window.MutationObserver
    window.MutationObserver=class extends Observe{active=false;observe(...args){if(args[1]?.attributeFilter?.includes('data-theme')&&!this.active){window.previewObservers++;this.active=true}return super.observe(...args)}disconnect(){if(this.active){window.previewObservers--;this.active=false}return super.disconnect()}}
  })
  await page.getByRole('tab',{name:'显示',exact:true}).click();await page.locator('.cm-display').waitFor()
  const region=async name=>page.getByRole('tab',{name,exact:true}).click()
  const item=key=>page.locator('.cm-preview [data-display="'+key+'"]')
  const selectStyle=async label=>page.getByRole('button',{name:label,exact:true}).click()
  const customize=async key=>{await item(key).first().click({position:{x:8,y:8}});await page.locator('[data-inspector="'+key+'"]').waitFor()}
  const toggle=async key=>{const direct=page.locator('[data-display-toggle="'+key+'"]');if(await direct.count())await direct.click();else{await customize(key);const placement=page.getByLabel('显示位置',{exact:true});if(await placement.count()){const current=await placement.getAttribute('value')??await placement.evaluate(n=>n.value);await placement.selectOption(['sidebar','both'].includes(current)?key==='balance'?'off':'settings':'both')}else await page.getByRole('checkbox',{name:'显示此组件',exact:true}).click()}}
  const examples=page.getByRole('checkbox',{name:'使用示例数据',exact:true})
  assert.equal(await examples.isChecked(),true,'examples are on by default')
  assert.equal(await page.locator('.cm-display-model-options,.cm-display-details').count(),0,'options live in the inspector instead of folded forms')
  assert.equal(await page.locator('iframe,.cm-native-desktop,.cm-preview-reference').count(),0,'no desktop copy or scaled reference')
  await page.waitForFunction(()=>document.querySelector('.cm-preview-sidebar').style.backgroundColor==='rgb(238, 243, 248)')
  assert.equal(await page.locator('.cm-preview-sidebar').evaluate(n=>getComputedStyle(n).borderRadius),'19px','current skin surface is reused')
  assert.equal(await page.locator('.cm-sidebar-live').evaluate(n=>Math.round(n.getBoundingClientRect().width)),324,'preview follows the actual footer width')
  const previews=page.locator('.cm-style-thumbnail')
  assert.equal(await previews.count(),3)
  for(const preview of await previews.all()) assert.equal(await preview.locator('.cm-mm-row .cm-bbox-bar').count(),2,'each style preview uses real quota progress rows')
  const progressRows=await page.evaluate(()=>['standard','compact'].map(mode=>[...document.querySelectorAll('.cm-style-thumbnail .cm-footer-stack'+(mode==='compact'?'.compact':':not(.simple):not(.compact)')+' .cm-mm-row')].map(n=>n.getBoundingClientRect().y)))
  assert.ok(progressRows[0][1]>progressRows[0][0],'standard rows stack vertically')
  assert.ok(Math.abs(progressRows[1][1]-progressRows[1][0])<1,'compact rows sit side by side')
  assert.ok((await page.locator('.cm-sidebar-live').innerText()).includes('3 模型'),'example model costs are populated')
  assert.equal(await page.locator('.cm-sidebar-live .cm-bal-err').count(),0,'examples show the balance effect instead of a live error')
  assert.equal(await page.evaluate(()=>window.current().goQuota.enabled),false,'showing an example does not enable queries')
  const configBeforeSource=await page.evaluate(()=>JSON.stringify(window.current()))
  const patchesBeforeSource=await page.evaluate(()=>window.patches.length)
  await examples.uncheck()
  assert.equal(await page.locator('.cm-sidebar-live .cm-bal-err').count(),1,'current data retains its actual error state')
  await examples.check();await examples.uncheck()
  assert.equal(await page.evaluate(()=>JSON.stringify(window.current())),configBeforeSource)
  assert.equal(await page.evaluate(()=>window.patches.length),patchesBeforeSource,'source switch never saves example configuration')
  assert.ok(await page.locator('.cm-preview').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=14))
  // Compare actual card DOM and geometry at equal width in all three modes.
  const parity=async()=>{
    await page.evaluate(()=>{document.getElementById('actual-sidebar').style.width=document.querySelector('.cm-sidebar-live').getBoundingClientRect().width+'px'})
    const values=await page.evaluate(()=>{
      const snapshot=root=>{const host=root.getBoundingClientRect();return [...root.querySelectorAll('.cm-footer-stack > *,[data-cm-display],.cm-bbox-head,.cm-bbox-line,.cm-bbox-bar')].map(n=>{const r=n.getBoundingClientRect();return{class:n.className,text:n.dataset.cmDisplay==='peak'?n.textContent.replace(/\d+/g,'#'):n.textContent,x:Math.round(r.x-host.x),y:Math.round(r.y-host.y),w:Math.round(r.width),h:Math.round(r.height)}})}
      return[snapshot(document.querySelector('.cm-sidebar-live')),snapshot(document.getElementById('actual-sidebar'))]
    })
    assert.deepEqual(values[0],values[1],'preview and real sidebar share exact card layout')
  }
  for(const mode of ['标准','紧凑','简洁']){await selectStyle(mode);await page.waitForTimeout(650);await parity()}
  await selectStyle('紧凑');await page.waitForFunction(()=>window.current().sidebarStyle==='compact'&&!window.current().sidebarSimple)
  assert.equal(await item('budget').evaluate(n=>getComputedStyle(n).borderTopStyle),'dashed')
  const positions=await page.evaluate(()=>[document.querySelector('.cm-preview-sidebar').getBoundingClientRect().right,document.querySelector('.cm-display-inspector').getBoundingClientRect().left])
  assert.ok(positions[1]>positions[0],'style controls are on the right')
  await toggle('balance');await page.waitForFunction(()=>window.current().hideOfficialBalance===true)
  assert.equal(await page.locator('.cm-sidebar-live [data-cm-display=balance]').count(),0)
  await toggle('balance');await page.waitForFunction(()=>window.current().hideOfficialBalance===false)
  await toggle('budget');await page.waitForFunction(()=>window.current().hideBudget===true);assert.equal(saved.budget.enabled,true)
  await toggle('budget');await page.waitForFunction(()=>window.current().hideBudget===false)
  await page.locator('[data-display-toggle=today]').uncheck();await page.waitForFunction(()=>window.current().sidebar===false)
  await page.locator('[data-display-toggle=today]').check();await page.waitForFunction(()=>window.current().sidebar===true)
  await customize('models');await page.getByRole('checkbox',{name:'默认展开',exact:true}).check();await page.waitForFunction(()=>window.current().sidebarModels.defaultOpen)
  assert.equal(await page.locator('.cm-sidebar-live .cm-collapse-h').getAttribute('aria-expanded'),'true')
  await page.locator('.cm-display').screenshot({path:join(output,'models-inspector.png')})
  await page.getByRole('checkbox',{name:'默认展开',exact:true}).uncheck();await page.waitForFunction(()=>!window.current().sidebarModels.defaultOpen)
  await customize('peak');await selectStyle('进度条');await page.waitForFunction(()=>window.current().peakStyle==='progress')
  await page.locator('.cm-sidebar-live .cm-peak-progress').waitFor()
  await page.getByLabel('显示时间',{exact:true}).selectOption('switch');await page.waitForFunction(()=>window.current().peakTimeDisplay==='switch')
  await selectStyle('分段');await page.waitForFunction(()=>window.current().peakStyle==='classic')
  await toggle('peak');await page.waitForFunction(()=>window.current().peakNotice===false);assert.equal(saved.peakEnabled,true)
  await region('输入区');await toggle('strip-go');await page.waitForFunction(()=>window.current().quotaStrip.go===true);assert.equal(saved.goQuota.enabled,false)
  await page.waitForFunction(()=>document.querySelector('.cm-native-input-card').style.borderRadius==='31px')
  await toggle('session-dock');await toggle('badge');await page.waitForFunction(()=>window.current().hideSessionCostDock&&window.current().position==='dock')
  await region('会话内容');await toggle('turn');await toggle('session-header');await page.waitForFunction(()=>window.current().hideTurnCost&&window.current().hideSessionCostHeader)
  assert.equal(await page.locator('.cm-native-turn').innerText(),'▸ 本轮费用 ≈ —','no invented session value when examples are off')
  assert.equal(await page.getByLabel('调整组件',{exact:true}).locator('option[value=""]').count(),0,'instruction is not an option after selection')
  assert.equal(await page.getByText('点击左侧虚线框',{exact:true}).count(),0)
  await region('输入区');await customize('badge')
  assert.equal(await page.getByRole('checkbox',{name:'仅显示金额',exact:true}).count(),1)
  assert.equal(await page.getByText('悬停查看费用分项。',{exact:true}).count(),1)
  await examples.check();await region('侧栏')
  await page.getByLabel('调整组件',{exact:true}).selectOption('codex')
  await page.locator('.cm-sidebar-live [data-cm-display=codex]').waitFor()
  assert.equal(await page.evaluate(()=>window.current().codexQuotaEnabled),false,'Codex example uses a supplied snapshot without enabling discovery')
  await region('输入区')
  await page.getByLabel('调整组件',{exact:true}).selectOption('strip-codex')
  assert.equal(await page.getByRole('checkbox',{name:'显示此组件',exact:true}).count(),0,'Codex has independent explicit switches instead of a duplicate generic toggle')
  await page.locator('[data-display=strip-codex]').waitFor()
  await page.getByRole('checkbox',{name:'在输入区显示 Codex 额度',exact:true}).uncheck()
  await page.waitForFunction(()=>window.current().codexQuotaStrip===false)
  assert.equal(await page.evaluate(()=>window.current().codexQuotaSidebar),true,'composer visibility keeps the sidebar preference')
  assert.equal(await page.evaluate(()=>window.current().codexQuotaEnabled),false,'display controls never enable discovery')
  await page.locator('.cm-display').screenshot({path:join(output,'codex-composer-inspector.png')})
  await page.getByRole('checkbox',{name:'在输入区显示 Codex 额度',exact:true}).check()
  await page.waitForFunction(()=>window.current().codexQuotaStrip===true)
  await region('侧栏')
  await page.getByLabel('调整组件',{exact:true}).selectOption('customBalance')
  await page.locator('.cm-sidebar-live [data-cm-display=customBalance]').waitFor()
  assert.equal(await page.evaluate(()=>window.current().customBalance.enabled),false)
  await toggle('budget');await page.waitForFunction(()=>window.current().hideBudget)
  assert.equal(await page.locator('.cm-sidebar-live [data-cm-display=budget]').getAttribute('data-preview-hidden'),'true','hidden sample stays faded and adjustable')
  await toggle('budget');await page.waitForFunction(()=>!window.current().hideBudget)
  assert.equal(saved.goQuota.enabled,false)
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.querySelector('._2H3hWW_root').style.backgroundColor=theme==='dark'?'rgb(37,39,43)':'rgb(238,243,248)'},theme)
    for(const width of [1100,720,390]){
      await page.setViewportSize({width,height:1000})
      for(const name of ['侧栏','输入区','会话内容']){
        await region(name)
        assert.equal(await page.locator('.cm-preview').evaluate(n=>n.scrollWidth>n.clientWidth+2),false,'preview fits '+theme+'/'+width+'/'+name)
        await page.locator('.cm-display').screenshot({path:join(output,theme+'-'+width+'-'+name+'.png')})
      }

    }
  }
  await page.setViewportSize({width:1100,height:1000});await page.evaluate(()=>document.documentElement.dataset.theme='light')
  await page.getByRole('button',{name:'放大预览',exact:true}).click();await page.locator('.cm-display-dialog[open]').waitFor()
  await page.keyboard.press('Escape');assert.equal(await page.locator('.cm-display-dialog[open]').count(),0)
  assert.equal(await page.getByRole('button',{name:'放大预览',exact:true}).evaluate(n=>n===document.activeElement),true)
  // Reopening with a long real page must not scan its contents or accumulate observers.
  const timings=[],styleStart=await page.evaluate(()=>window.outsideStyleReads)
  const session=await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate',{rate:4})
  for(let i=0;i<25;i++){
    await page.getByRole('tab',{name:'概览',exact:true}).click()
    await page.locator('.cm-display').waitFor({state:'detached'})
    await page.waitForFunction(()=>window.previewObservers===0&&window.previewResizeObservers===0)
    assert.equal(await page.evaluate(()=>window.previewObservers),0,'preview observer is cleaned on close')
    const duration=await page.evaluate(async()=>{const start=performance.now();[...document.querySelectorAll('[role=tab]')].find(n=>n.textContent==='显示').click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return performance.now()-start})
    await page.locator('.cm-preview').waitFor();timings.push(duration)
    assert.equal(await page.evaluate(()=>window.previewObservers),1,'only one small theme observer exists');assert.equal(await page.evaluate(()=>window.previewResizeObservers),1,'one local preview resize observer')
  }
  await session.send('Emulation.setCPUThrottlingRate',{rate:1})
  const metrics=await page.evaluate(()=>({styleReads:window.outsideStyleReads,historyReads:window.historyReads,historyClones:window.historyClones,previewNodes:document.querySelector('.cm-display').querySelectorAll('*').length}))
  assert.equal(metrics.historyReads,0);assert.equal(metrics.historyClones,0)
  assert.ok(metrics.styleReads-styleStart<=25*3,'at most three skin surfaces per mount')
  assert.ok(metrics.previewNodes<1000,'bounded preview subtree')
  const sorted=[...timings].sort((a,b)=>a-b),p95=sorted[Math.ceil(sorted.length*.95)-1]
  assert.ok(p95<1000,'opening stays responsive under 4x CPU throttle: '+p95)
  await region('会话内容');assert.equal(await item('turn').getAttribute('data-visible'),'false','saved toggles survive repeated reopening')
  await page.getByLabel('界面语言',{exact:true}).selectOption('en');await page.waitForFunction(()=>window.current().locale==='en')
  await region('Sidebar');await page.evaluate(()=>window.failSave=true);await customize('balance');const placement=page.getByLabel('Placement',{exact:true});await placement.selectOption(await placement.inputValue()==='off'?'both':'off');await page.getByText(/synthetic save failure/).waitFor()
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(previewQueries,[],'preview never starts account or Codex discovery requests')
  const result={themes:2,widths:[1100,720,390],regions:3,normalFontSize:true,skinSurfaces:true,autosave:true,keyboard:true,reopenCount:25,hostConversationNodes:20000,cpuThrottle:4,openMedianMs:Math.round(sorted[Math.floor(sorted.length/2)]),openP95Ms:Math.round(p95),...metrics,externalRequests:external.length,browserErrors:errors.length}
  writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2));console.log('[ok] '+JSON.stringify(result))
} catch(error){await page.screenshot({path:join(output,'failure.png'),fullPage:true});console.error(errors);throw error}
finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
