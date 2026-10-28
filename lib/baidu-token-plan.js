import { fetchWithRetry, readJsonBounded } from './net.js'

// Official console contract and evidence: docs/baidu-token-plan.md.
// The model API key is not a console credential. Never return the resource's apiKey.
export const BAIDU_TOKEN_PLAN_URL = 'https://console.bce.baidu.com/api/qianfan/charge/tokenPlanPersonal/resource'

export function normalizeBaiduCookie(value) {
  if (typeof value !== 'string' || /[\r\n\x00-\x1f\x7f]/.test(value) || value.length > 16384) return null
  const cookie = value.trim().replace(/^cookie:\s*/i, '')
  const parts = cookie.split(';').filter(part => part.trim())
  return parts.length && parts.some(part => /=\s*\S/.test(part))
    && parts.every(part => /^\s*[^=\s;]+=[^;]*$/.test(part)) ? cookie : null
}

const number = value => (typeof value === 'number' || (typeof value === 'string' && value.trim()))
  && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
const expiryOf = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  // BCE console wall-clock timestamps are in China Standard Time, independent of host timezone.
  const date = new Date(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? value.replace(' ', 'T') + '+08:00' : value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function parseBaiduTokenPlan(data, locale = 'zh', now = Date.now()) {
  if (data?.success !== true || !Array.isArray(data.result?.items)) return null
  const item = data.result.items.find(row => row && typeof row === 'object'
    && row.resourceStatus !== 'Released' && (expiryOf(row.expiresAt)?.getTime() ?? Infinity) > now)
  if (!item || !['credit', 'token', undefined].includes(item.billingMode)) return null
  const credit = item.billingMode === 'credit'
  const used = number(credit ? item.usedCredits : item.usedTokens)
  const total = number(credit ? item.totalCredits : item.totalTokens)
  if (used === null || total === null || total <= 0) return null
  const unit = credit ? locale === 'en' ? 'credits' : '积分' : 'Tokens'
  const format = value => value.toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 4 })
  const expiry = expiryOf(item.expiresAt)
  return {
    windows: {
      monthly: { percent: Math.min(100, Math.round(used / total * 1000) / 10), resetsAt: '' },
      usage: { text: `${format(used)} / ${format(total)} ${unit}`, resetsAt: '' },
    },
    // Subscription expiry is not the monthly quota reset time.
    message: expiry ? (locale === 'en' ? 'Expires: ' : '套餐到期：')
      + expiry.toLocaleString(locale === 'en' ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) + ' (UTC+8)' : '',
  }
}

export async function queryBaiduTokenPlan(key, locale, { signal } = {}) {
  const text = (zh, en) => locale === 'en' ? en : zh
  const fail = (kind, soft = false) => {
    const messages = {
      cookie: text('请填写百度智能云控制台的完整 Cookie，或配置 BAIDU_QIANFAN_COOKIE；推理 API Key 不用于额度查询。', 'Enter the full Baidu Cloud console Cookie or set BAIDU_QIANFAN_COOKIE; inference API keys cannot query quotas.'),
      login: text('百度智能云登录已过期，请登录 console.bce.baidu.com 并重新复制 Cookie。', 'Baidu Cloud login expired. Sign in at console.bce.baidu.com and copy a fresh Cookie.'),
      usage: text('未读取到有效的千帆 Token Plan 个人版额度，请在控制台确认套餐状态。', 'No active Qianfan Token Plan Personal quota found. Check the subscription in the console.'),
      network: text('千帆额度查询失败，请稍后重试。', 'Qianfan quota request failed. Please retry later.'),
    }
    const error = new Error(messages[kind]); error.soft = soft; return error
  }
  signal?.throwIfAborted()
  const cookie = normalizeBaiduCookie(key)
  if (!cookie) throw fail('cookie', true)
  let response
  try {
    response = await fetchWithRetry(BAIDU_TOKEN_PLAN_URL, {
      method: 'GET', headers: { cookie, accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      redirect: 'manual', signal,
    }, { timeoutMs: 15000, attempts: 2 })
  } catch { signal?.throwIfAborted(); throw fail('network') }
  if (!response.ok) {
    try { await response.body?.cancel?.() } catch {}
    if ([401, 403].includes(response.status) || (response.status >= 300 && response.status < 400)) throw fail('login', true)
    throw fail('network')
  }
  let data
  try { data = await readJsonBounded(response, 262144, { signal }) }
  catch { signal?.throwIfAborted(); throw fail('usage') }
  signal?.throwIfAborted()
  if (data?.message?.redirect || [401, 403, '401', '403'].includes(data?.code)) throw fail('login', true)
  const result = parseBaiduTokenPlan(data, locale)
  if (!result) throw fail('usage', true)
  return { ...result, endpoint: BAIDU_TOKEN_PLAN_URL }
}
