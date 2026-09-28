import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_PROVIDER_PRICE_TABLE, DEFAULT_PRICE_TABLE, buildPriceCatalog, costOf, normalizePrice, providerPriceEntryFor } from '../lib/pricing.js'

// MiMo V2.6 三个型号补价:此前目录只有 2.5 系,mimo-v2.6-* 一律被模糊匹配到
// mimo-v2.5,pro 少算 3.1 倍、速度优先档少算 31 倍。价目以官方 pay-as-you-go
// 页为准(USD 表:命中 $0.0036/$0.0028/$0.036、未命中 $0.435/$0.14/$4.35、
// 输出 $0.87/$0.28/$8.7),Go 目录条目随 Go 表值(pro 命中 $0.003625)。

const prices = { models: DEFAULT_PRICE_TABLE, default: DEFAULT_PRICE_TABLE.default, providers: DEFAULT_PROVIDER_PRICE_TABLE }
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} != ${expected}`)
const tiersOf = (provider, model) => {
  const r = providerPriceEntryFor(provider, model, prices, { mode: 'auto' })
  assert.equal(r.priced, true, `${provider}/${model} 已定价`)
  return r.entry
}

// ① xiaomi 目录:三型号三档价锁定。
{
  const pro = tiersOf('xiaomi', 'mimo-v2.6-pro')
  near(pro.cacheHit, 0.0036, 'pro 命中价')
  near(pro.cacheMiss, 0.435, 'pro 未命中价')
  near(pro.output, 0.87, 'pro 输出价')
  const flash = tiersOf('xiaomi', 'mimo-v2.6-flash')
  near(flash.cacheHit, 0.0028, 'flash 命中价')
  near(flash.cacheMiss, 0.14, 'flash 未命中价')
  near(flash.output, 0.28, 'flash 输出价')
  const ultra = tiersOf('xiaomi', 'mimo-v2.6-pro-ultraspeed')
  near(ultra.cacheHit, 0.036, 'ultraspeed 命中价')
  near(ultra.cacheMiss, 4.35, 'ultraspeed 未命中价')
  near(ultra.output, 8.7, 'ultraspeed 输出价')
}

// ② 速度优先档不再套 2.5 价(回归:模糊匹配曾把 2.6 全系落到 mimo-v2.5)。
{
  const ultra = tiersOf('xiaomi', 'mimo-v2.6-pro-ultraspeed')
  const pro = tiersOf('xiaomi', 'mimo-v2.6-pro')
  near(ultra.cacheMiss, pro.cacheMiss * 10, 'ultraspeed 未命中价为 pro 的 10 倍')
  assert.notEqual(ultra.cacheMiss, DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models['mimo-v2.5'].input, '未误套 mimo-v2.5 价')
  assert.notEqual(pro.cacheMiss, DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models['mimo-v2.5'].input, 'pro 未误套 mimo-v2.5 价')
  // 变体形态(大小写 / 日期快照后缀)同样精确命中 2.6 条目。
  for (const variant of ['MiMo-V2.6-Pro-UltraSpeed', 'mimo-v2.6-pro-ultraspeed-2026-09-28']) {
    near(tiersOf('xiaomi', variant).cacheMiss, 4.35, `${variant} 命中 ultraspeed 条目`)
  }
  for (const variant of ['MiMo-V2.6-Pro', 'mimo-v2.6-pro-2026-09-28']) {
    near(tiersOf('xiaomi', variant).cacheMiss, 0.435, `${variant} 命中 pro 条目`)
  }
}

// ③ DSH 侧渠道别名与空 provider 走同一份价(跨目录兜底取 xiaomi 条目)。
{
  for (const provider of ['mimo', 'xiaomimimo', 'xiaomi-token-plan-cn', 'xiaomi-token-plan-sgp', '']) {
    near(tiersOf(provider, 'mimo-v2.6-pro-ultraspeed').cacheMiss, 4.35, `${provider || '(空)'} 渠道兜底命中 ultraspeed`)
    near(tiersOf(provider, 'mimo-v2.6-flash').cacheMiss, 0.14, `${provider || '(空)'} 渠道兜底命中 flash`)
  }
}

// ④ opencode-go 目录:2.6-Pro / 2.6-Flash 在册(随 Go 表值),2.5 系不变。
{
  const goPro = tiersOf('opencode-go', 'mimo-v2.6-pro')
  near(goPro.cacheHit, 0.003625, 'Go 目录 pro 命中价(表值)')
  near(goPro.cacheMiss, 0.435, 'Go 目录 pro 未命中价')
  near(goPro.output, 0.87, 'Go 目录 pro 输出价')
  const goFlash = tiersOf('opencode-go', 'mimo-v2.6-flash')
  near(goFlash.cacheHit, 0.0028, 'Go 目录 flash 命中价')
  near(goFlash.cacheMiss, 0.14, 'Go 目录 flash 未命中价')
  // 速度优先档不在 Go 目录:渠道自报 opencode-go 时按「宽泛包含」落到同目录的
  // pro 条目;小米各渠道与空 provider 均精确命中 ultraspeed(见 ②③),真实计费
  // 只有前两条路,故此处锁定包含匹配的落点,不指望跨目录兜底。
  const goUltra = providerPriceEntryFor('opencode-go', 'mimo-v2.6-pro-ultraspeed', prices, { mode: 'auto' })
  near(goUltra.entry.cacheMiss, 0.435, 'Go 目录内 ultraspeed 落 pro 条目(包含匹配)')
  const old = DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models
  near(old['mimo-v2.5'].input, 0.14, '2.5 未命中价保持不变')
  near(old['mimo-v2.5'].output, 0.28, '2.5 输出价保持不变')
  near(old['mimo-v2.5-pro'].input, 0.435, '2.5-pro 未命中价保持不变')
  near(old['mimo-v2.5-pro'].output, 0.87, '2.5-pro 输出价保持不变')
  assert.ok(String(old['mimo-v2.5'].notes).includes('即将下线'), '2.5 标注官方下线提示')
  assert.ok(String(old['mimo-v2.5-pro'].notes).includes('即将下线'), '2.5-pro 标注官方下线提示')
}

// ⑤ 家族分组与随包 json 同步(挂载入口与外部对表消费)。
{
  const catalog = buildPriceCatalog()
  assert.deepEqual(Object.keys(catalog.xiaomi['MiMo V2.6']), ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed'], 'xiaomi 目录 V2.6 家族三型号')
  assert.ok(catalog.xiaomi['MiMo V2.5']['mimo-v2.5'] !== undefined, 'V2.5 家族保留')
  assert.ok(catalog['opencode-go']['MiMo']['mimo-v2.6-pro'] !== undefined && catalog['opencode-go']['MiMo']['mimo-v2.6-flash'] !== undefined, 'Go 目录 MiMo 家族含 2.6 两型号')
  const shipped = JSON.parse(readFileSync(new URL('../docs/provider-pricing.json', import.meta.url), 'utf8'))
  for (const id of ['mimo-v2.6-pro', 'mimo-v2.6-flash', 'mimo-v2.6-pro-ultraspeed']) {
    assert.ok(shipped.providers.xiaomi.models[id] !== undefined, `发布的 json 目录含 ${id}`)
  }
  assert.ok(shipped.providers['opencode-go'].models['mimo-v2.6-pro'] !== undefined, '发布的 json 目录 Go 侧含 mimo-v2.6-pro')
  near(shipped.providers.xiaomi.models['mimo-v2.6-pro-ultraspeed'].output, 8.7, '发布的 json 目录 ultraspeed 输出价')
}

// ⑥ 计价冒烟:1M 未命中输入 + 1M 输出。
{
  const now = Date.parse('2026-09-28T06:00:00Z')
  const noPeak = { enabled: false }
  near(costOf({ input: 1_000_000, output: 1_000_000 }, normalizePrice(DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models['mimo-v2.6-pro']), now, noPeak), 1.305, 'pro 1M+1M = $1.305')
  near(costOf({ input: 1_000_000, output: 1_000_000 }, normalizePrice(DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models['mimo-v2.6-pro-ultraspeed']), now, noPeak), 13.05, 'ultraspeed 1M+1M = $13.05')
  near(costOf({ input: 1_000_000, output: 1_000_000 }, normalizePrice(DEFAULT_PROVIDER_PRICE_TABLE.xiaomi.models['mimo-v2.6-flash']), now, noPeak), 0.42, 'flash 1M+1M = $0.42')
}

console.log('[ok] mimo-v26-pricing')
