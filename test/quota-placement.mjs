import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'
import { applyConfigPatch, sanitizeConfig } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'

const el = (type, props, ...children) => ({ type, props, children })
const fragment = readFileSync(new URL('../src/client/02-validators-helpers-sidebar.js', import.meta.url), 'utf8')
export const quotaPlacementHelpers = new Function('el', fragment.slice(fragment.indexOf('function quotaInComposer('), fragment.indexOf('function QuotaStrip(')) + '\nreturn { quotaInComposer, quotaPlacementValue, quotaPlacementPatch, quotaPlacementOptions }')(el)
const { quotaInComposer, quotaPlacementValue, quotaPlacementPatch } = quotaPlacementHelpers
let config = sanitizeConfig({ codingPlans: { zai: { enabled: true, display: 'sidebar' }, kimi: { enabled: true, display: 'both' } } })
assert.equal(config.balance.showSource, false)
assert.equal(config.codingPlans.zai.showInComposer, undefined, 'old placement remains governed by existing strip defaults')
const save = patch => {
  const result = applyConfigPatch(config, patch)
  assert.deepEqual(result.errors, [])
  config = stateSchema.shape.config.parse(sanitizeConfig(JSON.parse(JSON.stringify(result.config))))
}
const sibling = JSON.stringify(config.codingPlans.kimi)
for (const value of ['sidebar', 'settings', 'both', 'composer', 'sidebar-composer', 'settings-composer', 'all', 'off']) {
  save({ codingPlans: { ...config.codingPlans, zai: { ...config.codingPlans.zai, ...quotaPlacementPatch(value) } } })
  const entry = config.codingPlans.zai
  assert.equal(quotaPlacementValue(entry, config.quotaStrip, 'plans'), value, 'selection survives save, wire codec and reload')
  assert.equal(quotaInComposer(entry, config.quotaStrip, 'plans'), ['composer', 'sidebar-composer', 'settings-composer', 'all'].includes(value))
  assert.equal(JSON.stringify(config.codingPlans.kimi), sibling, 'moving one vendor does not alter another vendor')
}
save({ goQuota: { ...config.goQuota, ...quotaPlacementPatch('composer') }, balance: { ...config.balance, showSource: true } })
assert.equal(config.goQuota.showInComposer, true)
assert.equal(config.balance.showSource, true)
for (const invalid of ['yes', 1, null]) {
  assert.ok(applyConfigPatch(config, { balance: { ...config.balance, showSource: invalid } }).errors.length)
  assert.ok(applyConfigPatch(config, { goQuota: { ...config.goQuota, showInComposer: invalid } }).errors.length)
  assert.ok(applyConfigPatch(config, { codingPlans: { ...config.codingPlans, zai: { ...config.codingPlans.zai, showInComposer: invalid } } }).errors.length)
}
const legacy = { enabled: true, display: 'sidebar' }, strip = { enabled: true, plans: true }
assert.equal(quotaInComposer(legacy, strip, 'plans'), true)
assert.equal(quotaPlacementValue(legacy, strip, 'plans'), 'sidebar-composer')
assert.equal(quotaInComposer({ ...legacy, showInComposer: false }, strip, 'plans'), false, 'explicit sidebar selection overrides old all-plan strip')

const dir = new URL('../src/client/', import.meta.url)
const source = readdirSync(dir).filter(name => name.endsWith('.js')).sort().map(name => readFileSync(new URL(name, dir), 'utf8')).join('')
let factory
vm.runInNewContext(source.replace('exports.apply = apply', 'exports.placementTest = { QuotaStrip, balanceLabel, makeT, parseConfig }; exports.apply = apply'), {
  window: { __ModuleLoader__: { load: value => { factory = value.factory } }, localStorage: { getItem: () => null } }, navigator: { language: 'zh-CN' },
})
const React = { createElement: el, useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useRef: value => ({ current: value }) }
const ui = factory(name => name === 'react' ? React : {}).placementTest
assert.equal(ui.balanceLabel(ui.makeT('zh'), sanitizeConfig({})), '余额')
assert.equal(ui.balanceLabel(ui.makeT('zh'), config), 'DeepSeek 余额')
assert.equal(ui.parseConfig(config, 'config').goQuota.showInComposer, true)
const plan = { enabled: true, display: 'off', showInComposer: true }
const displayConfig = sanitizeConfig({ codingPlans: { zai: plan, kimi: { ...plan, showInComposer: false } }, quotaStrip: { enabled: false } })
const tree = ui.QuotaStrip({ useCost: () => ({ state: { config: displayConfig, codingPlans: { zai: { status: 'ok', windows: { fiveHour: { percent: 30 }, weekly: { percent: 100 } } }, kimi: { status: 'ok', windows: { weekly: { percent: 10 } } } } } }) })
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node, ...(node.children ?? []).flatMap(nodes)] : []
const chips = nodes(tree).filter(node => node.props?.className?.startsWith('cm-qchip'))
assert.equal(chips.length, 1, 'a single explicit placement shows only that vendor even when the default strip is disabled')
assert.equal(nodes(tree).filter(node => node.props?.key === 'zai').length, 1)
console.log('[ok] quota placement: all location combinations, vendor isolation, wire/reload, legacy strip defaults, composer-only chips and optional balance source')
