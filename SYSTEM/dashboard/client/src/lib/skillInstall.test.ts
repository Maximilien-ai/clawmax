import assert from 'assert'
import { getDashboardInstallRequirementCommands } from './skillInstall'

let testsPassed = 0

function test(name: string, fn: () => void) {
  fn()
  console.log(`✓ ${name}`)
  testsPassed++
}

test('linux skills prefer apt commands over brew alternatives', () => {
  const commands = getDashboardInstallRequirementCommands({
    install: [
      { id: 'brew', kind: 'brew', formula: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (brew)' },
      { id: 'apt', kind: 'apt', package: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (apt)' },
    ],
  } as any, 'linux')

  assert.deepStrictEqual(commands, ['apt-get install -y himalaya'])
})

test('macOS skills prefer brew commands', () => {
  const commands = getDashboardInstallRequirementCommands({
    install: [
      { id: 'brew', kind: 'brew', formula: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (brew)' },
      { id: 'apt', kind: 'apt', package: 'himalaya', bins: ['himalaya'], label: 'Install Himalaya (apt)' },
    ],
  } as any, 'darwin')

  assert.deepStrictEqual(commands, ['brew install himalaya'])
})

test('distinct linux requirements preserve multiple apt commands', () => {
  const commands = getDashboardInstallRequirementCommands({
    install: [
      { id: 'jq', kind: 'apt', package: 'jq', bins: ['jq'], label: 'Install jq (apt)' },
      { id: 'gh', kind: 'apt', package: 'gh', bins: ['gh'], label: 'Install GitHub CLI (apt)' },
      { id: 'gh-brew', kind: 'brew', formula: 'gh', bins: ['gh'], label: 'Install GitHub CLI (brew)' },
    ],
  } as any, 'linux')

  assert.deepStrictEqual(commands, ['apt-get install -y jq', 'apt-get install -y gh'])
})

console.log(`\n${testsPassed} tests passed`)
