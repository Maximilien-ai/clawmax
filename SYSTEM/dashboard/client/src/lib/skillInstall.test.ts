import assert from 'assert'
import { formatDashboardInstallRequirementCommand, getDashboardInstallRequirementCommands, getPendingSkillRequirementInstall } from './skillInstall'

let testsPassed = 0

function test(name: string, fn: () => void) {
  fn()
  console.log(`✓ ${name}`)
  testsPassed++
}

test('linux skills prefer apt commands over brew alternatives', () => {
  const commands = getDashboardInstallRequirementCommands({
    name: 'himalaya',
    install: [
      { id: 'brew', kind: 'brew', formula: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (brew)' },
      { id: 'apt', kind: 'apt', package: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (apt)' },
    ],
  } as any, 'linux')

  assert.deepStrictEqual(commands, ['curl -sSL https://raw.githubusercontent.com/pimalaya/himalaya/master/install.sh | PREFIX=/usr/local sh'])
})

test('macOS skills prefer brew commands', () => {
  const commands = getDashboardInstallRequirementCommands({
    name: 'himalaya',
    install: [
      { id: 'brew', kind: 'brew', formula: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (brew)' },
      { id: 'apt', kind: 'apt', package: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (apt)' },
    ],
  } as any, 'darwin')

  assert.deepStrictEqual(commands, ['brew install himalaya'])
})

test('distinct linux requirements preserve multiple apt commands', () => {
  const commands = getDashboardInstallRequirementCommands({
    name: 'github',
    install: [
      { id: 'jq', kind: 'apt', package: 'jq', bins: ['jq'], label: 'Install jq (apt)' },
      { id: 'gh', kind: 'apt', package: 'gh', bins: ['gh'], label: 'Install GitHub CLI (apt)' },
      { id: 'gh-brew', kind: 'brew', formula: 'gh', bins: ['gh'], label: 'Install GitHub CLI (brew)' },
    ],
  } as any, 'linux')

  assert.deepStrictEqual(commands, ['apt-get install -y jq', 'apt-get install -y gh'])
})

test('linux uv installer preview falls back to python pip for dashboard runtimes', () => {
  const command = formatDashboardInstallRequirementCommand(
    { name: 'nano-pdf' } as any,
    { id: 'uv', kind: 'uv', package: 'nano-pdf', bins: ['nano-pdf'], label: 'Install nano-pdf (uv)' } as any,
    'linux'
  )

  assert.strictEqual(command, 'python3 -m pip install --user nano-pdf')
})

test('node installer preview uses npm global install command', () => {
  const command = formatDashboardInstallRequirementCommand(
    { name: 'react-email' } as any,
    { id: 'node', kind: 'node', package: 'react-email', label: 'Install react-email (node)' } as any,
    'linux'
  )

  assert.strictEqual(command, 'npm install -g react-email')
})

test('post-import flow selects the first missing install requirement', () => {
  const selected = getPendingSkillRequirementInstall([
    {
      name: 'installed',
      install: [{ id: 'brew', kind: 'brew', formula: 'installed', label: 'Installed' }],
      requirementStatus: { checkable: true, installSatisfied: true, presentBins: ['installed'], missingBins: [] },
    },
    {
      name: 'qbo',
      install: [{ id: 'brew', kind: 'brew', formula: 'voska/tap/qbo', label: 'Install qbo' }],
      requirementStatus: { checkable: true, installSatisfied: false, presentBins: [], missingBins: ['qbo'] },
    },
  ] as any, 'darwin')

  assert.strictEqual(selected?.name, 'qbo')
})

test('post-import flow skips skills without a safe dashboard command', () => {
  const selected = getPendingSkillRequirementInstall([{
    name: 'manual',
    install: [{ id: 'download', kind: 'download', label: 'Read manual instructions' }],
  }] as any, 'darwin')

  assert.strictEqual(selected, null)
})

console.log(`\n${testsPassed} tests passed`)
