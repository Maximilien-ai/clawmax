import assert from 'assert'
import fs from 'fs'
import path from 'path'

const wizardSource = fs.readFileSync(
  path.join(__dirname, 'components', 'AddAgentWizard.tsx'),
  'utf8',
)
const panelSource = fs.readFileSync(
  path.join(__dirname, 'components', 'ModelFitRecommendationPanel.tsx'),
  'utf8',
)
const agentsSource = fs.readFileSync(
  path.join(__dirname, 'pages', 'Agents.tsx'),
  'utf8',
)

assert(wizardSource.includes('availableModels,'), 'Agent generation must send the runtime-visible model list')
assert(wizardSource.includes('modelPreference,'), 'Agent generation must send the selected quality, balanced, or cost preference')
assert(wizardSource.includes('data.modelRecommendation'), 'Agent generation must retain the server recommendation')
assert(wizardSource.includes("set('model', resolveAddAgentWizardSuggestedModel"), 'Generated recommendations must still pass through availability validation')
assert(wizardSource.includes('setModelRecommendation(null)'), 'Starting over must clear stale recommendation evidence')
assert(wizardSource.includes('<ModelFitPreferenceControl'), 'Agent creation must expose recommendation priority before generation')
assert(wizardSource.includes('<ModelFitRecommendationPanel'), 'Agent creation must use the shared recommendation presentation')

assert(panelSource.includes('Automatic model suggestion'), 'Recommendation UI must identify automatic model suggestions')
assert(panelSource.includes('Suggested model:'), 'Recommendation UI must identify the suggested model')
assert(panelSource.includes('recommendation.confidence'), 'Recommendation UI must show confidence')
assert(panelSource.includes('recommendation.candidates[0].reasons'), 'Recommendation UI must explain the leading candidate')
assert(panelSource.includes('Other runtime-visible candidates'), 'Recommendation UI must expose alternatives')
assert(panelSource.includes('Review capability assumptions'), 'Recommendation UI must expose capability caveats')
assert(panelSource.includes('recommendation.disclaimer'), 'Recommendation UI must disclose advisory limitations')
assert(panelSource.includes('Use suggestion'), 'Recommendation UI must require an explicit selection')
assert(panelSource.includes('does not change the agent until you save'), 'Recommendation UI must distinguish selection from persistence')
assert(panelSource.includes('sm:grid-cols-'), 'Recommendation controls must stack safely on mobile')
assert(panelSource.includes('break-all'), 'Long provider and model IDs must wrap')

assert(agentsSource.includes('buildAgentModelFitDescription({ identity, soul, tools })'), 'Existing-agent suggestions must use current agent instructions')
assert(agentsSource.includes('requestModelFit({'), 'Existing-agent editor must request a recommendation')
assert(agentsSource.includes('window.setTimeout(async () =>'), 'Existing-agent recommendations must debounce edits')
assert(agentsSource.includes('onUseSuggestion={setModel}'), 'Existing-agent suggestions must only update the editable model selection')
assert(agentsSource.includes('onClick={handleSave}'), 'Existing-agent model changes must retain a separate save action')
assert(agentsSource.includes("width: 'min(48rem, calc(100vw - 2rem))'"), 'Existing-agent editor must stay within phone viewport margins')

console.log('AgentModelFitIntegration.test.ts: 24 tests passed')
