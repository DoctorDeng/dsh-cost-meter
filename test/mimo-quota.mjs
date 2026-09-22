/**
 * 小米 MiMo Token Plan 额度适配回归:Cookie 归一化、三端点解析器(用量/详情/余额)、
 * 注册表与密钥目标登记、plan 轨分类别名、配置清洗与双端接线的存在性。
 * 夹具形态参照 CodexBar MiMoProviderTests(官方 data.monthUsage.items)与
 * cc-switch 社区脚本(兼容 data.usage.items)。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CODING_PLAN_PROVIDERS,
  CODING_PLAN_PROVIDER_IDS,
  CODING_PLAN_ENDPOINTS,
  MIMO_ENDPOINTS,
  MIMO_TOKEN_PLAN_PROVIDER_IDS,
  normalizeMimoCookie,
  parseMimoTokenPlanUsage,
  parseMimoTokenPlanDetail,
  parseMimoBalance,
  queryCodingPlan,
} from '../lib/coding-plans.js'
import { SECRET_TARGETS, secretRefOf, sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { planProviderIdOf, PLAN_PROVIDER_IDS, DEFAULT_PLAN_PROVIDER_CLASS } from '../lib/plan-billing.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── 注册表 / 端点 / 密钥目标 ─────────────────────────────────────────
assert.ok(CODING_PLAN_PROVIDER_IDS.includes('mimo'))
assert.equal(CODING_PLAN_PROVIDERS.mimo.credentialEnvs[0], 'MIMO_COOKIE')
assert.deepEqual(CODING_PLAN_ENDPOINTS.mimo, [MIMO_ENDPOINTS.usage])
for (const url of Object.values(MIMO_ENDPOINTS)) assert.match(url, /^https:\/\/platform\.xiaomimimo\.com\/api\/v1\//)
assert.ok(MIMO_TOKEN_PLAN_PROVIDER_IDS.includes('xiaomi-token-plan-cn'))
assert.ok(SECRET_TARGETS.includes('codingPlans.mimo'))
assert.equal(secretRefOf('codingPlans.mimo'), 'MIMO_COOKIE')

// ── Cookie 归一化:整段粘贴、前缀/引号容忍,缺必需字段或纯 Key 即无效 ──
const cookie = 'serviceToken="abc"; xiaomichatbot_ph="p"; api-platform_serviceToken="st"; userId=123; api-platform_slh="s"'
assert.equal(normalizeMimoCookie(cookie), cookie)
assert.equal(normalizeMimoCookie('Cookie: ' + cookie), cookie)
assert.equal(normalizeMimoCookie(`"${cookie}"`), cookie)
assert.equal(normalizeMimoCookie('api-platform_serviceToken="st"; x=1'), null) // 缺 userId
assert.equal(normalizeMimoCookie('userId=123'), null) // 缺 serviceToken 族
assert.equal(normalizeMimoCookie(''), null)
assert.equal(normalizeMimoCookie(null), null)
assert.equal(normalizeMimoCookie('tp-abcdef123456'), null) // 专用 Key 不是 Cookie

// queryCodingPlan 凭据前置:缺 Cookie / 非 Cookie 均为软失败(不发起网络请求)。
const stubT = (_locale, code) => code
await assert.rejects(queryCodingPlan('mimo', null, 'zh', stubT), e => e.soft === true && e.message === 'mimoCookieMissing')
await assert.rejects(queryCodingPlan('mimo', 'tp-abcdef', 'zh', stubT), e => e.soft === true && e.message === 'mimoCookieInvalid')

// ── 用量解析:官方形态(monthUsage.items,percent 为 used/limit 小数) ──
let windows = parseMimoTokenPlanUsage({
  code: 0,
  message: '',
  data: { monthUsage: { percent: 0.0505, items: [{ name: 'month_total_token', used: 10100158, limit: 200000000, percent: 0.0505 }] } },
})
assert.equal(windows.plan.percent, 5.1) // 5.050079% → 保留 1 位
assert.equal(windows.plan.resetsAt, '')

// 兼容形态(社区文档 usage.items,plan/补偿积分双窗)与 1% 边界直算
windows = parseMimoTokenPlanUsage({
  code: 0,
  data: { usage: { items: [
    { name: 'plan_total_token', used: 300, limit: 1000, percent: 0.3 },
    { name: 'compensation_total_token', used: 1, limit: 100 },
    { name: 'unknown_bucket', used: 0, limit: 50 },
  ] } },
})
assert.equal(windows.plan.percent, 30)
assert.equal(windows.compensation.percent, 1) // 1% 不被归一成 100%
assert.equal(windows.unknown_bucket.percent, 0)

// 非法输入 / 未知结构
assert.equal(parseMimoTokenPlanUsage(null), null)
assert.equal(parseMimoTokenPlanUsage({ code: 0, data: {} }), null)
assert.equal(parseMimoTokenPlanUsage({ code: 0, data: { monthUsage: { items: [{ name: 'x' }] } } }), null) // 无 used/limit/percent

// ── 详情解析:currentPeriodEnd 按北京时间(+08:00)解释 ────────────────
const detail = parseMimoTokenPlanDetail({ code: 0, message: '', data: { planCode: 'standard', currentPeriodEnd: '2026-05-04 23:59:59', expired: false } })
assert.equal(detail.planCode, 'standard')
assert.equal(detail.expired, false)
assert.equal(detail.resetsAt, new Date('2026-05-04T23:59:59+08:00').toISOString())
assert.deepEqual(parseMimoTokenPlanDetail({ code: 0, data: {} }), { planCode: '', expired: false, resetsAt: '' })
assert.equal(parseMimoTokenPlanDetail('bad'), null)

// ── 余额解析:字符串数值 + 币种符号 ─────────────────────────────────
assert.equal(parseMimoBalance({ code: 0, data: { balance: '25.51', currency: 'USD', cashBalance: '20', giftBalance: '5.51' } }), '$25.51')
assert.equal(parseMimoBalance({ code: 0, data: { balance: '3', currency: 'CNY' } }), '¥3.00')
assert.equal(parseMimoBalance({ code: 0, data: { cashBalance: '1.5' } }), '1.50')
assert.equal(parseMimoBalance({ code: 0, data: { balance: '-1' } }), null)
assert.equal(parseMimoBalance(null), null)

// ── plan 轨分类:DSH 侧 xiaomi-token-plan-* provider id 归入 mimo ────
assert.ok(PLAN_PROVIDER_IDS.includes('mimo'))
assert.equal(DEFAULT_PLAN_PROVIDER_CLASS.mimo, 'auto')
assert.equal(planProviderIdOf('mimo'), 'mimo')
assert.equal(planProviderIdOf('xiaomi-token-plan-cn'), 'mimo')
assert.equal(planProviderIdOf('LLM-Xiaomi-Token-Plan-SGP'), 'mimo') // llm- 前缀 + 大小写容忍

// ── 配置清洗:mimo 条目保留,未知 id 剔除 ─────────────────────────────
const defaults = sanitizeConfig({})
const configured = applyConfigPatch(defaults, { codingPlans: { mimo: { enabled: true, display: 'both', refreshMinutes: 30 }, bogus: { enabled: true } } })
assert.equal(configured.config.codingPlans.mimo.enabled, true)
assert.equal(configured.config.codingPlans.mimo.display, 'both')
assert.equal(configured.config.codingPlans.mimo.refreshMinutes, 30)
assert.equal(configured.config.codingPlans.bogus, undefined)
const normalized = sanitizeConfig({ codingPlans: { mimo: {} } }).codingPlans.mimo
assert.equal(normalized.enabled, false)
assert.equal(normalized.display, 'settings')
assert.equal(normalized.refreshMinutes, 15)

// ── 双端接线存在性:i18n(中英)、设置卡片行、客户端别名镜像、Cookie 说明 ──
const i18nSrc = readFileSync(resolve(root, 'src/client/01-open-styles-i18n.js'), 'utf8')
for (const key of ['codingPlanMimo:', 'mimoWindowPlan', 'mimoWindowCompensation', 'codingPlanWindowBalance']) {
  assert.equal(i18nSrc.split(key).length - 1, 2, `i18n key ${key} 应在中英两处出现`)
}
const panelsSrc = readFileSync(resolve(root, 'src/client/03-settings-panels-main.js'), 'utf8')
assert.ok(panelsSrc.includes("{ id: 'mimo', labelKey: 'codingPlanMimo' }"))
assert.ok(panelsSrc.includes('balanceAlertConfig')) // 内联 Cookie 获取提示
const sidebarSrc = readFileSync(resolve(root, 'src/client/02-validators-helpers-sidebar.js'), 'utf8')
assert.ok(sidebarSrc.includes('xiaomi-token-plan-cn')) // PLAN_PROVIDER_ALIASES_LOCAL 镜像
assert.ok(sidebarSrc.includes("mimo: 'MiMo'")) // 额度横条短标签
assert.ok(sidebarSrc.includes("t('mimoWindowPlan')")) // 窗口标签映射

console.log('[ok] mimo-quota')
