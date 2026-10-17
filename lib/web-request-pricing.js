/** Official Search/Fetch request fees, separate from model tokens and local HTTP fetches. */
export const WEB_REQUEST_PATHS = { '/v1/tools/search': 'search', '/v1/tools/fetch': 'fetch' }
export const WEB_REQUEST_RATE_CNY = 5 / 1000
export const isWebRequestModel = (provider, model) => provider === 'deepseek-official' && ['deepseek-web-search', 'deepseek-web-fetch'].includes(model)
export function validRequestFee(fee) {
  return fee && ['search', 'fetch'].includes(fee.kind) && fee.requests === 1 && fee.rateCny === WEB_REQUEST_RATE_CNY
}
export function webRequestUsage(value, path) {
  const kind = WEB_REQUEST_PATHS[path]
  if (!kind || !value || typeof value !== 'object' || value.error) return null
  if (kind === 'search' ? !Array.isArray(value.results) : typeof value.content !== 'string' || typeof value.title !== 'string') return null
  if (kind === 'search' ? value.results.length === 0 : !value.content.trim()) return { skipped: true }
  return { model: `deepseek-web-${kind}`, requestFee: { kind, requests: 1, rateCny: WEB_REQUEST_RATE_CNY },
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } }
}
