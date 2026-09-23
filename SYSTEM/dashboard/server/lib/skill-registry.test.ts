import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  buildSkillRegistryInstallCommands,
  buildSkillRegistrySearchCommands,
  discoverInstalledRegistrySkillDirs,
  getSkillRegistryProviderMeta,
  getTesslInstallBlockerMessage,
  normalizeSkillRegistryProvider,
  normalizeSkillRegistrySearchResults,
  parseRegistryJsonOutput,
  resolveImportableRegistrySkillDirs,
  selectBestRegistryInstallName,
} from './skill-registry'

function run() {
  assert.strictEqual(normalizeSkillRegistryProvider(undefined), 'clawhub')
  assert.strictEqual(normalizeSkillRegistryProvider('clawhub'), 'clawhub')
  assert.strictEqual(normalizeSkillRegistryProvider('shipables'), 'shipables')
  assert.strictEqual(normalizeSkillRegistryProvider('tessl'), 'tessl')
  assert.strictEqual(getSkillRegistryProviderMeta('clawhub').label, 'ClawHub')
  assert.strictEqual(getSkillRegistryProviderMeta('tessl').label, 'Tessl')
  assert.strictEqual(getSkillRegistryProviderMeta('clawhub').catalogSizeLabel, 'about 100 skills')
  assert.strictEqual(getSkillRegistryProviderMeta('shipables').catalogSizeLabel, 'about 250 skills')
  assert.strictEqual(getSkillRegistryProviderMeta('tessl').catalogSizeLabel, 'about 1,000 skills')

  const clawhubSearch = buildSkillRegistrySearchCommands('clawhub', 'github', 20)[0]
  assert.strictEqual(clawhubSearch.command, 'npx')
  assert(clawhubSearch.args.includes('clawhub@latest'))
  assert(clawhubSearch.args.includes('search'))

  const clawhubInstall = buildSkillRegistryInstallCommands('clawhub', 'github')[0]
  assert(clawhubInstall.args.includes('install'))
  assert(clawhubInstall.args.includes('--dir'))
  assert(clawhubInstall.args.includes('skills'))

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
      { type: 'tile', fullName: 'odyssey4me/gmail', workspaceName: 'odyssey4me', tileName: 'gmail', description: 'Gmail tile', latestVersion: '0.1.2', url: 'https://docs.example.com/gmail', emoji: '📫' },
      { workspace: 'acme', tile: 'review-skill', description: 'Review better', version: '1.0.0', tags: ['review'] },
      { name: 'gws-gmail', install_command: 'tessl install google-workspace/gws-gmail --agent openclaw --agent codex --yes' },
      { type: 'tile-skill', name: 'gmail', source: 'odyssey4me/gmail', description: 'Tile skill projection' },
      { type: 'git-skill', name: 'gmail-automation', source: 'https://github.com/example/repo', description: 'Should be filtered out' },
    ],
  })
  assert.strictEqual(normalizedTessl.results.length, 3)
  assert.strictEqual(normalizedTessl.results[0].full_name, 'odyssey4me/gmail')
  assert.strictEqual(normalizedTessl.results[0].install_name, 'odyssey4me/gmail')
  assert.strictEqual(normalizedTessl.results[0].latest_version, '0.1.2')
  assert.strictEqual(normalizedTessl.results[0].homepage, 'https://docs.example.com/gmail')
  assert.strictEqual(normalizedTessl.results[0].emoji, '📫')
  assert.strictEqual(normalizedTessl.results[1].full_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[1].install_name, 'acme/review-skill')
  assert.strictEqual(normalizedTessl.results[1].categories[0], 'review')
  assert.strictEqual(normalizedTessl.results[2].install_name, 'google-workspace/gws-gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'gmail', normalizedTessl.results), 'odyssey4me/gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'gws-gmail', normalizedTessl.results), 'google-workspace/gws-gmail')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'google-workspace/gws-gmail', normalizedTessl.results), 'google-workspace/gws-gmail')
  const noisyParsed = parseRegistryJsonOutput(`- Searching registry...\n${JSON.stringify({ results: [{ fullName: 'odyssey4me/gmail', workspaceName: 'odyssey4me', tileName: 'gmail' }] })}`)
  assert.strictEqual(noisyParsed.results[0].fullName, 'odyssey4me/gmail')
  assert(getTesslInstallBlockerMessage('Skipped odyssey4me/gmail due to security review.\n⚠ Use --dangerously-ignore-security to bypass.'))
  assert(getTesslInstallBlockerMessage('✘ Security  Risky · Do not use without reviewing'))
  assert.strictEqual(getTesslInstallBlockerMessage('All good'), null)

  const normalizedShipables = normalizeSkillRegistrySearchResults('shipables', {
    skills: [{ name: 'github', description: 'GitHub skill' }],
    pagination: { total: 1 },
  })
  assert.strictEqual(normalizedShipables.results.length, 1)
  assert.strictEqual(normalizedShipables.total, 1)
  assert.strictEqual(selectBestRegistryInstallName('shipables', 'github', normalizedShipables.results), 'github')

  const normalizedClawhub = normalizeSkillRegistrySearchResults('clawhub', {
    items: [{ slug: 'gog', description: 'Google Workspace CLI', downloadsWeekly: 42, repositoryUrl: 'https://clawhub.dev/skills/gog', icon: '🎮' }],
  })
  assert.strictEqual(normalizedClawhub.results.length, 1)
  assert.strictEqual(normalizedClawhub.results[0].install_name, 'gog')
  assert.strictEqual(normalizedClawhub.results[0].downloads_weekly, 42)
  assert.strictEqual(normalizedClawhub.results[0].homepage, 'https://clawhub.dev/skills/gog')
  assert.strictEqual(normalizedClawhub.results[0].emoji, '🎮')

  for (const [field, value] of [
    ['full_name', 'acme/alpha@1.0'],
    ['registry_name', 'acme/alpha@1.0'],
    ['packageName', 'acme/alpha@1.0'],
    ['purl', 'acme/alpha@1.0'],
    ['installCommand', 'tessl install acme/alpha@1.0 --yes'],
    ['command', 'tessl install acme/alpha@1.0 --yes'],
  ]) {
    const result = normalizeSkillRegistrySearchResults('tessl', { items: [{ name: 'alpha', [field]: value }] })
    assert.strictEqual(result.results[0]?.install_name, 'acme/alpha@1.0', `Expected qualified install name from ${field}`)
  }
  const tiles = normalizeSkillRegistrySearchResults('tessl', {
    skills: [
      { type: 'tile-skill', name: 'alpha', source: 'acme/alpha', summary: 'Projected skill' },
      { type: 'tile', name: 'alpha', full_name: 'acme/alpha', description: 'Canonical tile' },
      { type: 'git-skill', name: 'untrusted', source: 'https://example.com/repo' },
      { type: 'tile', name: '' },
    ],
    pagination: { total: 4 },
  })
  assert.strictEqual(tiles.results.length, 1, 'Only the canonical tile should remain')
  assert.strictEqual(tiles.results[0].description, 'Canonical tile')
  assert.strictEqual(tiles.total, 4, 'Provider total should be preserved')
  assert.strictEqual(normalizeSkillRegistrySearchResults('tessl', null).results.length, 0)
  assert.strictEqual(normalizeSkillRegistrySearchResults('tessl', [{ name: 'bare' }]).total, 1)
  assert.strictEqual(normalizeSkillRegistrySearchResults('clawhub', { data: [{ id: 'from-data' }] }).results[0].install_name, 'from-data')
  assert.strictEqual(normalizeSkillRegistrySearchResults('clawhub', { skills: [{ name: 'from-skills', tagline: 'Short description' }] }).results[0].description, 'Short description')
  assert.strictEqual(normalizeSkillRegistrySearchResults('clawhub', null).results.length, 0)
  assert.strictEqual(normalizeSkillRegistrySearchResults('shipables', [{ name: 'raw', url: 'https://example.com' }]).results[0].homepage, 'https://example.com')

  assert.strictEqual(selectBestRegistryInstallName('tessl', 'ACME/ALPHA@1.0', []), 'ACME/ALPHA@1.0')
  assert.strictEqual(selectBestRegistryInstallName('tessl', ' ALPHA ', [{ name: 'alpha', install_name: 'acme/alpha' }]), 'acme/alpha')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'alpha', [{ name: 'other', install_name: 'acme/alpha@latest' }]), 'acme/alpha@latest')
  assert.strictEqual(selectBestRegistryInstallName('tessl', 'missing', [{ name: 'alpha', install_name: 'acme/alpha' }]), 'missing')
  assert.strictEqual(selectBestRegistryInstallName('clawhub', 'alpha', []), 'alpha')
  assert.deepStrictEqual(parseRegistryJsonOutput('  '), {})
  assert.deepStrictEqual(parseRegistryJsonOutput('heading\n[1,2]'), [1, 2])
  assert.throws(() => parseRegistryJsonOutput('command failed'), /did not return JSON/)
  assert.throws(() => parseRegistryJsonOutput('prefix {malformed'), SyntaxError)
  assert.strictEqual(getTesslInstallBlockerMessage(''), null)
  assert.strictEqual(getTesslInstallBlockerMessage('Skipped alpha for another reason'), null)
  assert.strictEqual(buildSkillRegistrySearchCommands('clawhub', '', 20)[0].args[1], 'explore')
  assert.deepStrictEqual(buildSkillRegistrySearchCommands('tessl', '', 20).map(command => command.command), ['npx', 'tessl'])
  assert.strictEqual(buildSkillRegistryInstallCommands('tessl', 'acme/alpha').length, 2)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessl-skill-registry-test-'))
  try {
    const clawhubSkillDir = path.join(tmpDir, 'skills', 'github')
    fs.mkdirSync(clawhubSkillDir, { recursive: true })
    fs.writeFileSync(path.join(clawhubSkillDir, 'SKILL.md'), '# GitHub Skill\n', 'utf-8')
    const clawhubDiscovered = discoverInstalledRegistrySkillDirs('clawhub', tmpDir)
    assert.strictEqual(clawhubDiscovered.length, 1)
    assert(clawhubDiscovered[0].endsWith(path.join('skills', 'github')))

    const tesslSkillDir = path.join(tmpDir, '.codex', 'skills', 'review-skill')
    fs.mkdirSync(tesslSkillDir, { recursive: true })
    fs.writeFileSync(path.join(tesslSkillDir, 'SKILL.md'), '# Review Skill\n', 'utf-8')

    const tesslTileDir = path.join(tmpDir, '.tessl', 'tiles', 'odyssey4me', 'gmail')
    fs.mkdirSync(tesslTileDir, { recursive: true })
    fs.writeFileSync(path.join(tesslTileDir, 'SKILL.md'), '# Gmail Skill\n', 'utf-8')

    const discovered = discoverInstalledRegistrySkillDirs('tessl', tmpDir)
    assert(discovered.some((dir) => dir.endsWith(path.join('.codex', 'skills', 'review-skill'))))
    assert(discovered.some((dir) => dir.endsWith(path.join('.tessl', 'tiles', 'odyssey4me', 'gmail'))))

    const tileContainerDir = path.join(tmpDir, '.tessl', 'tiles', 'maceytest', 'testytesty')
    const nestedSkillDir = path.join(tileContainerDir, 'skills', 'testytesty')
    fs.mkdirSync(nestedSkillDir, { recursive: true })
    fs.writeFileSync(path.join(nestedSkillDir, 'SKILL.md'), '# Testy Skill\n', 'utf-8')
    fs.writeFileSync(path.join(tileContainerDir, 'tile.json'), JSON.stringify({
      name: 'maceytest/testytesty',
      skills: {
        testytesty: {
          path: 'skills/testytesty/SKILL.md',
        },
      },
    }), 'utf-8')

    const importable = resolveImportableRegistrySkillDirs('tessl', [tileContainerDir, tesslSkillDir])
    assert(importable.some((dir) => dir.endsWith(path.join('.tessl', 'tiles', 'maceytest', 'testytesty', 'skills', 'testytesty'))))
    assert(importable.some((dir) => dir.endsWith(path.join('.codex', 'skills', 'review-skill'))))

    const hiddenSkillDir = path.join(tmpDir, 'skills', '.hidden')
    fs.mkdirSync(hiddenSkillDir, { recursive: true })
    assert(!discoverInstalledRegistrySkillDirs('clawhub', tmpDir).includes(hiddenSkillDir), 'Hidden skills should not be discovered')
    assert.deepStrictEqual(resolveImportableRegistrySkillDirs('clawhub', [clawhubSkillDir, clawhubSkillDir]), [clawhubSkillDir])
    const malformedTile = path.join(tmpDir, '.tessl', 'tiles', 'acme', 'malformed')
    fs.mkdirSync(malformedTile, { recursive: true })
    fs.writeFileSync(path.join(malformedTile, 'tile.json'), '{invalid')
    assert.deepStrictEqual(resolveImportableRegistrySkillDirs('tessl', [malformedTile]), [], 'Malformed tile should not become importable')
    fs.writeFileSync(path.join(malformedTile, 'tile.json'), JSON.stringify({ skills: { missing: {}, wrongType: { path: 42 }, noSkillFile: { path: 'missing/SKILL.md' } } }))
    assert.deepStrictEqual(resolveImportableRegistrySkillDirs('tessl', [malformedTile]), [], 'Tile entries require actual skill files')
    const direct = path.join(tmpDir, 'skills', 'lowercase')
    fs.mkdirSync(direct, { recursive: true })
    fs.writeFileSync(path.join(direct, 'skill.md'), '# lower')
    assert.deepStrictEqual(resolveImportableRegistrySkillDirs('tessl', [direct, direct]), [direct], 'Direct lowercase skill manifests should deduplicate')
    const shipable = path.join(tmpDir, '.claude', 'skills', 'shipable')
    fs.mkdirSync(shipable, { recursive: true })
    assert.deepStrictEqual(discoverInstalledRegistrySkillDirs('shipables', tmpDir), [shipable], 'Shipables should prefer installed Claude skills')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  console.log('skill-registry.test.ts: tests passed')
}

run()
