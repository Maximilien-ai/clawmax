import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { shouldCloseFirstRunOverlay } from './lib/onboardingTour'

assert.strictEqual(
  shouldCloseFirstRunOverlay({ onboardingVisible: true, workspaceTourVisible: true }),
  true,
  'The First Run dialog must close while the workspace tour is active',
)
assert.strictEqual(
  shouldCloseFirstRunOverlay({ onboardingVisible: false, workspaceTourVisible: false }),
  true,
  'The First Run dialog must close when onboarding is no longer available',
)
assert.strictEqual(
  shouldCloseFirstRunOverlay({ onboardingVisible: true, workspaceTourVisible: false }),
  false,
  'First Run may remain open when onboarding is available and the tour is inactive',
)

const componentDir = path.join(__dirname, 'components')
const wizardSource = fs.readFileSync(path.join(componentDir, 'OnboardingWizard.tsx'), 'utf8')
const tourSource = fs.readFileSync(path.join(componentDir, 'WorkspaceFirstRunTour.tsx'), 'utf8')

assert(
  wizardSource.includes('workspaceTourVisible: suppressAutoOpen'),
  'OnboardingWizard must close its open dialog when tour suppression activates',
)
assert(
  tourSource.includes('className="pointer-events-none fixed inset-0 z-[85]"'),
  'The tour shell must allow pointer input to reach highlighted dashboard controls',
)
assert(
  tourSource.includes('className={`pointer-events-auto absolute z-10'),
  'The tour card must remain interactive while the shell is click-through',
)

console.log('WorkspaceTourInteraction.test.ts: 6 assertions passed')
