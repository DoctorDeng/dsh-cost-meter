import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Optional paths let the matcher patch be checked before applying it to the repository.
const pricingUrl = process.argv[2] ? pathToFileURL(resolve(process.argv[2])) : new URL('../lib/pricing.js', import.meta.url)
const clientUrl = process.argv[3] ? pathToFileURL(resolve(process.argv[3])) : new URL('../src/client/02-validators-helpers-sidebar.js', import.meta.url)
const { providerPriceEntryFor, matchModelId, normalizePrice } = await import(pricingUrl)
const source = readFileSync(clientUrl, 'utf8')
const start = source.indexOf('function priceEntryFor(modelId, table)')
const end = source.indexOf('function makeStore(initial)')
assert.ok(start >= 0 && end > start)
const client = new Function(source.slice(start, end) + '\nreturn { resolveClientPrice, matchModelIdLocal }')()

const flat = (input, output = input * 5) => ({ input, output, billingMode: 'flat' })
const directDeepSeek = { cacheMiss: 0.15, cacheHit: 0.003, output: 0.6, billingMode: 'deepseek-peak' }
const goDeepSeek = { cacheMiss: 0.22, cacheHit: 0.007, output: 0.66, billingMode: 'utc-peak' }
const prices = {
  models: { 'deepseek-v4-flash': directDeepSeek },
  default: directDeepSeek,
  providers: {
    openai: { models: { 'gpt-6.1-sol': flat(2), 'gpt-6-astra': flat(10) } },
    google: { models: { 'gemini-3.8-flash': flat(0.75), 'gemini-3.7-flash': flat(0.75) } },
    anthropic: { models: { 'claude-opus-4-8': flat(5) } },
    'opencode-zen': { models: { 'gpt-6.1-sol': flat(1), 'gemini-3.8-flash': flat(1.5), 'deepseek-v4-flash': flat(0.4), 'zen-only-model': flat(7) } },
    'opencode-go': { models: { 'gemini-3.8-flash': flat(3), 'deepseek-v4-flash': goDeepSeek, 'go-only-model': flat(8) } },
    openrouter: { models: {
      'google/gemini-3.8-flash': flat(0.9),
      'google/gemini-3.8-flash:free': flat(0, 0),
      'google/gemini-3.8-flash:online': flat(1.2),
      'router-only-model': flat(9),
    } },
  },
}
const cfg = (mode = 'auto', overrides = {}, table = prices) => ({ prices: table, priceMatch: mode, priceOverrides: overrides })
let comparisons = 0
function check(provider, model, expected, config = cfg()) {
  const backend = providerPriceEntryFor(provider, model, config.prices, { mode: config.priceMatch, overrides: config.priceOverrides })
  const frontend = client.resolveClientPrice(provider, model, config)
  for (const [side, result] of [['backend', backend], ['client', frontend]]) {
    assert.equal(result.priced, expected.priced, `${side}: ${provider}:${model} priced`)
    if (expected.input !== undefined) assert.equal(normalizePrice(result.entry)?.cacheMiss, expected.input, `${side}: ${provider}:${model} input`)
    if (expected.mode !== undefined) assert.equal(result.billingMode, expected.mode, `${side}: ${provider}:${model} billing mode`)
    if (expected.currency !== undefined) assert.equal(result.currency, expected.currency, `${side}: ${provider}:${model} currency`)
  }
  assert.equal(frontend.priced, backend.priced, `${provider}:${model} mirror priced`)
  assert.equal(frontend.billingMode, backend.billingMode, `${provider}:${model} mirror billing mode`)
  comparisons++
}

// Only recognized upstream namespaces are auto aliases. Exact mode preserves full IDs.
for (const [provider, model, input] of [
  ['openai', 'openai/gpt-6.1-sol', 2],
  ['google', 'google/gemini-3.8-flash', 0.75],
  ['anthropic', 'anthropic/Claude Opus 4.8', 5],
  ['custom-api', 'openai/gpt-6.1-sol', 2],
  ['llm-openai', 'openai/gpt-6.1-sol', 2],
]) {
  check(provider, model, { priced: true, input })
  check(provider, model, { priced: false }, cfg('exact'))
}
check('openai', 'gpt-6.1-sol', { priced: true, input: 2 }, cfg('exact'))
check('google', 'unknown/gemini-3.8-flash', { priced: false })
check('anthropic', 'anthropic/gemini-3.8-flash', { priced: false })
check('opencode-zen', 'anthropic/gemini-3.8-flash', { priced: false })
check('opencode-zen', 'unknown/gemini-3.8-flash', { priced: false })

