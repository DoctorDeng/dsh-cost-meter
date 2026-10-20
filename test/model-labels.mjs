import assert from 'node:assert/strict'
import { createModelLabelReader } from '../lib/model-labels.js'
const read = createModelLabelReader(), calls = []
const llm = { listProviders: () => [{ id: 'qoder', name: 'Qoder' }, { id: 'qoder-global', name: 'Qoder Global' }],
  listModels: async provider => { calls.push(provider); return [{ provider, id: 'dfmodel', name: 'DeepSeek-Flash' }, { provider: 'other', id: 'wrong', name: 'Wrong' }] } }
const keys = ['qoder:dfmodel', 'qoder-global:dfmodel', 'qoder:missing', 'qoder:wrong']
const [a, b] = await Promise.all([read(llm, keys), read(llm, keys)])
assert.deepEqual(a, { 'qoder:dfmodel': 'Qoder:DeepSeek-Flash', 'qoder-global:dfmodel': 'Qoder Global:DeepSeek-Flash' })
assert.deepEqual(a, b); assert.equal(calls.length, 2)
await read(llm, keys); assert.equal(calls.length, 2)
assert.deepEqual(await read({}, keys), {})
assert.deepEqual(await read({ listModels: () => { throw Error('removed') } }, keys), {})
assert.equal((await read({ ...llm, listModels: async provider => [{ provider, id: 'dfmodel', name: 'Renamed' }] }, keys))['qoder:dfmodel'], 'Qoder:Renamed')
console.log('[ok] #335 adapter model/provider display names, route isolation, shared cache, missing metadata and service replacement')
