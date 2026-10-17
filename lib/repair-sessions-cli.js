#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { listSessionLogFiles } from './session-log-files.js'
import { repairSessionLog } from './session-log-repair.js'

async function main() {
  const { values } = parseArgs({ options: {
    write: { type: 'boolean', default: false },
    'sessions-root': { type: 'string' }, 'host-modules': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) {
    console.log('dsh-cost-meter-repair-sessions [--sessions-root <目录>] [--write] [--host-modules <node_modules>]\n默认只检查。退出所有 DSH 后加 --write 修复；每份受影响日志先保留原样备份。\n写入需要同次 npx 安装 @deepseek-ai/dsh，或用 --host-modules 指向现有宿主的 node_modules。')
    return
  }
  const root = resolve(values['sessions-root'] ?? join(resolveDshHome(), 'sessions'))
  if (!(await lstat(root)).isDirectory()) throw new Error('会话根目录不存在或不是目录')
  let acquireLease, disposeHost = async () => {}
  if (values.write) {
    const require = createRequire(values['host-modules'] ? join(resolve(values['host-modules']), '__cost_meter_repair__.cjs') : import.meta.url)
    let backend
    try { backend = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')).href) }
    catch { throw new Error('未找到可用宿主：请在 npx 命令中同时指定 --package=@deepseek-ai/dsh，或传 --host-modules') }
    if (typeof backend.default?.prototype?.acquireLease === 'function') {
      acquireLease = (directory, id) => backend.default.prototype.acquireLease.call(null, id, undefined, directory)
    } else if (typeof backend.apply === 'function') {
      // New hosts keep the backend class private. Mount its public plugin in
      // an EMPTY temporary root: startup must never scan or migrate user logs.
      const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
      const host = new Context(), leaseRoot = await mkdtemp(join(tmpdir(), 'cm-repair-lease-'))
      disposeHost = async () => {
        try { await host.fiber.dispose() }
        finally {
          if (dirname(leaseRoot) !== resolve(tmpdir())) throw new Error('Unexpected temporary lease root')
          await rm(leaseRoot, { recursive: true, force: true })
        }
      }
      try {
        await host.plugin(backend, { root: leaseRoot, compression: 'none' }).await()
        const service = host.get('sessionPersistence')
        if (typeof service?.acquireLease !== 'function') throw new Error('该宿主没有兼容的会话锁接口，未写入任何日志')
        acquireLease = (directory, id) => service.acquireLease(id, undefined, directory)
      } catch (error) { await disposeHost(); throw error }
    } else throw new Error('该宿主没有兼容的会话锁接口，未写入任何日志')
  }
  const totals = { scanned: 0, affected: 0, events: 0, repaired: 0, failed: 0 }
  console.log(`${values.write ? '修复' : '只读检查'}：${root}`)
  try {
    for (const path of listSessionLogFiles(root, null, true)) {
      totals.scanned++
      try {
        const result = await repairSessionLog(path, { write: values.write, acquireLease })
        if (!result.changedEvents) continue
        totals.affected++; totals.events += result.changedEvents
        if (result.written) totals.repaired++
        console.log(JSON.stringify({ path, events: result.changedEvents, written: result.written, backup: result.backup }))
      } catch (error) {
        totals.failed++
        console.error(JSON.stringify({ path, error: error.message }))
      }
    }
  } finally { await disposeHost() }
  console.log(JSON.stringify(totals))
  if (totals.failed) process.exitCode = 1
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