// Explicit Zen PAYG IDs select their own catalog; legacy IDs/override keys stay compatible.
for (const provider of ['opencode-zen', 'llm-opencode-zen']) {
  check(provider, 'google/gemini-3.8-flash', { priced: true, input: 1.5 })
  check(provider, 'gemini-3.8-flash', { priced: true, input: 1.5 }, cfg('exact'))
  check(provider, 'google/gemini-3.8-flash', { priced: false }, cfg('exact'))
}
check('zen', 'mapped-model', { priced: true, input: 10 }, cfg('auto', { 'zen:mapped-model': 'openai:gpt-6-astra' }))
check('opencode-zen', 'mapped-model', { priced: true, input: 10 }, cfg('exact', { 'opencode-zen:mapped-model': 'openai:gpt-6-astra' }))
check('zen', 'gpt-6.1-sol', { priced: false }, cfg('auto', { 'zen:gpt-6.1-sol': '__local__' }))
check('opencode-zen', 'gemini-3.7-flash', { priced: false })
check('opencode-go', 'gemini-3.7-flash', { priced: false })

// Provider-specific DeepSeek prices and calendars must not be replaced by direct rates.
check('opencode-zen', 'deepseek/deepseek-v4-flash', { priced: true, input: 0.4, mode: 'flat' })
check('opencode-go', 'deepseek/deepseek-v4-flash', { priced: true, input: 0.22, mode: 'utc-peak' })
check('deepseek', 'deepseek/deepseek-v4-flash', { priced: true, input: 0.15, mode: 'deepseek-peak' })
check('opencode-go', 'deepseek-v4-flash', { priced: true, input: 0.22, mode: 'utc-peak', currency: 'USD' }, cfg('auto', {}, { ...prices, currency: 'CNY' }))

// Scoped routing prices never leak into another provider's fallback rates.
for (const model of ['zen-only-model', 'go-only-model', 'router-only-model']) {
  check('custom-api', model, { priced: false })
  check('openai', model, { priced: false })
  check('deepseek', model, { priced: true, input: 0.15, mode: 'deepseek-peak' })
}
check('anthropic', 'gemini-3.8-flash', { priced: false })
check('google', 'gpt-6.1-sol', { priced: false })
check('anthropic', 'openai/gpt-6.1-sol', { priced: false })
check('zen', 'gpt-6.1-sol', { priced: false })
check('opencode', 'gpt-6.1-sol', { priced: false })
check('zen', 'deepseek-v4-flash', { priced: true, input: 0.22, mode: 'utc-peak' })

for (const provider of ['openai', 'anthropic', 'google', 'openrouter', 'ollama', 'opencode-zen', 'opencode-go']) {
  const own = provider === 'opencode-zen' ? { input: 0.4, mode: 'flat' } : provider === 'opencode-go' ? { input: 0.22, mode: 'utc-peak' } : { input: 0.15, mode: 'deepseek-peak' }
  for (const mode of ['auto', 'exact']) check(provider, 'legacy-model', { priced: true, ...own }, cfg(mode, { [provider + ':legacy-model']: 'deepseek-v4-flash' }))
}
const fallbackPrices = { ...prices, models: { ...prices.models, 'deepseek-v4-pro': directDeepSeek } }
for (const provider of ['openrouter', 'ollama', 'opencode-zen', 'opencode-go']) {
  for (const mode of ['auto', 'exact']) check(provider, 'legacy-missing', { priced: true, input: 0.15, mode: 'deepseek-peak' }, cfg(mode, { [provider + ':legacy-missing']: 'deepseek-v4-pro' }, fallbackPrices))
}
const ownLegacy = { ...prices, providers: { ...prices.providers, zen: { models: { 'gpt-6.1-sol': flat(99) } } } }
check('zen', 'openai/gpt-6.1-sol', { priced: true, input: 99 }, cfg('auto', {}, ownLegacy))
check('zen', 'gpt-6.1-sol', { priced: true, input: 99 }, cfg('exact', {}, ownLegacy))
const disabledDS = { ...prices, models: { 'deepseek-v4-flash': { unpriced: true } } }
check('deepseek', 'deepseek-v4-flash', { priced: false }, cfg('auto', {}, disabledDS))

