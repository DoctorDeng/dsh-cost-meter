import assert from 'node:assert/strict'
import vm from 'node:vm'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Ledger, sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'

const dir = new URL('../src/client/', import.meta.url)
const source = readdirSync(dir).filter(n => n.endsWith('.js')).sort().map(n => readFileSync(new URL(n, dir), 'utf8')).join('')
let factory, hookIndex = 0, hooks = []
vm.runInNewContext(source.replace('exports.apply = apply', 'exports.test = { SidebarSimpleGuide, QuotaStripGuide, BalanceClickGuide, SidebarFooter, parseConfig, codexQuotaCache }; exports.apply = apply'), {
  navigator: { language: 'en' }, window: { __ModuleLoader__: { load: v => { factory = v.factory } }, localStorage: { getItem: () => null } },
})
const el = (type, props, ...children) => ({ type, props: props ?? {}, children })
const React = { createElement: el, Fragment: 'fragment', useEffect() {},
  useRef: value => { const i = hookIndex++; return hooks[i] ??= { current: value } },
  useState: init => { const i = hookIndex++; if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init; return [hooks[i], value => { hooks[i] = value }] },
}
const ui = factory(name => name === 'react' ? React : { Tooltip: 'tooltip' }).test
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.children)] : []
const base = sanitizeConfig({ sidebarStyle: 'compact', quotaStrip: { promptSeen: true }, balance: { clickHintSeen: true }, hideOfficialBalance: true, goQuota: { enabled: false } })
assert.equal(base.sidebarSimple, false, '旧配置保留当前布局')
assert.equal(base.sidebarStyle, 'compact')
for (const field of ['sidebarSimple', 'sidebarSimplePromptSeen']) {
  assert.ok(applyConfigPatch(base, { [field]: 'true' }).errors.length > 0, '不能把文本当作用户选择')
}
let config = base, calls = 0, rejectSave, finishSave, patch
const useCost = pick => pick({ state: { config } })
const api = { updateConfig: value => { calls++; patch = value; return new Promise((resolve, reject) => { rejectSave = reject; finishSave = () => { const result = applyConfigPatch(config, value); assert.deepEqual(result.errors, []); config = result.config; resolve() } }) } }
const renderGuide = () => { hookIndex = 0; return ui.SidebarSimpleGuide({ useCost, api }) }
const button = (tree, i) => nodes(tree).filter(n => n.type === 'button')[i]
const initial = renderGuide()
assert.equal(initial.props.role, 'dialog')
const enabling = button(initial, 1).props.onClick()
button(initial, 0).props.onClick()
assert.equal(calls, 1, '等待保存时不重复提交或切换选择')
assert.ok(button(renderGuide(), 0).props.disabled)
rejectSave(new Error('synthetic failure')); await enabling
assert.equal(config.sidebarSimplePromptSeen, false, '保存失败不标记为已选择')
assert.ok(nodes(renderGuide()).some(n => n.props.role === 'alert'))
const retry = button(renderGuide(), 1).props.onClick()
finishSave(); await retry
assert.deepEqual(JSON.parse(JSON.stringify(patch)), { sidebarSimple: true, sidebarSimplePromptSeen: true })
assert.equal(renderGuide(), null)
assert.equal(config.sidebarStyle, 'compact', '简化开关保留原标准/紧凑偏好')
const rpcConfig = stateSchema.shape.config.parse(config)
const clientConfig = ui.parseConfig(rpcConfig, 'config')
assert.equal(clientConfig.sidebarSimple, true)
assert.equal(clientConfig.sidebarSimplePromptSeen, true)

const root = mkdtempSync(join(tmpdir(), 'cm-simple-118-'))
const oldHome = process.env.DSH_HOME
try {
  process.env.DSH_HOME = root
  const ledger = Ledger.open()
  ledger.config = config
  ledger.scheduleWrite()
  ledger.close()
  const reopened = Ledger.open()
  assert.equal(reopened.config.sidebarSimple, true)
  assert.equal(reopened.config.sidebarSimplePromptSeen, true, '重启后无需再次选择')
  reopened.close()
} finally {
  if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
  rmSync(root, { recursive: true, force: true })
}

hooks = []; config = base
const keeping = button(renderGuide(), 0).props.onClick()
finishSave(); await keeping
assert.equal(config.sidebarSimple, false)
assert.equal(config.sidebarSimplePromptSeen, true, '保留当前显示也记住选择')
assert.equal(renderGuide(), null)
hooks = []; config = { ...base, sidebarSimplePromptSeen: false, quotaStrip: { ...base.quotaStrip, promptSeen: false }, balance: { ...base.balance, display: 'both', clickHintSeen: false } }
hookIndex = 0
assert.equal(ui.QuotaStripGuide({ useCost, api }), null, '优先显示新的简化引导')
hooks = []; hookIndex = 0
assert.equal(ui.BalanceClickGuide({ useCost, api }), null, '新旧引导不会叠在一起')

const totals = { cost: 1, calls: 1, input: 100, output: 20, cacheRead: 0, cacheWrite: 0 }
const win = { percent: 25, resetsAt: new Date(Date.now() + 3600000).toISOString() }
config = sanitizeConfig({ ...base, budget: { enabled: true }, codingPlans: { kimi: { enabled: true, display: 'sidebar' } }, sidebarSimple: true, sidebarSimplePromptSeen: true })
const state = { config, today: totals, month: totals, total: totals, codingPlans: { kimi: { status: 'ok', windows: { daily: win }, fetchedAt: Date.now() } }, gatewayQuotas: { sources: [] } }
ui.codexQuotaCache.status = 'unavailable'
const footer = wide => { hooks = []; hookIndex = 0; return ui.SidebarFooter({ wide, useCost: pick => pick({ state }), api }) }
const simple = footer(true)
assert.match(simple.props.className, /simple/)
assert.doesNotMatch(simple.props.className, /compact/)
assert.equal(simple.props.tabIndex, 0, '可用键盘进入并滚动')
const countCards = tree => nodes(tree).filter(n => typeof n.type === 'function').length
assert.equal(nodes(simple).filter(n => n.props.className === 'cm-simple-summary').length, 1)
assert.match(footer(false).props.className, /rail.*simple/)
state.config = { ...config, sidebarSimple: false }
const standard = footer(true)
assert.match(standard.props.className, /compact/)
assert.doesNotMatch(standard.props.className, /simple/)
assert.equal(countCards(standard), countCards(simple), '简化模式保留已启用卡片')
console.log('[ok] #118 简化显示：选择/拒绝、保存失败重试、防重入、RPC 与重启持久化、引导串行、布局恢复及键盘滚动')
