/** Official Qianwen CLI bridge (#146). Credentials remain owned by the CLI. */
import { execFile } from 'node:child_process'
import { access, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path'

export const QWEN_CLI_ARGS = Object.freeze(['usage', 'summary', '--format', 'json'])
const MESSAGES = {
  zh: {
    missing: '未找到千问 CLI。请在 DSH 所在机器安装 @qianwenai/qianwen-cli，运行 qianwen auth login，并重启 DSH 以更新 PATH。',
    auth: '千问 CLI 未登录或登录已过期，请在 DSH 所用系统账号下运行 qianwen auth login。',
    failed: '千问 CLI 查询失败，请运行 qianwen usage summary --format json 检查后重试。',
    timeout: '千问 CLI 查询超时，请检查网络后刷新。',
    invalid: '千问 CLI 返回的订阅额度格式无效，请更新 CLI 后重试。',
    unavailable: '千问 CLI 未返回有效订阅额度（可能未订阅、已失效或上游查询失败），请检查 CLI 或切换本地估算。',
    expiry: 'CLI 订阅到期', addon: '加量包剩余',
  },
  en: {
    missing: 'Qianwen CLI not found. Install @qianwenai/qianwen-cli on the DSH host, run qianwen auth login, then restart DSH to refresh PATH.',
    auth: 'Qianwen CLI login is missing or expired. Run qianwen auth login as the same OS user running DSH.',
    failed: 'Qianwen CLI query failed. Check qianwen usage summary --format json and retry.',
    timeout: 'Qianwen CLI query timed out. Check the network and refresh.',
    invalid: 'Qianwen CLI returned invalid subscription quota data. Update the CLI and retry.',
    unavailable: 'Qianwen CLI returned no valid subscription quota (unsubscribed, inactive, or an upstream failure). Check the CLI or select local estimates.',
    expiry: 'CLI subscription expiry', addon: 'Add-on remaining',
  },
}
const message = (locale, code) => MESSAGES[locale === 'en' ? 'en' : 'zh'][code]
const fail = (locale, code) => Object.assign(new Error(message(locale, code)), { code, soft: code === 'unavailable' || code === 'missing' || code === 'auth' })
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parseQwenSummary(payload, locale = 'zh') {
  const plan = record(payload) ? payload.token_plan : null
  if (!record(plan) || typeof plan.subscribed !== 'boolean') throw fail(locale, 'invalid')
  // The official CLI absorbs some upstream failures into subscribed=false.
  // Exhausted subscriptions also have subscribed=false in CLI 1.6.x, but their
  // explicit status and valid credit totals still provide a usable 100% reading.
  if ((!plan.subscribed && plan.status !== 'exhaust') || (plan.status !== undefined && !['valid', 'exhaust'].includes(plan.status))) throw fail(locale, 'unavailable')
  const total = plan.totalCredits, remaining = plan.remainingCredits
  if (!finite(total) || total <= 0 || !finite(remaining) || remaining > total) throw fail(locale, 'invalid')
  const used = total - remaining
  const fmt = value => value.toLocaleString('en-US', { maximumFractionDigits: 6 })
  const windows = {
    // Do not feed the ambiguous CLI period into monthly token estimates.
    quota: { percent: Math.round(used / total * 1000) / 10, resetsAt: '' },
    credits: { resetsAt: '', text: `${fmt(used)} / ${fmt(total)} Credits (CLI)` },
  }
  if (plan.addonRemaining !== undefined) {
    if (!finite(plan.addonRemaining)) throw fail(locale, 'invalid')
    windows.addon = { resetsAt: '', text: `${message(locale, 'addon')}: ${fmt(plan.addonRemaining)} Credits` }
  }
  // CLI 1.6.x maps resetDate from subscription EndTime, not the monthly reset.
  // Render it as text; never use it as a quota reset or a sampling boundary.
  if (typeof plan.resetDate === 'string' && plan.resetDate.length > 0) {
    const ms = Date.parse(plan.resetDate)
    if (!Number.isFinite(ms)) throw fail(locale, 'invalid')
    windows.expiry = { resetsAt: '', text: `${message(locale, 'expiry')}: ${new Date(ms).toISOString()}` }
  }
  return { windows }
}

/** Resolve PATH without a shell; Windows npm .cmd shims are never evaluated. */
export async function resolveQwenCli({ env = process.env, platform = process.platform } = {}) {
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? ''
  for (const raw of pathValue.split(platform === 'win32' ? ';' : delimiter)) {
    const dir = raw.replace(/^"(.*)"$/, '$1')
    // Empty/relative PATH entries must not execute a workspace-supplied program.
    if (!isAbsolute(dir)) continue
    if (platform === 'win32') {
      // npm global installs put the package next to the Windows shim.
      const root = join(dir, 'node_modules', '@qianwenai', 'qianwen-cli')
      try {
        const meta = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
        const bin = meta.bin?.qianwen
        if (meta.name === '@qianwenai/qianwen-cli' && typeof bin === 'string') {
          const target = resolve(root, bin), rel = relative(root, target)
          if (rel && !rel.startsWith('..') && !isAbsolute(rel) && (await stat(target)).isFile()) {
            return { file: process.execPath, args: [target] }
          }
        }
      } catch { /* Try the next installed executable. */ }
    }
    const file = join(dir, platform === 'win32' ? 'qianwen.exe' : 'qianwen')
    try {
      await access(file, platform === 'win32' ? constants.F_OK : constants.X_OK)
      if ((await stat(file)).isFile()) return { file, args: [] }
    } catch { /* Not installed in this PATH entry. */ }
  }
  return null
}

export async function queryQwenCli(locale = 'zh', options = {}) {
  const command = await resolveQwenCli(options)
  if (!command) throw fail(locale, 'missing')
  const { env = process.env, signal, timeoutMs = 15000, maxBuffer = 1024 * 1024 } = options
  const stdout = await new Promise((done, reject) => {
    const child = execFile(command.file, [...command.args, ...QWEN_CLI_ARGS], {
      encoding: 'utf8', windowsHide: true, shell: false, env, signal, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer,
    }, (error, out) => {
      // Never expose child output, command paths or credential-bearing errors.
      if (error) reject(fail(locale, error.code === 2 ? 'auth' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'invalid' : error.killed ? 'timeout' : 'failed'))
      else done(out)
    })
    child.stdin?.end()
  })
  let payload
  try { payload = JSON.parse(stdout) } catch { throw fail(locale, 'invalid') }
  return parseQwenSummary(payload, locale)
}
