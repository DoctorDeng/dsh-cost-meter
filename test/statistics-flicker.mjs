/**
 * 回归测试:费用明细弹窗「每轮刷新闪一下」。
 *
 * 现象(issue):打开费用明细弹窗后,每次会话推进一个轮次,弹窗内容整体消失并
 * 退回「加载统计…」,约 0.1s 后恢复(实测弹窗高度 1001px→385px,空白 111ms)。
 *
 * 根因:宿主每次 buildState 都取 Date.now()(lib/index.js),因此每次 getState 的
 * state.meta.now 都不同;统计页把它当成「数据变了、该重取」的键(src/statistics/
 * index.js),而重取又会先清空已渲染内容 —— 于是纯时间流逝也会清空弹窗。
 *
 * 本测试锁定两条不变式(都不依赖 React,直接测纯函数):
 *   A. 重取期间必须保留上一次的值(否则弹窗塌陷闪烁);
 *   B. 取数失败也必须保留上一次的值(否则刷新失败会白屏);
 *   C. 只有「换 query」才允许清空(切换筛选/分页时旧值属于别的数据集);
 *   D. 重取键不得包含 state.meta.now(否则每次轮询都触发无谓重取)。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'

const source = readFileSync(new URL('../lib/client.statistics.js', import.meta.url), 'utf8')
let factory
runInContext(source, createContext({ window: { __ModuleLoader__: { load: value => { factory = value.factory } } } }), { filename: 'lib/client.statistics.js' })
assert.ok(typeof factory === 'function', 'client.statistics.js 注册了 factory')
// 只取纯函数:本测试不需要 React 运行时。
const ui = factory(() => ({ createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, Fragment: null }))
const { requestStart, requestValue, requestFailure, showsPlaceholder } = ui
for (const [name, fn] of Object.entries({ requestStart, requestValue, requestFailure, showsPlaceholder })) {
  assert.ok(typeof fn === 'function', `导出纯函数 ${name}`)
}

const KEY_A = JSON.stringify({ from: '2026-10-01', to: '2026-10-06', offset: 0 })
const KEY_B = JSON.stringify({ from: '2026-10-01', to: '2026-10-06', offset: 50 })
const PAGE = { totals: { calls: 28, cost: 0.2722 }, days: [] }
const NEXT_PAGE = { totals: { calls: 31, cost: 0.3104 }, days: [] }
const initial = { value: null, error: '', loading: true, key: null }

// ── C. 首次取数:无旧值,显示占位 ──────────────────────────────────────────
const first = requestStart(initial, KEY_A)
assert.equal(first.loading, true, '首次取数进入 loading')
assert.equal(first.value, null, '首次取数无旧值')
assert.equal(showsPlaceholder(first), true, '首次取数显示「加载中」占位')

// ── 取数成功:写入值 ───────────────────────────────────────────────────────
const loaded = requestValue(KEY_A, PAGE)
assert.equal(loaded.value, PAGE, '成功后写入新值')
assert.equal(loaded.loading, false)
assert.equal(showsPlaceholder(loaded), false, '有值时不显示占位')

// ── A. 核心回归:同 query 重取必须保留旧值(这正是「闪一下」的修复点)──────
const refetch = requestStart(loaded, KEY_A)
assert.equal(refetch.value, PAGE, '重取期间保留上一次的值(修复前此处为 null → 弹窗清空闪烁)')
assert.equal(refetch.loading, true, '重取期间标记 loading(供无障碍状态,但不清屏)')
assert.equal(showsPlaceholder(refetch), false, '有旧值时不得显示占位(否则仍会闪)')

// ── B. 取数失败也必须保留旧值(刷新失败不该白屏)──────────────────────────
const failed = requestFailure(refetch, KEY_A, new Error('rpc down'))
assert.equal(failed.value, PAGE, '失败时保留旧值,不把已有金额换成空白')
assert.equal(failed.error, 'rpc down', '失败原因被记录')
assert.equal(showsPlaceholder(failed), false, '有旧值时失败也不显示占位')

// ── C. 换 query 必须清空(切换筛选/分页时旧值属于别的数据集)──────────────
const switched = requestStart(loaded, KEY_B)
assert.equal(switched.value, null, '换 query 时清空旧值,避免把上一页数据显示成当前页')
assert.equal(showsPlaceholder(switched), true, '换 query 时显示占位')
// 换 query 后失败,同样不得复用过期的旧值。
assert.equal(requestFailure(switched, KEY_B, new Error('boom')).value, null, '换 query 后失败不得复用旧值')

// ── 取数成功后 error 必须清空(否则残留错误提示)──────────────────────────
assert.equal(requestValue(KEY_A, NEXT_PAGE).error, '', '成功后清空上一次的错误')

// ── 无值 + 无 loading 且无 error:不显示占位(避免空态闪烁)────────────────
assert.equal(showsPlaceholder({ value: null, error: '', loading: false, key: KEY_A }), false, '无值且已结束时不显示占位')

// ── D. 源码断言:重取键不得含 meta.now ─────────────────────────────────────
const statsSource = readFileSync(new URL('../src/statistics/index.js', import.meta.url), 'utf8')
assert.ok(!/revision \+ ':' \+ state\.meta\.now/.test(statsSource), '重取键不得再使用 state.meta.now(每次轮询都变 → 无谓重取 + 清屏)')
assert.ok(/state\.meta\.dayKey/.test(statsSource), '重取键保留 dayKey:跨零点换日仍会自动刷新')
assert.ok(/state\.total\?\.calls/.test(statsSource), '重取键纳入已入账调用数:新用量入账仍会自动刷新')

console.log('[ok] #费用明细弹窗闪烁:重取保留旧值、失败保留旧值、换 query 才清空、重取键不含 meta.now')
