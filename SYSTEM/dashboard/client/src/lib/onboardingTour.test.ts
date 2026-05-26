import assert from 'assert'
import {
  GLOBAL_WORKSPACE_TOUR_DISABLE_KEY,
  getWorkspaceTourStorageKey,
  readGlobalWorkspaceTourDisabled,
  shouldShowWorkspaceTour,
  writeWorkspaceTourState,
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

test('global dismissal suppresses the tour in other empty workspaces', () => {
  const store = new Map<string, string>()
  ;(globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    },
  }

  writeWorkspaceTourState('personal', 'dismissed')
  assert.equal(readGlobalWorkspaceTourDisabled(), true)
  assert.equal(store.get(GLOBAL_WORKSPACE_TOUR_DISABLE_KEY), 'dismissed')
  assert.equal(shouldShowWorkspaceTour({
    workspaceKey: 'new-workspace',
    workspaceAgentCount: 0,
    onboardingVisible: true,
    storedState: null,
    globallyDisabled: true,
  }), false)

  delete (globalThis as any).window
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
