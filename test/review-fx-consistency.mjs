import assert from 'node:assert/strict'
import { parseExternalUsageSnapshot } from '../lib/external-usage.js'
import { repairLedgerPricing, sanitizeConfig, zeroDay, localDayKey } from '../lib/store.js'
import { repairDailySessionTotals } from '../lib/ledger-totals.js'
const now = Date.parse('2026-10-23T10:00:00Z'), date = localDayKey(now)
const price = { cacheHit: 0, cacheMiss: 7.2, output: 0, billingMode: 'flat' }
for (const currency of ['USD', 'EUR', 'CNY']) {
  const config = sanitizeConfig({ priceOverrides:{'fixture:m':'__custom__'}, currency, exchangeRate: {USD:1, EUR:.9, CNY:7.2}[currency], fxRates:{USD:1, CNY:7.2, EUR:.9}, prices:{custom:{'fixture:m':{...price,currency:'CNY'}}} })
  const parsed = parseExternalUsageSnapshot({ fetchedAt:new Date(now).toISOString(), source:'fixture', records:[{id:'1',at:new Date(now).toISOString(),provider:'fixture',model:'m',input:1e6,output:0,cached:0}] },config,now)
  assert.equal(parsed.combined.today.cost,1, currency+' display must not change CNY billing')
  const row = {input:1e6, output:0,cacheRead:0,cacheWrite:0,reasoning:0,calls:1,cost:2,apiCost:2,costCny:14,apiCostCny:14,costEur:1.8,apiCostEur:1.8}
  const day = {...zeroDay(date),...row,byProviderModel:{'fixture:m':{...row}},sessions:[{...row,id:'s',byProviderModel:{'fixture:m':{...row}}}]}
  const ledger = {config,days:{[date]:day}}
  repairLedgerPricing(ledger)
  for(const item of [day,day.sessions[0],day.byProviderModel['fixture:m'],day.sessions[0].byProviderModel['fixture:m']]) {
    assert.equal(item.cost,1, currency+' repair uses CNY FX')
    assert.equal(item.costCny,7,'repair preserves the recorded CNY rate and updates the amount')
    assert.equal(item.costEur,.9,'repair updates frozen EUR amount')
  }
  const before = structuredClone(day); repairLedgerPricing(ledger);assert.deepEqual(day,before,'repair is idempotent')
}
const row={input:1,output:0,cacheRead:0,cacheWrite:0,reasoning:0,calls:1,cost:1,apiCost:1,costCny:7,apiCostCny:7}
const day={...row,byProviderModel:{'p:m':{...row,costCny:99,apiCostCny:99}},sessions:[{...row,id:'s',byProviderModel:{'p:m':{...row}}}]}
assert.deepEqual(repairDailySessionTotals({[date]:day}),[date])
assert.equal(day.byProviderModel['p:m'].costCny,7,'frozen model total is repaired even when USD totals already agree')
assert.deepEqual(repairDailySessionTotals({[date]:day}),[])
console.log('[ok] CNY billing independent of display currency; repaired amounts retain recorded FX; model frozen totals reconciled')

// A legacy model bucket without recorded FX cannot prove a zero-currency total.
delete day.sessions[0].byProviderModel['p:m'].costCny
delete day.sessions[0].byProviderModel['p:m'].apiCostCny
assert.deepEqual(repairDailySessionTotals({[date]:day}),[])
assert.equal(day.byProviderModel['p:m'].costCny,7)
