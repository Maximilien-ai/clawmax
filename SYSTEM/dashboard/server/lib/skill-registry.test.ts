import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSkillRegistryInstallCommands,
  buildSkillRegistrySearchCommands,
  discoverInstalledRegistrySkillDirs,
  getSkillRegistryProviderMeta,
  normalizeSkillRegistryProvider,
  normalizeSkillRegistrySearchResults,
} from './skill-registry'

function run() {
  assert.strictEqual(normalizeSkillRegistryProvider(undefined), 'shipables')
  assert.strictEqual(normalizeSkillRegistryProvider('shipables'), 'shipables')
  assert.strictEqual(normalizeSkillRegistryProvider('tessl'), 'tessl')
  assert.strictEqual(getSkillRegistryProviderMeta('tessl').label, 'Tessl')

  const shipablesSearch = buildSkillRegistrySearchCommands('shipables', 'github', 20)[0]
  assert.strictEqual(shipablesSearch.command, 'npx')
  assert(shipablesSearch.args.includes('@senso-ai/shipables'))

  const tesslSearch = buildSkillRegistrySearchCommands('tessl', 'review', 20)[0]
  assert.strictEqual(tesslSearch.command, 'npx')
  assert(tesslSearch.args.includes('@tessl/cli@latest'))
  assert(tesslSearch.args.includes('--type'))
  assert(tesslSearch.args.includes('skills'))

  const tesslInstall = buildSkillRegistryInstallCommands('tessl', 'acme/briefing-skill')[0]
  assert(tesslInstall.args.includes('--agent'))
  assert(tesslInstall.args.includes('openclaw'))
  assert(tesslInstall.args.includes('codex'))

  const normalizedTessl = normalizeSkillRegistrySearchResults('tessl', {
    results: [
      { workspace: 'acme', tile: 'review-skill', description: 'Review better', version: '1.0.0', tags: ['review'] },
      { name: 'gws-gmail', install_command: 'tessl install google-workspace/gws-gmail --agent openclaw --agent codex --yes' },
    ],
  })
  assert.strictEqual(normalizedTessl.results.length, 2)
  assert.strictEqual(normalizedTessl.results[0].full_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[0].install_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[0].categories[0], 'review')
  assert.strictEqual(normalizedTessl.results[1].install_name, 'google-workspace/gws-gmail')

  const normalizedShipables = normalizeSkillRegistrySearchResults('shipables', {
    skills: [{ name: 'github', description: 'GitHub skill' }],
    pagination: { total: 1 },
  })
  assert.strictEqual(normalizedShipables.results.length, 1)
  assert.strictEqual(normalizedShipables.total, 1)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessl-skill-registry-test-'))
  try {
    const tesslSkillDir = path.join(tmpDir, '.codex', 'skills', 'review-skill')
    fs.mkdirSync(tesslSkillDir, { recursive: true })
    fs.writeFileSync(path.join(tesslSkillDir, 'SKILL.md'), '# Review Skill\n', 'utf-8')

    const discovered = discoverInstalledRegistrySkillDirs('tessl', tmpDir)
    assert.strictEqual(discovered.length, 1)
    assert(discovered[0].endsWith(path.join('.codex', 'skills', 'review-skill')))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log('skill-registry.test.ts: 11 tests passed')
}

run()