// OpenRouter is full-ID exact-only in both modes; its variants have independent prices.
for (const mode of ['auto', 'exact']) {
  check('openrouter', 'google/gemini-3.8-flash', { priced: true, input: 0.9 }, cfg(mode))
  check('openrouter', 'google/gemini-3.8-flash:free', { priced: true, input: 0 }, cfg(mode))
  check('openrouter', 'google/gemini-3.8-flash:online', { priced: true, input: 1.2 }, cfg(mode))
  for (const model of ['gpt-6-astra', 'gemini-3.8-flash', 'google/gemini-3.8-flash-latest', 'google/gemini-3.8-flash:free:online']) {
    check('openrouter', model, { priced: false }, cfg(mode))
  }
}
check('custom-api', 'google/gemini-3.8-flash:free', { priced: false })
for (const variant of [':free', ':online', ' (free)', ' (online)']) {
  check('openai', 'gpt-6-astra' + variant, { priced: false })
  check('opencode-zen', 'openai/gpt-6.1-sol' + variant, { priced: false })
}

// Known local origins keep zero-cost precedence; explicit override remains an escape hatch.
for (const provider of ['ollama', 'llm-ollama', 'lmstudio', 'vllm']) check(provider, 'openai/gpt-6-astra', { priced: false })
check('custom-api', 'ollama/gpt-6-astra', { priced: false })
check('ollama', 'gpt-6-astra', { priced: true, input: 10 }, cfg('auto', { 'ollama:gpt-6-astra': 'openai:gpt-6-astra' }))

// Non-exact aliases must be unique; candidate date/version snapshots are never stripped.
for (const [model, candidates, expected] of [
  ['Claude Opus 4.8', ['claude-opus-4-8'], 'claude-opus-4-8'],
  ['claude-opus-4.8-latest', ['claude-opus-4-8'], 'claude-opus-4-8'],
  ['gpt-6.1-sol-2026-10-01', ['gpt-6.1-sol'], 'gpt-6.1-sol'],
  ['gpt-6.1-sol-v2-2026-10-01', ['gpt-6.1-sol-v2', 'gpt-6.1-sol'], 'gpt-6.1-sol-v2'],
  ['gpt-6.1-sol-128k', ['gpt-6.1-sol'], 'gpt-6.1-sol'],
  ['GPT 6.1 Sol (Go)', ['gpt-6.1-sol'], 'gpt-6.1-sol'],
  ['gpt6.1sol', ['gpt-6.1-sol', 'gpt_6.1_sol'], null],
  ['gpt6.1sol', ['gpt_6.1_sol', 'gpt-6.1-sol'], null],
  ['gpt-6.1-sol', ['gpt_6.1_sol', 'gpt-6.1-sol'], 'gpt-6.1-sol'],
  ['gpt-6.1-sol', ['gpt-6.1-sol-2026-09-01'], null],
  ['gpt-6.1-sol', ['gpt-6.1-sol-2026-09-01', 'gpt-6.1-sol-2026-09-02'], null],
  ['gpt-6.1-sol', ['gpt-6.1-sol-v2'], null],
  ['gpt-6.1-sol-2026-10-01', ['gpt-6.1-sol-2026-09-01'], null],
  ['gpt-6.1-sol:free', ['gpt-6.1-sol'], null],
  ['gpt-6.1-sol (online)', ['gpt-6.1-sol'], null],
]) {
  assert.equal(matchModelId(model, candidates), expected, `backend matcher: ${model}`)
  assert.equal(client.matchModelIdLocal(model, candidates), expected, `client matcher: ${model}`)
}
const ambiguous = { models: {}, default: {}, providers: {
  openai: { models: { 'shared-model': flat(1) } },
  google: { models: { 'shared-model': flat(2) } },
} }
check('custom-api', 'shared-model', { priced: false }, cfg('auto', {}, ambiguous))
check('deepseek', 'shared-model', { priced: false }, cfg('auto', {}, ambiguous))
check('openai', 'shared-model', { priced: true, input: 1 }, cfg('auto', {}, ambiguous))
check('google', 'shared-model', { priced: true, input: 2 }, cfg('auto', {}, ambiguous))

console.log(`[ok] pricing-model-matching: ${comparisons} backend/client cases, unique aliases, qualified IDs, scoped catalogs, OpenRouter variants, local origins`)
