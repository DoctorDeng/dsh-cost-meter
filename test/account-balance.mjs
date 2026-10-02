// 账号渠道余额:DSH 桌面版登录官方账号后钱包由宿主账号服务持有(deepseekAccount),
// 用户通常不保存开放平台 Key;本文件驱动真实 apply() 服务验证来源优先级与失败语义。
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../lib/index.js'
import { stateSchema } from '../lib/typert.host.js'

const root = mkdtempSync(join(tmpdir(), 'cm-account-balance-'))
const envNames = ['DSH_HOME', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_API_KEY', 'DSH_DEEPSEEK_API_KEY', 'DEEPSEEK_BALANCE_API_KEY']
const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]))
const originalFetch = globalThis.fetch
const dedicatedKey = 'TEST_DEDICATED_BALANCE_KEY'
const modelKey = 'TEST_MODEL_PLATFORM_KEY'
const balanceBody = { is_available: true, balance_infos: [{ currency: 'USD', total_balance: '3.00', granted_balance: '0.00', topped_up_balance: '3.00' }] }
// 实测形态:零余额报 0E-16(指数写法),主钱包为 CNY。
const usdZero = { currency: 'USD', balance: '0E-16' }
const cnyMain = { currency: 'CNY', balance: '9.9498186300000000' }
const cnyBonus = { currency: 'CNY', balance: '1.00' }
const totalOf = (main, bonus) => Number(main.balance) + Number(bonus.balance)

/** 独立实例:balanceCache 在服务内,复用会命中缓存。 */
function mount({ account = null, section = {}, secrets = {} }) {
  const requests = [], accountCalls = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, headers: init.headers ?? {}, redirect: init.redirect })
    return Response.json(balanceBody)
  }
  let service
  apply({
    get: name => name === 'settings'
      ? { get: () => section }
      : name === 'credentials'
        ? { resolve: async ref => (secrets[String(ref)] ? { value: secrets[String(ref)] } : undefined) }
        : name === 'deepseekAccount'
          ? (account === null ? undefined : {
            getBalance: async client => {
              accountCalls.push(client)
              return account(client)
            },
          })
          : undefined,
    provide: (name, value) => { if (name === 'costMeter') service = value },
    on: () => () => {}, inject() {}, effect: () => {}, logger: { info() {}, warn() {}, error() {} },
  })
  return { service, requests, accountCalls }
}

/** 每个场景一份账本:locale 决定消息语言,config.balance.display 决定余额卡片是否启用。 */
function useHome(tag, env = {}) {
  const dir = join(root, tag)
  mkdirSync(join(dir, 'storages', 'cost-meter'), { recursive: true })
  writeFileSync(join(dir, 'storages', 'cost-meter', 'ledger.json'), JSON.stringify({
    version: 1,
    days: {},
    config: { locale: 'en', goQuota: { enabled: false }, balance: { display: 'both' } },
  }))
  process.env.DSH_HOME = dir
  for (const name of envNames) if (name !== 'DSH_HOME') delete process.env[name]
  for (const [name, value] of Object.entries(env)) process.env[name] = value
}

