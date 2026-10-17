/** OpenDesign public list prices and workspace-scoped, read-only billing queries. */
import { fetchWithRetry, readJsonBounded } from './net.js'

export const OPENDESIGN_API = 'https://amr-api.open-design.ai/api/v1'
export const OPENDESIGN_PRICES_URL = OPENDESIGN_API + '/public/model-prices'
export const OPENDESIGN_PROVIDER_IDS = ['opendesign', 'open-design', 'open-design-api', 'amr-link.open-design.ai']
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const rate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e6
const id = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
const queryError = (message, soft = false) => Object.assign(new Error(message), { opendesignPublic: true, ...(soft ? { soft: true } : {}) })
export function normalizeOpenDesignWorkspace(value) {
  if (value === undefined || value === '') return ''
  return typeof value === 'string' && id(value.trim()) ? value.trim() : null
}

/** The public API explicitly uses USD per million tokens; never apply a 1M conversion twice. */
export function parseOpenDesignPrices(value, checkedAt = new Date().toISOString().slice(0, 10)) {
  if (!object(value) || !Array.isArray(value.data) || value.data.length > 10000) throw Error('OpenDesign: invalid public price catalog')
  const models = Object.create(null)
  const tier = raw => {
    if (!object(raw) || !rate(raw.input) || !rate(raw.output)) return null
    if (['cacheRead', 'cacheWrite'].some(key => raw[key] !== undefined && !rate(raw[key]))) return null
    return { cacheMiss: raw.input, output: raw.output,
      ...(raw.cacheRead !== undefined ? { cacheHit: raw.cacheRead } : {}), ...(raw.cacheWrite !== undefined ? { cacheWrite: raw.cacheWrite } : {}) }
  }
  for (const row of value.data) {
    if (!object(row) || typeof row.model !== 'string' || !/^[\w./:@+-]{1,200}$/.test(row.model) || ['__proto__', 'constructor', 'prototype'].includes(row.model)) throw Error('OpenDesign: invalid model id')
    if (Object.hasOwn(models, row.model)) throw Error('OpenDesign: duplicate model price')
    if (row.pricing?.unit !== '1m_tokens' || row.pricing?.currency !== 'USD') throw Error('OpenDesign: unsupported pricing unit or currency')
    const price = tier(row.pricing)
    if (!price) throw Error('OpenDesign: invalid token price')
    if (row.pricing.longContext !== undefined) {
      const raw = row.pricing.longContext, long = tier(raw)
      if (!long || !Number.isSafeInteger(raw.inputTokensAbove) || raw.inputTokensAbove <= 0) throw Error('OpenDesign: invalid long-context price')
      price.longContext = { aboveInputTokens: raw.inputTokensAbove, ...long }
    }
    models[row.model] = { ...price, billingMode: 'flat', sourceUrl: OPENDESIGN_PRICES_URL, checkedAt }
  }
  if (!Object.keys(models).length) throw Error('OpenDesign: empty public price catalog')
  return { models }
}

/** Each quota window is an independent simultaneous limit, not an additive balance. */
export function parseOpenDesignUsage(value, workspaceId) {
  if (!object(value) || value.workspaceId !== workspaceId || value.workspaceMemberId !== undefined && !id(value.workspaceMemberId) || typeof value.eligible !== 'boolean'
    || !Array.isArray(value.windows) || value.windows.length > 32) return null
  const windows = {}, seen = new Set()
  for (const row of value.windows) {
    if (!object(row) || typeof row.policyId !== 'string' || !row.policyId || seen.has(row.policyId)
      || !Number.isSafeInteger(row.durationSeconds) || row.durationSeconds <= 0
      || !['usedCredits', 'remainingCredits', 'limitCredits'].every(key => typeof row[key] === 'string' && /^\d{1,80}$/.test(row[key]))) return null
    seen.add(row.policyId)
    const used = BigInt(row.usedCredits), remaining = BigInt(row.remainingCredits), limit = BigInt(row.limitCredits)
    if (limit <= 0n || remaining > limit || remaining !== (used >= limit ? 0n : limit - used)) return null
    const resetsAt = row.resetsAt == null ? '' : typeof row.resetsAt === 'string' && Number.isFinite(Date.parse(row.resetsAt)) ? new Date(row.resetsAt).toISOString() : null
    if (resetsAt === null) return null
    const duration = row.durationSeconds, base = duration === 18000 ? 'fiveHour' : duration === 604800 ? 'weekly' : 'window_' + duration + 's'
    const key = Object.hasOwn(windows, base) ? base + '_' + seen.size : base
    windows[key] = { percent: Number((used > limit ? limit : used) * 100000n / limit) / 1000, resetsAt }
  }
  if (value.eligible && !Object.keys(windows).length) return null
  if (!value.eligible && value.windows.length) return null
  return windows
}

