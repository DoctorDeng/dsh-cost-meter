// Execute the actual release CLI with an in-memory repository and recorded commands.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { join, dirname } from 'node:path'

const source = readFileSync(new URL('../scripts/release.mjs', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replace(/^const repoRoot = .*$/m, "const repoRoot = '.'")
const V = '9.8.7', TAG = 'v' + V, head = 'a'.repeat(40), old = 'b'.repeat(40)
function run(options = {}) {
  const files = new Map(Object.entries({
    'package.json': JSON.stringify({ version: V }),
    'install.ps1': `${TAG} ${TAG}/install.ps1 '${TAG}'`,
    'README.md': `version-${V} ${TAG}/install.ps1 #${TAG}`,
    'README.zh-CN.md': `version-${V} ${TAG}/install.ps1 #${TAG}`,
    'CHANGELOG.md': `# Changes\n\n## [${V}] - 2026-10-23\n\n- **Fixture** valid update.\n`,
    'docs/UPDATE-HISTORY.md': options.missingHistory ? '# History\n' : `# History\n\n## ${TAG}(2026-10-23)—— Fixture\n\n- Update\n`,
    ...(!options.missingNotes ? { [`docs/release-notes/${TAG}.md`]: 'Release fixture' } : {}),
  }))
  const commands = [], writes = [], errors = []
  const exit = { status: 0 }
  try {
    vm.runInNewContext(source, {
      readFileSync: path => { path = path.replaceAll('\\', '/'); if (!files.has(path)) throw Error('ENOENT ' + path); return files.get(path) },
      writeFileSync: (path, content) => { path = path.replaceAll('\\', '/'); files.set(path, content); writes.push(path) },
      existsSync: path => files.has(path.replaceAll('\\', '/')), mkdirSync() {}, join, dirname,
      console: { log() {}, error: message => errors.push(message) },
      process: { argv: ['node', 'release.mjs', ...(options.args ?? [])], exit: status => { exit.status = status; throw exit } },
      execFileSync(file, args) {
        commands.push([file, ...args])
        if (file === 'git') {
          if (args[0] === 'fetch') return ''
          if (args[0] === 'ls-remote') return options.remoteTag ? `${options.remoteTag}\trefs/tags/${TAG}\n` : ''
          if (args[0] === 'status') return args[1] === '--porcelain' ? (writes.includes('docs/UPDATE-HISTORY.md') ? ' M docs/UPDATE-HISTORY.md' : '') : '## master...origin/master'
          if (args[0] === 'rev-parse') {
            if (args.includes('--abbrev-ref')) return options.branch ?? 'master'
            if (args.at(-1) === 'origin/master') return head
            if (args.at(-1) === 'HEAD') return head
            if (args.at(-1) === `${TAG}^{commit}`) return options.localTag
            if (args.at(-1) === TAG && options.localTag) return options.localTag
            throw Error('unknown ref')
          }
          return ''
        }
        if (file === 'gh') {
          if (args[1] === 'view') {
            if (args.at(-1) !== 'tagName,isDraft,publishedAt') throw Error('Release missing')
            return JSON.stringify({ tagName: TAG, isDraft: false, publishedAt: '2026-10-23T00:00:00Z' })
          }
          return ''
        }
        throw Error('Unexpected external command: ' + file)
      },
    }, { timeout: 2000 })
  } catch (error) { if (error !== exit) throw error }
  return { status: exit.status, files, commands, writes, errors }
}

const regen = run({ args: ['--regen-notes'], missingHistory: true, missingNotes: true, branch: 'feature' })
assert.equal(regen.status, 0)
assert.match(regen.files.get('docs/UPDATE-HISTORY.md'), /v9\.8\.7/)
assert.match(regen.files.get(`docs/release-notes/${TAG}.md`), /valid update/)
assert.equal(regen.commands.length, 0, 'generating notes does not query, tag or push Git')
const wrongLocal = run({ localTag: old })
assert.equal(wrongLocal.status, 1)
assert.ok(!wrongLocal.commands.some(row => row[0] === 'gh'))
const wrongRemote = run({ localTag: head, remoteTag: old })
assert.equal(wrongRemote.status, 1)
assert.ok(!wrongRemote.commands.some(row => row[1] === 'push' || row[0] === 'gh'))
const retry = run({ localTag: head })
assert.equal(retry.status, 0)
assert.ok(retry.commands.some(row => row[0] === 'git' && row[1] === 'push' && row[3] === `refs/tags/${TAG}`), 'a prior local-only tag is pushed on retry')
assert.ok(retry.commands.some(row => row[0] === 'gh' && row[2] === 'create' && row.includes('--verify-tag')))
const dry = run({ args: ['--dry'], localTag: head, remoteTag: head })
assert.equal(dry.status, 0); assert.equal(dry.writes.length, 0)
assert.ok(!dry.commands.some(row => row[1] === 'push' || row[1] === 'fetch' || row[0] === 'gh' && row[2] === 'create'))
const absentNotes = run({ missingNotes: true })
assert.equal(absentNotes.status, 1); assert.equal(absentNotes.writes.length, 0)
console.log('[ok] release CLI: regeneration on a feature branch, tag mismatch refusal, missing remote tag retry, verify-tag and read-only dry run')
