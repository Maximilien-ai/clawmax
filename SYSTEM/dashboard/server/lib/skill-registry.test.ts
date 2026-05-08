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
  parseRegistryJsonOutput,
  selectBestRegistryInstallName,
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
  assert(!tesslInstall.args.includes('codex'))

  const normalizedTessl = normalizeSkillRegistrySearchResults('tessl', {
    results: [
      { type: 'tile', fullName: 'odyssey4me/gmail', workspaceName: 'odyssey4me', tileName: 'gmail', description: 'Gmail tile', latestVersion: '0.1.2' },
      { workspace: 'acme', tile: 'review-skill', description: 'Review better', version: '1.0.0', tags: ['review'] },
      { name: 'gws-gmail', install_command: 'tessl install google-workspace/gws-gmail --agent openclaw --agent codex --yes' },
      { type: 'tile-skill', name: 'gmail', source: 'odyssey4me/gmail', description: 'Tile skill projection' },
      { type: 'git-skill', name: 'gmail-automation', source: 'https://github.com/example/repo', description: 'Should be filtered out' },
    ],
  })
  assert.strictEqual(normalizedTessl.results.length, 4)
  assert.strictEqual(normalizedTessl.results[0].full_name, 'odyssey4me/gmail')
  assert.strictEqual(normalizedTessl.results[0].install_name, 'odyssey4me/gmail')
  assert.strictEqual(normalizedTessl.results[0].latest_version, '0.1.2')
  assert.strictEqual(normalizedTessl.results[1].full_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[1].install_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[1].categories[0], 'review')
  assert.strictEqual(normalizedTessl.results[2].install_name, 'google-workspace/gws-gmail')
  assert.strictEqual(normalizedTessl.results[3].install_name, 'odyssey4me/gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'gmail', normalizedTessl.results), 'odyssey4me/gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'gws-gmail', normalizedTessl.results), 'google-workspace/gws-gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'google-workspace/gws-gmail', normalizedTessl.results), 'google-workspace/gws-gmail')
  const noisyParsed = parseRegistryJsonOutput(`- Searching registry...\n${JSON.stringify({ results: [{ fullName: 'odyssey4me/gmail', workspaceName: 'odyssey4me', tileName: 'gmail' }] })}`)
  assert.strictEqual(noisyParsed.results[0].fullName, 'odyssey4me/gmail')

  const normalizedShipables = normalizeSkillRegistrySearchResults('shipables', {
    skills: [{ name: 'github', description: 'GitHub skill' }],
    pagination: { total: 1 },
  })
  assert.strictEqual(normalizedShipables.results.length, 1)
  assert.strictEqual(normalizedShipables.total, 1)
  assert.strictEqual(selectBestRegistryInstallName('shipables', 'github', normalizedShipables.results), 'github')

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

  console.log('skill-registry.test.ts: 21 tests passed')
}

run()
