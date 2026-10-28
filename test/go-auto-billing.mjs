import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import vm from 'node:vm'
import { Ledger, sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { billingClassOf, enabledPlanSetOf } from '../lib/plan-billing.js'
import { runStartupImports } from '../lib/index.js'

const model = 'deepseek-v4.1-flash'
const config = sanitizeConfig({ goQuota: { enabled: true }, planBilling: { providers: { go: 'auto' }, autoProviders: [] } })
assert.equal(billingClassOf('dsh-opencode-go', model, config.planBilling, enabledPlanSetOf(config)), 'plan', 'an empty frozen auto list must not turn an explicit Go subscription into API spending')
const dir = new URL('../src/client/', import.meta.url)
const source = readdirSync(dir).filter(n => n.endsWith('.js')).sort().map(n => readFileSync(new URL(n, dir), 'utf8')).join('')
let factory
vm.runInNewContext(source.replace('exports.apply = apply', 'exports.test = { billingClassOfLocal }; exports.apply = apply'), {
  navigator: { language: 'en' }, window: { __ModuleLoader__: { load: m => { factory = m.factory } } },
})
const ui = factory(() => ({})).test
for (const frozen of [[], ['minimax']]) for (const enabled of [false, true]) {
  const cfg = sanitizeConfig({ goQuota: { enabled }, planBilling: { autoProviders: frozen } })
  for (const provider of ['dsh-opencode-go', 'opencode-go', 'opencode-go-plus', 'llm-dsh-opencode-go']) {
    const classify = cfg => [billingClassOf(provider, model, cfg.planBilling, enabledPlanSetOf(cfg)), ui.billingClassOfLocal(provider, model, cfg)]
    assert.deepEqual(classify(cfg), ['plan', 'plan'])
    for (const patch of [{ providers: { go: 'api' } }, { providers: { [provider]: 'api' } }, { models: { [provider + ':' + model]: 'api' } }]) {
      assert.deepEqual(classify(sanitizeConfig({ ...cfg, planBilling: { ...cfg.planBilling, ...patch } })), ['api', 'api'], 'explicit overrides still win')
    }
  }
  for (const provider of ['deepseek', 'opencode-zen', 'custom', 'opencode-go-proxy']) {
    assert.equal(billingClassOf(provider, model, cfg.planBilling, enabledPlanSetOf(cfg)), 'api')
    assert.equal(ui.billingClassOfLocal(provider, model, cfg), 'api')
  }
}

const root = mkdtempSync(join(tmpdir(), 'cm-go-auto-'))
let ledger
const recorded = days => JSON.parse(JSON.stringify(days, (key, value) => key.startsWith('apiCost') ? undefined : value))
try {
  ledger = new Ledger(sanitizeConfig({ ...config, legacyAutoImportedAt: Date.now(), peakEnabled: false,
    planBilling: { ...config.planBilling, providers: { go: 'api' } },
  }), {}, join(root, 'ledger.json'))
  await runStartupImports(ledger, join(root, 'sessions'))
  for (const daysAgo of [0, 1]) for (const provider of ['dsh-opencode-go', 'deepseek']) {
    ledger.account({ input: 1000, output: 200 }, model, provider + daysAgo, Date.now() - daysAgo * 86400000, provider)
  }
  const before = recorded(ledger.days)
  ledger.config = sanitizeConfig({ ...ledger.config, exchangeRate: 99, planBilling: { ...ledger.config.planBilling, providers: { go: 'auto' } } })
  ledger.migrations = ledger.migrations.filter(id => id !== 'go-subscription-auto-v1')
  ledger.scheduleWrite(); ledger.close()
  ledger = Ledger.load(join(root, 'ledger.json'))
  const priceHistory = structuredClone(ledger.pricingHistory)
  await runStartupImports(ledger, join(root, 'sessions'), { mode: 'rdb', listSessions: async () => [], readRecords: async () => [] })
  assert.deepEqual(recorded(ledger.days), before, 'repair keeps tokens, calls, API-equivalent values and recorded FX')
  assert.deepEqual(ledger.pricingHistory, priceHistory)
  for (const day of Object.values(ledger.days)) for (const row of [day, ...day.sessions]) for (const suffix of ['', 'Cny', 'Eur']) {
    let sum = 0
    for (const [key, bucket] of Object.entries(row.byProviderModel)) {
      const expected = key.startsWith('dsh-opencode-go:') ? 0 : bucket['cost' + suffix]
      assert.equal(bucket['apiCost' + suffix], expected)
      sum += expected
    }
    assert.ok(Math.abs(row['apiCost' + suffix] - sum) < 1e-10)
  }
  assert.ok(ledger.migrations.includes('go-subscription-auto-v1'))
  const repaired = structuredClone(ledger.days)
  await runStartupImports(ledger, join(root, 'sessions'))
  assert.deepEqual(ledger.days, repaired, 'migration is idempotent')
  ledger.config = sanitizeConfig({ ...ledger.config, goQuota: { ...ledger.config.goQuota, enabled: false } })
  ledger.account({ input: 1000, output: 200 }, model, 'new-go-session', Date.now(), 'dsh-opencode-go')
  assert.equal(Object.values(ledger.days).flatMap(d => d.sessions).find(s => s.id === 'new-go-session').apiCost, 0)
} finally { ledger?.close(); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
// The provider-level control preserves per-model overrides and unrelated providers.
let selected
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  useState: initial => [selected ?? initial, value => { selected = value }],
}
vm.runInNewContext(readFileSync(new URL('../src/pricing/index.js', import.meta.url), 'utf8').replace('return { mount, CONTRIBUTION }', 'return { ProviderBillingSettings }'), {
  window: { __ModuleLoader__: { load: m => { factory = m.factory } } },
})
const Pricing = factory(name => name === 'react' ? React : {})
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.children)] : []
for (const locale of ['zh', 'en']) {
  selected = undefined
  let draft = sanitizeConfig({ ...config, planBilling: { ...config.planBilling, models: { 'dsh-opencode-go:paid': 'api' } } })
  const before = JSON.stringify([draft.planBilling.models, draft.goQuota, draft.planBilling.autoProviders])
  const render = () => Pricing.ProviderBillingSettings({ state: { config: draft, total: { byProviderModel: { 'dsh-opencode-go:model': {} } } }, draft, locale,
    setDraft: next => { const result = applyConfigPatch(draft, JSON.parse(JSON.stringify(next))); assert.deepEqual(result.errors, []); draft = result.config },
  })
  let selects = nodes(render()).filter(n => n.type === 'select')
  assert.equal(selects[0].props.value, 'dsh-opencode-go')
  selects[1].props.onChange({ target: { value: 'plan' } })
  assert.equal(draft.planBilling.providers['dsh-opencode-go'], 'plan')
  assert.equal(JSON.stringify([draft.planBilling.models, draft.goQuota, draft.planBilling.autoProviders]), before)
  selects[0].props.onChange({ target: { value: 'go' } })
  selects = nodes(render()).filter(n => n.type === 'select')
  selects[1].props.onChange({ target: { value: 'api' } })
  assert.equal(draft.planBilling.providers.go, 'api')
  assert.equal(draft.planBilling.providers['dsh-opencode-go'], 'plan')
}
console.log('[ok] #424: empty/nonempty frozen lists, independent query toggles, overrides, client parity, history repair, new calls and provider settings')