try {
  // ① 登录官方账号且没有任何开放平台 Key:余额来自账号服务,不发官方余额请求。
  useHome('account-only')
  const ready = mount({ account: () => ({ status: 'ready', value: [usdZero, cnyMain], bonusWallets: [cnyBonus] }) })
  let result = await ready.service.refreshBalance()
  assert.equal(result.ok, true, '账号渠道可直接返回余额(无需开放平台 Key)')
  assert.equal(result.state.balance.status, 'ok', '账号钱包映射为 ok 状态')
  assert.equal(result.state.balance.currency, 'CNY', '多币种按既有规则挑选(零余额 USD 让位 CNY)')
  assert.equal(result.state.balance.totalBalance, totalOf(cnyMain, cnyBonus), '总额为充值钱包 + 赠送钱包')
  assert.equal(result.state.balance.toppedUpBalance, Number(cnyMain.balance), '充值钱包单列')
  assert.equal(result.state.balance.grantedBalance, Number(cnyBonus.balance), '赠送钱包单列')
  assert.equal(result.state.balance.keyConfigured, false, '账号渠道不涉及专用凭据')
  assert.equal(ready.requests.length, 0, '账号可用时不再请求 api.deepseek.com')
  assert.equal(ready.accountCalls.length, 1, '每个刷新周期只问一次账号服务')
  stateSchema.parse(result.state)
  // 账号服务要求 client 是对象(缺省会在拼 x-client-* 头时抛错);插件不伪造构建号。
  assert.deepEqual(ready.accountCalls[0], {
    version: '',
    locale: 'en',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }, 'client 元数据为对象且只带宿主可观测字段')

  // ② 专用凭据优先于账号渠道:用户显式指定的 Key 固定走官方开放平台端点。
  useHome('dedicated-wins', { DEEPSEEK_BALANCE_API_KEY: dedicatedKey })
  const dedicated = mount({ account: () => ({ status: 'ready', value: [cnyMain], bonusWallets: [] }) })
  result = await dedicated.service.refreshBalance()
  assert.equal(result.ok, true, '专用凭据路径可用')
  assert.equal(dedicated.requests.at(-1).url, 'https://api.deepseek.com/user/balance', '专用凭据固定请求官方端点')
  assert.equal(dedicated.requests.at(-1).headers.authorization, 'Bearer ' + dedicatedKey)
  assert.equal(dedicated.accountCalls.length, 0, '专用凭据存在时不查询账号服务')

  // ③ 未登录(null):回退到模型凭据,桌面版未登录用户行为不变。
  useHome('signed-out')
  const signedOut = mount({
    account: () => null,
    section: { apiKeyEnv: 'DSH_DEEPSEEK_API_KEY' },
    secrets: { DSH_DEEPSEEK_API_KEY: modelKey },
  })
  result = await signedOut.service.refreshBalance()
  assert.equal(result.ok, true, '未登录时回退模型凭据')
  assert.equal(signedOut.requests.at(-1).headers.authorization, 'Bearer ' + modelKey)
  assert.equal(result.state.balance.currency, 'USD', '回退路径沿用 balance_infos 口径')

  // ④ 已登录但账号侧查询失败:报账号侧失败,不回退模型凭据、不显示为零余额。
  useHome('account-failed')
  const failed = mount({
    account: () => ({ status: 'failed' }),
    section: { apiKeyEnv: 'DSH_DEEPSEEK_API_KEY' },
    secrets: { DSH_DEEPSEEK_API_KEY: modelKey },
  })
  result = await failed.service.refreshBalance()
  assert.equal(result.ok, false, '账号侧失败不报成功')
  assert.equal(result.state.balance.status, 'off', '软失败不写死 error(下个周期自动重试)')
  assert.match(result.state.balance.message, /official account/i, '提示指向账号登录状态')
  assert.equal(failed.requests.length, 0, '账号侧失败不得改发开放平台请求')
  stateSchema.parse(result.state)

  // ⑤ 账号服务本身抛错(凭据记录损坏/宿主版本差异):视为不可用,退回既有模型凭据路径。
  useHome('account-throws')
  const thrown = mount({
    account: () => { throw new Error('PlatformAuthError: storage') },
    section: { apiKeyEnv: 'DSH_DEEPSEEK_API_KEY' },
    secrets: { DSH_DEEPSEEK_API_KEY: modelKey },
  })
  result = await thrown.service.refreshBalance()
  assert.equal(result.ok, true, '账号服务抛错时不阻断模型凭据路径')
  assert.equal(thrown.requests.at(-1).headers.authorization, 'Bearer ' + modelKey)

  // ⑥ 无账号服务(web/CLI profile):来源与改动前一致。
  useHome('no-account-service')
  const legacy = mount({ account: null, section: { apiKeyEnv: 'DSH_DEEPSEEK_API_KEY' }, secrets: { DSH_DEEPSEEK_API_KEY: modelKey } })
  result = await legacy.service.refreshBalance()
  assert.equal(result.ok, true, '无账号服务时行为不变')
  assert.equal(legacy.requests.length, 1)

  // ⑦ 账号已登录但钱包列表为空:不算余额来源,继续回退模型凭据。
  useHome('account-empty-wallets')
  const empty = mount({
    account: () => ({ status: 'ready', value: [], bonusWallets: [] }),
    section: { apiKeyEnv: 'DSH_DEEPSEEK_API_KEY' },
    secrets: { DSH_DEEPSEEK_API_KEY: modelKey },
  })
  result = await empty.service.refreshBalance()
  assert.equal(result.ok, true, '空钱包列表回退模型凭据')
  assert.equal(empty.requests.length, 1)

  // ⑧ 幂等与脱敏:重复刷新不重复请求账号服务之外的来源,快照不含凭据。
  const state = (await ready.service.refreshBalance()).state
  assert.equal(ready.requests.length, 0, '账号渠道不会因为重复刷新而改发官方余额请求')
  assert.ok(!JSON.stringify(state).includes(dedicatedKey), '快照不含专用凭据')
  assert.ok(!JSON.stringify(state).includes(modelKey), '快照不含模型凭据')

  console.log('[ok] 账号渠道余额(来源优先级/回退/失败语义/多币种/赠送钱包/脱敏)通过')
} finally {
  globalThis.fetch = originalFetch
  for (const [name, value] of Object.entries(saved)) value === undefined ? delete process.env[name] : process.env[name] = value
  rmSync(root, { recursive: true, force: true })
}