export function parseOpenDesignWallet(value, workspaceId) {
  if (!object(value) || value.billingScopeVersion !== 2 || value.workspaceId !== workspaceId || !id(value.workspaceMemberId)
    || typeof value.balanceUsd !== 'string' || !/^-?\d{1,12}(?:\.\d{1,12})?$/.test(value.balanceUsd)) return null
  return { text: '$' + value.balanceUsd, resetsAt: '' }
}

export async function queryOpenDesignQuota(key, locale, t, { workspaceId, signal, fetchImpl } = {}) {
  const zh = locale === 'zh', workspace = normalizeOpenDesignWorkspace(workspaceId)
  if (!workspace) throw Object.assign(new Error(zh ? 'OpenDesign：请先填写工作区 ID。' : 'OpenDesign: configure a workspace ID first.'), { soft: true })
  if (typeof key !== 'string' || !key.trim()) throw Object.assign(new Error(zh
    ? 'OpenDesign：额度查询需要 Control Key（OPENDESIGN_CONTROL_KEY / VELA_CONTROL_KEY），不能使用推理 API Key。'
    : 'OpenDesign: quota queries require a Control Key (OPENDESIGN_CONTROL_KEY / VELA_CONTROL_KEY), not an inference API key.'), { soft: true })
  const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  const timer = setTimeout(() => controller.abort(), 15000); timer.unref?.()
  const prefix = OPENDESIGN_API + '/workspaces/' + encodeURIComponent(workspace)
  const read = async path => {
    const response = await fetchWithRetry(prefix + path, { method: 'GET', redirect: 'error', signal: combined,
      headers: { accept: 'application/json', authorization: 'Bearer ' + key.trim(), 'x-vela-workspace-id': workspace } }, { attempts: 2, fetchImpl })
    if (!response.ok) {
      try { await response.body?.cancel?.() } catch {}
      const error = queryError(t(locale, response.status === 401 || response.status === 403 ? 'codingPlanUnauthorized' : 'codingPlanHttp',
        { provider: 'OpenDesign', code: String(response.status), url: prefix + path }), response.status === 401 || response.status === 403)
      throw error
    }
    return readJsonBounded(response, 256 * 1024)
  }
  try {
    // Sequential reads let an invalid identity/auth response stop before a second request.
    const usage = await read('/billing/coding-plan-usage')
    const windows = parseOpenDesignUsage(usage, workspace)
    if (!windows) throw queryError(zh ? 'OpenDesign：额度响应的工作区、成员或数据无效。' : 'OpenDesign: invalid quota response or workspace/member identity.')
    const wallet = await read('/wallet/balance'), balance = parseOpenDesignWallet(wallet, workspace)
    if (!balance || usage.workspaceMemberId !== undefined && wallet.workspaceMemberId !== usage.workspaceMemberId) throw queryError(zh ? 'OpenDesign：钱包与额度的工作区成员不一致。' : 'OpenDesign: wallet and quota member identities do not match.')
    combined.throwIfAborted()
    return { windows: { ...windows, balance }, endpoint: prefix + '/billing/coding-plan-usage' }
  } catch (error) {
    combined.throwIfAborted()
    // Never put an upstream body, arbitrary network exception or credential in the UI.
    if (error?.opendesignPublic === true) throw error
    throw Error(zh ? 'OpenDesign：查询失败，请检查控制端凭据、工作区权限和网络。' : 'OpenDesign: query failed; check the control credential, workspace access and connection.')
  } finally { clearTimeout(timer) }
}
