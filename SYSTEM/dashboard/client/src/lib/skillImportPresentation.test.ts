import assert from 'assert'
import {
  LOCAL_SKILL_IMPORT_GUIDANCE,
  LOCAL_SKILL_IMPORT_PATH_PLACEHOLDER,
  getSuccessfulImportedSkillIds,
  shouldShowLocalSkillRuntimeBrowseButton,
} from './skillImportPresentation'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('local skill import guidance recommends zip upload for local files', () => {
  assert.equal(
    LOCAL_SKILL_IMPORT_PATH_PLACEHOLDER,
    '/path/inside/the/dashboard/runtime/custom-skill',
  )
  assert(LOCAL_SKILL_IMPORT_GUIDANCE[0].includes('`Upload ZIP...` opens a file picker on your local machine'))
  assert(LOCAL_SKILL_IMPORT_GUIDANCE[1].includes('use `Upload ZIP...` to send a skill bundle from your laptop'))
})

test('local skill import guidance marks runtime paths as advanced only', () => {
  assert(LOCAL_SKILL_IMPORT_GUIDANCE[2].includes('advanced/manual imports'))
  assert(LOCAL_SKILL_IMPORT_GUIDANCE[3].includes('already exists inside the dashboard runtime'))
  assert(LOCAL_SKILL_IMPORT_GUIDANCE[3].includes('WORKSPACES/&lt;workspace&gt;/SKILLS/custom'))
})

test('local skill import no longer shows a runtime browse button', () => {
  assert.equal(shouldShowLocalSkillRuntimeBrowseButton(), false)
})

test('github import ids support one-item multi-skill responses without undefined values', () => {
  assert.deepStrictEqual(
    getSuccessfulImportedSkillIds({
      skills: [{ ok: true, skillId: ' qbo ' }],
    }),
    ['qbo'],
  )
  assert.deepStrictEqual(getSuccessfulImportedSkillIds({ skillId: 'github' }), ['github'])
  assert.deepStrictEqual(getSuccessfulImportedSkillIds({ skills: [{ ok: true }] }), [])
})

console.log('skillImportPresentation.test.ts: 4 tests passed')
