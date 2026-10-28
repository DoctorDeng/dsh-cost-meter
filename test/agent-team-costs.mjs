import assert from 'node:assert/strict'
import { getSessionCost, getSessionListCosts, sessionCostIds, teamMemberIds } from '../lib/session-tree.js'
import { billingStatistics } from '../lib/billing-statistics.js'
import { getSessionBilling } from '../lib/turn-cost.js'
import { defaultConfig, localDayKey } from '../lib/store.js'

// DSH 0.2.0-rc.2 and 0.2.1-rc.2: agent-team/lib/types/projection.js
// snapshot().values contains durable state; wire.view adds lead/teammate roles.
const headers = [{ id: 'lead' }, { id: 'mate', parentSession: 'lead', origin: 'subagent' },
  { id: 'nested', parentSession: 'mate', origin: 'subagent' }, { id: 'fork', parentSession: 'lead' },
  { id: 'foreign', parentSession: 'other-lead', origin: 'subagent' }]
const row = (id, cost, calls = 1) => ({ id, cost, apiCost: cost / 2, input: 10, output: 2, calls,
  costCny: cost * 7, apiCostCny: cost * 3.5, costEur: cost * .9, apiCostEur: cost * .45, byProviderModel: {} })
const today = localDayKey(Date.now())
const ledger = { config: defaultConfig(), days: {
  '2020-01-01': { sessions: [row('lead', .1), row('mate', .2)] },
  [today]: { sessions: [row('lead', .02189559, 30), row('mate', .00590655), row('nested', .01), row('fork', 10), row('foreign', 20)] },
} }
const before = structuredClone(ledger)
let directoryReads = 0, snapshotReads = 0
const state = { id: 'lead', members: [{ id: 'mate', name: 'probe', description: '', provider: 'spawn', context: 'fresh', phase: 'active' }],
  tasks: [], messages: [], delivered: [], nextTaskNumber: 1 }
let projection = state
const sessions = { get: id => ({ id, header: headers.find(row => row.id === id), snapshotEvents: () => [] }), list: () => headers }
const query = { listSessions: async () => { directoryReads++; return headers } }
const projections = { snapshot: (session, keys) => {
  snapshotReads++; assert.deepEqual(keys, ['agentTeam'])
  return { values: { agentTeam: projection } }
} }
const ctx = { get: name => ({ sessions, sessionQuery: query, sessionProjections: projections }[name]) }
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`)
assert.equal(ledger.config.includeSubagentCost, false)
assert.deepEqual([...teamMemberIds(ctx, 'lead')], ['mate'], 'durable projection identifies the lead by team id, without roles')
const expectedScope = ['lead', 'mate', 'nested']
for (const shape of [state, { members: [{ id: 'lead', role: 'lead' }, { id: 'mate', role: 'teammate' }] }]) {
  projection = shape
  assert.deepEqual([...await sessionCostIds(ledger, ctx, 'lead')].sort(), expectedScope)
  const badge = await getSessionCost(ledger, ctx, 'lead')
  near(badge.own.cost + badge.subagents.cost, .33780214)
  assert.equal(badge.subagentCount, 2)
  const statsQuery = { sessionId: 'lead', from: today, to: today, basis: 'total' }
  const stats = billingStatistics(ledger, statsQuery, await sessionCostIds(ledger, ctx, 'lead'))
  near(stats.totals.cost, .03780214)
  assert.equal(stats.totals.calls, 32)
  const detail = await getSessionBilling(ledger, ctx, statsQuery)
  near(detail.recorded.cost, stats.totals.cost)
  near(detail.recorded.apiCost, stats.totals.apiCost)
  const all = await getSessionListCosts(ledger, ctx, { sessionIds: ['lead', 'mate', 'lead', 'fork', 'missing'], period: 'total' })
  assert.equal(all.length, 4)
  near(all[0].cost, badge.own.cost + badge.subagents.cost)
  near(all[0].apiCost, all[0].cost / 2)
  near(all[0].costCny, all[0].cost * 7)
  near(all[1].cost, .20590655, 'opening a teammate does not absorb the leader or siblings')
  assert.equal(all[2].cost, 10); assert.equal(all[3].found, false)
  const daily = await getSessionListCosts(ledger, ctx, { sessionIds: ['lead'], period: 'today' })
  near(daily[0].cost, stats.totals.cost)
}
assert.equal(directoryReads, 1, 'all entry points share the recent directory')
projection = { ...state, members: [...state.members, ...state.members, { id: 'lead' }, { id: '' }, null, { id: 'fork' }, { id: 'foreign' }] }
assert.deepEqual([...await sessionCostIds(ledger, ctx, 'lead')].sort(), expectedScope, 'deduplicate and exclude self, invalid, ordinary fork and foreign members')
for (const bad of [undefined, {}, { ...state, id: 'other-lead' }, { ...state, id: 'other-lead', members: [{ id: 'lead', role: 'lead' }, { id: 'mate', role: 'teammate' }] },
  { members: [{ id: 'mate', role: 'teammate' }] }, { ...state, members: {} }, { ...state, members: [] }, { ...state, members: [{ id: 'fork' }] }]) {
  projection = bad
  assert.deepEqual([...await sessionCostIds(ledger, ctx, 'lead')], ['lead'])
  near((await getSessionListCosts(ledger, ctx, { sessionIds: ['lead'], period: 'today' }))[0].cost, .02189559)
}
projection = state
const offline = { get: name => name === 'sessionProjections' ? projections : name === 'sessions' ? { get: sessions.get } : undefined }
assert.deepEqual([...await sessionCostIds(ledger, offline, 'lead')].sort(), ['lead', 'mate'], 'explicit membership still works without a directory')
const plain = { get: name => name === 'sessionQuery' ? { listSessions: () => { throw Error('ordinary disabled scope must not scan headers') } } : undefined }
near((await getSessionListCosts(ledger, plain, { sessionIds: ['lead'], period: 'today' }))[0].cost, .02189559)
const count = snapshotReads
await assert.rejects(getSessionListCosts(ledger, ctx, { sessionIds: [''], period: 'total' }))
assert.equal(snapshotReads, count, 'invalid queries are rejected before reading projections')
assert.deepEqual(ledger, before, 'all display reads leave every daily/session ledger row unchanged')
console.log('[ok] #420: durable/wire team projections, badge/statistics/details/list parity, nested agents, fork isolation, cached reads and unchanged ledger')
