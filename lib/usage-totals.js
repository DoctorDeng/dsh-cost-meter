/** Reasoning is part of output, not an additional token bucket. */
export function totalUsageTokens(usage) {
  return ['input', 'output', 'cacheRead', 'cacheWrite'].reduce((total, key) => {
    const value = usage?.[key]
    return total + (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
  }, 0)
}
