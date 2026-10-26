import assert from 'node:assert/strict'
import { parseVolcengineUsage } from '../lib/coding-plans.js'
const windows = [{ Level: 'monthly', Percent: 18 }, { Level: 'daily', Percent: 0 }, { Level: 'weekly', Percent: 46 }, { Level: 'session', Percent: 14 }, { Level: 'AFPDaily', Percent: 0 }]
const shapes = [
  { Result: { QuotaUsage: windows } },
  { Result: { UsageDetails: windows.map(({ Level, Percent }) => ({ QuotaType: Level, Total: 100, Used: Percent })) } },
  { Result: Object.fromEntries(windows.map(({ Level, Percent }) => [Level, { percent: Percent }])) },
  { items: [{ product: 'coding-plan', periods: windows.map(({ Level, Percent }) => ({ label: Level, percent: Percent })) }] },
]
for (const shape of shapes) {
  const result = parseVolcengineUsage(shape)
  assert.deepEqual(Object.keys(result).sort(), ['fiveHour', 'monthly', 'weekly'])
  assert.equal(result.fiveHour.percent, 14)
  assert.equal(result.weekly.percent, 46)
  assert.equal(result.monthly.percent, 18)
}
assert.equal(parseVolcengineUsage({ Result: { QuotaUsage: [{ Level: 'daily', Percent: 0 }] } }), null)
assert.equal(parseVolcengineUsage({ Result: { daily: { percent: 0 } } }), null)
assert.equal(parseVolcengineUsage({ Result: { QuotaUsage: [{ Level: 'unknown', Percent: 20 }] } }), null)
assert.equal(parseVolcengineUsage({ Result: { QuotaUsage: [{ Level: 'session', Percent: 0 }] } }).fiveHour.percent, 0, 'real zero usage remains visible')
console.log('[ok] Volcano Coding Plan accepts only 5h/week/month across all response formats')
