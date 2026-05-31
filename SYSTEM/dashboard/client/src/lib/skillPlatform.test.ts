import assert from 'assert'
import { getRegistrySkillCompatibility, normalizeRuntimePlatform } from './skillPlatform'

function run() {
  assert.strictEqual(normalizeRuntimePlatform('darwin'), 'darwin')
  assert.strictEqual(normalizeRuntimePlatform('linux'), 'linux')
  assert.strictEqual(normalizeRuntimePlatform('weird-os'), 'unknown')

  assert.strictEqual(
    getRegistrySkillCompatibility({ name: 'apple-reminders' }, 'linux').compatible,
    false
  )

  assert.strictEqual(
    getRegistrySkillCompatibility({ install_name: 'things-mac', description: 'Task manager for macOS' }, 'linux').compatible,
    false
  )

  assert.strictEqual(
    getRegistrySkillCompatibility({ name: 'github', description: 'GitHub automation' }, 'linux').compatible,
    true
  )

  assert.strictEqual(
    getRegistrySkillCompatibility({ name: 'apple-reminders' }, 'darwin').compatible,
    true
  )

  console.log('skillPlatform.test.ts: 6 tests passed')
}

run()
