// Inspect real client/chunk CSS in Chromium; changing only the content behind a surface must
// leave its interior pixels unchanged. Synthetic themes include dark skins over a light host.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { javascriptLiteral as literal } from '../scripts/javascript-literal.mjs'

const modules = resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-context-host/node_modules')
const req = createRequire(join(modules, '__opacity.cjs')), { chromium } = req('playwright-core')
const executablePath = process.env.CM_TEST_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const baseline = process.argv[2], read = file => baseline ? execFileSync('git', ['show', baseline + ':' + file], { encoding: 'utf8' }) : readFileSync(file, 'utf8')
const client = readdirSync('src/client').filter(n => n.endsWith('.js')).sort().map(n => read('src/client/' + n)).join('')
const stats = read('src/statistics/index.js').replace('return { mount, prefetchStatistics,', 'return { css, introCss, FeeDialog, mount, prefetchStatistics,')
const source = `
import React from ${literal(req.resolve('react'))};
import {createRoot} from ${literal(req.resolve('react-dom/client'))};
import {createPortal} from ${literal(req.resolve('react-dom'))};
window.chunks={};window.__ModuleLoader__={load:mod=>window.chunks[mod.chunk??'main']=mod.factory(name=>name==='react'?React:name==='react-dom'?{createPortal}:{Tooltip:({children})=>children})};
${client}
${read('src/pricing/index.js')}
${stats}
const ui=window.chunks['client.statistics.js'];
const style=document.createElement('style');style.textContent=ui.css+ui.introCss;document.head.append(style);
window.chunks['client.pricing.js'].mount({get:name=>name==='remote'?{$mount:async()=>()=>{}}:{},effect:fn=>fn()});
const root=createRoot(document.getElementById('root'));
window.renderSpecial=name=>{root.render(name==='fee'?React.createElement(ui.FeeDialog,{title:'费用明细',text:(zh,en)=>zh,onClose:()=>{}},'合成测试数据'):React.createElement(ui.BillionCompatibilityNotice,{locale:'zh',meter:{version:'0.1.180',compatibility:'needs_update',noticeId:'opacity-fixture'}}))};
window.clear=()=>root.render(null);window.ready=true;
`
const compiled = await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'iife', platform: 'browser' })
const server = createServer((request, response) => {
  response.setHeader('content-type', request.url === '/app.js' ? 'text/javascript' : 'text/html')
  response.end(request.url === '/app.js' ? compiled.outputFiles[0].contents : '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 }), errors = [], checks = []
const output = resolve('.tmp-skin-opacity' + (baseline ? '-before' : '-after')); mkdirSync(output, { recursive: true })
page.on('pageerror', error => errors.push(String(error)))
await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
const classes = ['cm-section', 'cm-stat-dialog', 'cm-qguide', 'cm-peak-alert', 'cm-footer-stack simple', 'cm-simple-summary', 'cm-combo-panel', 'cm-context-intro', 'cm-stat', 'cm-fee-dialog', 'cm-billion-notice']
try {
  await page.goto(url); await page.waitForFunction(() => window.ready)
  for (const theme of ['light', 'dark', 'dark-skin-light-host']) {
    for (const alpha of [0, .2, .65, 1]) {
      await page.evaluate(({ theme, alpha }) => {
        const dark = theme !== 'light', root = document.documentElement
        document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark')
        root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
        for (const key of ['bg-base', 'bg-layer-1', 'bg-layer-2']) root.style.setProperty('--dsw-alias-' + key, `rgba(${dark ? '25, 31, 48' : '242, 246, 255'},${alpha})`)
        root.style.setProperty('--cm-bg', 'var(--dsw-alias-bg-base)')
        root.style.setProperty('--cm-label', 'var(--dsw-alias-label-primary)')
        root.style.setProperty('--cm-muted', dark ? '#b8bdc8' : '#626775')
        root.style.setProperty('--dsw-alias-label-primary', dark ? '#eee' : '#111')
        root.style.setProperty('--dsw-alias-border-l1', '#888')
      }, { theme, alpha })
      for (const name of classes) {
        if (name === 'cm-fee-dialog' || name === 'cm-billion-notice') {
          await page.evaluate(name => window.renderSpecial(name === 'cm-fee-dialog' ? 'fee' : 'billion'), name)
          await page.locator('.' + name).waitFor({ state: 'attached' })
        } else {
          await page.evaluate(name => {
            const el = document.createElement('div'); el.id = 'surface'; el.className = name
            document.body.append(el)
          }, name)
        }
        const selector = name === 'cm-fee-dialog' || name === 'cm-billion-notice' ? '.' + name : '#surface'
        await page.locator(selector).evaluate(el => {
          Object.assign(el.style, { position: 'fixed', top: '100px', left: '100px', right: 'auto', bottom: 'auto', margin: '0', transform: 'none', width: '600px', height: '260px', maxHeight: 'none', minHeight: '0', padding: '40px', transition: 'none', animation: 'none' })
        })
        const capture = async color => {
          await page.evaluate(color => { document.body.style.background = color; document.documentElement.style.background = color }, color)
          return page.screenshot({ clip: { x: 125, y: 125, width: 12, height: 12 }, animations: 'disabled' })
        }
        const a = await capture('#ff0044'), b = await capture('#00ff88'), opaque = a.equals(b)
        checks.push({ theme, alpha, surface: name, opaque })
        if (!baseline) assert.ok(opaque, `${name} leaks background at ${theme} alpha=${alpha}`)
        if (theme === 'dark-skin-light-host' && alpha === .2 && name === 'cm-fee-dialog') await page.screenshot({ path: join(output, 'dark-skin-fee-dialog.png') })
        if (selector === '#surface') await page.locator(selector).evaluate(el => el.remove())
        else { await page.evaluate(() => window.clear()); await page.locator(selector).waitFor({ state: 'detached' }) }
      }
    }
  }
  assert.deepEqual(errors, [])
  const leaking = checks.filter(x => !x.opaque).length
  if (baseline) assert.ok(leaking > 0, 'baseline reproduces the reported transparency defect')
  writeFileSync(join(output, 'result.json'), JSON.stringify({ baseline: baseline ?? null, checks, leaking, errors }, null, 2))
  console.log(JSON.stringify({ cases: checks.length, leaking, errors, output }))
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)) }
