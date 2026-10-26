/** Keep HTTP rejection metadata separate from response bodies and credentials. */
export function balanceHttpError(message, response, now = Date.now()) {
  const error = new Error(message)
  const status = response.status
  if (![401, 403, 429].includes(status)) return error
  error.balanceRetry = true
  if (status === 429) {
    const raw = String(response.headers?.get?.('retry-after') ?? '').trim()
    const deadline = /^\d+$/.test(raw) ? now + Number(raw) * 1000 : Date.parse(raw)
    error.balanceRateLimited = true
    error.balanceRetryAt = Number.isFinite(deadline) && deadline > now ? deadline : 0
  }
  return error
}

/** Authentication failures wait between polls; rate limits also gate manual refresh. */
export function balanceRetryState(error, interval, now = Date.now()) {
  if (!error?.balanceRetry) return {}
  return {
    fetchedAt: now,
    ...(error.balanceRateLimited ? { retryUntil: Math.max(now + interval, error.balanceRetryAt || 0) } : {}),
  }
}
