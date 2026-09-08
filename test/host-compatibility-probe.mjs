// 仅供一次性 DSH Profile 验证；通过 --patch 加载，不随 npm 包发布。
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const name = 'cost-meter-compatibility-probe'
export const inject = ['costMeter']
export async function apply(ctx) {
  const repo = fileURLToPath(new URL('../', import.meta.url))
  const home = resolve(process.env.DSH_HOME ?? '.')
  assert.ok(relative(repo, home).startsWith('.tmp-compat-'), '探针只允许在本仓库一次性 .tmp-compat-* 目录运行')
  const profileRequire = createRequire(join(home, 'profiles', 'web', 'package.json'))
  const pluginRequire = createRequire(profileRequire.resolve('dsh-cost-meter'))
  const hostRequire = createRequire(resolve(process.env.CM_HOST_PACKAGE))
  const peers = {}
  for (const pkg of ['@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-home-paths']) {
    const viaPlugin = realpathSync(pluginRequire.resolve(pkg))
    const viaHost = realpathSync(hostRequire.resolve(pkg))
    assert.equal(viaPlugin, viaHost, `${pkg} 必须复用宿主的同一个模块文件`)
    peers[pkg] = true
  }
  const { Service } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/cordis')).href)
  const scoped = ctx.isolate('llm')
  const isolatedLlm = new Service(scoped, 'llm')
  await ctx.costMeter.updateConfig({ hideOfficialBalance: true, goQuota: { enabled: false }, sidebarStyle: 'compact' })
  const before = await ctx.costMeter.getState()
  for (const sessionId of ['cm-probe-parent', 'cm-probe-child', undefined]) {
    const stream = scoped.waterfall(isolatedLlm, 'llm/stream', {
      provider: 'cm-test', model: 'unknown-model', ...(sessionId ? { sessionId } : {}),
    }, () => (async function* () {
      yield { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })())
    for await (const chunk of stream) assert.ok(chunk.type)
  }
  const after = await ctx.costMeter.getState()
  assert.equal(after.today.calls - before.today.calls, 3, '隔离服务三次合成用量均入账')
  assert.equal(after.today.input - before.today.input, 300)
  const result = {
    hostVersion: hostRequire('./package.json').version,
    pluginVersion: pluginRequire('../package.json').version,
    sharedHostModules: peers,
    syntheticCalls: after.today.calls - before.today.calls,
    syntheticInputTokens: after.today.input - before.today.input,
    passed: true,
  }
  writeFileSync(join(home, 'compatibility-probe.json'), JSON.stringify(result, null, 2) + '\n')
  console.log('[cm-compatibility-probe] ' + JSON.stringify(result))
}
