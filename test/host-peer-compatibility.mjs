// #195: exercise the real DSH admission check and startup bundle selection.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

assert.ok(process.env.DSH_TEST_NODE_MODULES, 'set DSH_TEST_NODE_MODULES to the pinned 0.2 host dependencies')
const req = createRequire(join(resolve(process.env.DSH_TEST_NODE_MODULES), '__peer_test.cjs'))
const { evaluatePluginCompatibility, getDshRuntimeVersion, loadProfileDirectory } = await import(pathToFileURL(req.resolve('@deepseek-ai/dsh-app-boot')).href)
const hostVersion = JSON.parse(readFileSync(new URL('fixtures/next-host/package.json', import.meta.url), 'utf8')).dependencies['@deepseek-ai/dsh']
assert.equal(getDshRuntimeVersion(), hostVersion, 'run against the pinned host version')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const peerNames = ['@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-home-paths']
const oldRange = '^0.1.0-rc.6 || ^0.1.1-0 || ^0.1.2-0 || ^0.1.3-0 || ^0.1.5-0'
const previous = { ...pkg, peerDependencies: Object.fromEntries(peerNames.map(name => [name, oldRange])) }
const originalFailure = evaluatePluginCompatibility(previous)
assert.deepEqual(Object.keys(originalFailure.requirements ?? originalFailure.peers).sort(), [...peerNames].sort())
assert.equal(originalFailure.exempted, false, 'old range reproduces rejection without exemptions')
for (const version of ['0.1.0-rc.6', '0.1.0-rc.8', '0.1.2-rc.1', '0.1.3-alpha.2', '0.1.5-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.0', '0.2.1-alpha.1', '0.2.1-alpha.4', hostVersion, '0.2.1']) {
  assert.equal(evaluatePluginCompatibility(pkg, {}, version), undefined, `declared range admits ${version}`)
}
for (const version of ['0.1.0-rc.5', '0.2.0-alpha.1', '0.2.0-rc.0', '0.3.0-alpha.1', '0.3.0', '1.0.0']) {
  assert.ok(evaluatePluginCompatibility(pkg, {}, version), `range still excludes ${version}`)
}
for (const name of peerNames) {
  assert.ok(evaluatePluginCompatibility({ ...pkg, peerDependencies: { ...pkg.peerDependencies, [name]: oldRange } }), `both peers must admit the host: ${name}`)
  // npm's default prerelease semantics must also accept the actual peer version.
  for (const version of ['0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.4', hostVersion]) assert.ok(req('semver').satisfies(version, pkg.peerDependencies[name]))
  assert.equal(req('semver').satisfies(hostVersion, pkg.peerDependencies[name].replace(' || ^0.2.1-0', '')), false, 'the old range excludes alpha.5 under standard npm semantics')
  assert.equal(req('semver').satisfies('0.3.0-alpha.1', pkg.peerDependencies[name]), false)
}

const work = mkdtempSync(join(tmpdir(), 'cm-host-peers-'))
try {
  for (const [label, manifest] of [['previous', previous], ['fixed', pkg]]) {
    const profile = join(work, label)
    const plugin = join(profile, 'node_modules', pkg.name)
    mkdirSync(plugin, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'peer-profile-' + label, private: true, dsh: { profile: { bundles: [pkg.name] } } }))
    writeFileSync(join(plugin, 'package.json'), JSON.stringify(manifest))
    copyFileSync(new URL('../cordis.patch.yml', import.meta.url), join(plugin, 'cordis.patch.yml'))
    const loaded = loadProfileDirectory('dsh', profile, req.resolve('@deepseek-ai/dsh/package.json'))
    if (label === 'previous') {
      assert.equal(loaded.layers.length, 0)
      assert.equal(loaded.skippedBundles.length, 1)
      assert.ok(loaded.skippedBundles[0].reason.includes('incompatible with dsh ' + hostVersion))
    } else {
      assert.deepEqual(loaded.skippedBundles, [])
      assert.equal(loaded.layers.length, 1)
      assert.equal(loaded.layers[0].packageName, pkg.name)
      assert.ok(loaded.layers[0].patches.length > 0, 'startup includes the actual cost-meter bundle patch')
    }
  }
  console.log('[ok] #195: real host admission, version boundaries, old silent-skip control and fixed bundle loading')
} finally {
  assert.equal(dirname(work), tmpdir())
  rmSync(work, { recursive: true, force: true })
}
