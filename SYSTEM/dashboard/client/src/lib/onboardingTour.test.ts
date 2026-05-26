import assert from 'assert'
import {
  getWorkspaceTourStorageKey,
  shouldShowWorkspaceTour,
} from './onboardingTour'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('shows workspace tour for first empty workspace visit', () => {
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'personal',
    workspaceAgentCount: 0,
    onboardingVisible: true,
    storedState: null,
  }), true)
})

test('does not show workspace tour after dismissal or completion', () => {
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'personal',
    workspaceAgentCount: 0,
    onboardingVisible: true,
    storedState: 'dismissed',
  }), false)
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'personal',
    workspaceAgentCount: 0,
    onboardingVisible: true,
    storedState: 'completed',
  }), false)
})

test('does not show workspace tour for populated workspaces or when onboarding is inactive', () => {
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'personal',
    workspaceAgentCount: 2,
    onboardingVisible: true,
    storedState: null,
  }), false)
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'personal',
    workspaceAgentCount: 0,
    onboardingVisible: false,
    storedState: null,
  }), false)
})

test('workspace tour storage key is versioned per workspace', () => {
  assert.equal(getWorkspaceTourStorageKey('personal'), 'clawmax-workspace-tour:personal:v1')
})

console.log('onboardingTour.test.ts: ok')
