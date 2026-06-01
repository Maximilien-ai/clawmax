import assert from 'assert'
import { normalizePromptInput, resolveAddAgentWizardLaunchState } from './addAgentWizardFlow'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('AI add-agent launch starts on the AI step with the Builder prompt prefilled', () => {
  const launch = resolveAddAgentWizardLaunchState({
    startWithAI: true,
    initialAiDescription: '  Create one agent to triage support emails and draft replies for me  ',
  })

  assert.equal(launch.initialStep, 2)
  assert.equal(launch.aiPrompt, 'Create one agent to triage support emails and draft replies for me')
  assert.equal(launch.enableAi, true)
})

test('non-AI add-agent launch does not prefill AI state', () => {
  const launch = resolveAddAgentWizardLaunchState({
    startWithAI: false,
    initialAiDescription: 'ignored',
  })

  assert.equal(launch.initialStep, 1)
  assert.equal(launch.aiPrompt, '')
  assert.equal(launch.enableAi, false)
})

test('normalizePromptInput falls back cleanly for non-string overrides', () => {
  assert.equal(normalizePromptInput(undefined, '  fallback prompt  '), 'fallback prompt')
})

console.log('addAgentWizardFlow.test.ts: ok')
