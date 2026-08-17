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
assert(panelSource.includes('primaryCandidate?.reasons?.length'), 'Recommendation UI must safely detect explanations for the leading candidate')
assert(panelSource.includes('primaryCandidate.reasons.map'), 'Recommendation UI must explain the leading candidate')
assert(panelSource.includes('Other runtime-visible candidates'), 'Recommendation UI must expose alternatives')
assert(panelSource.includes('Review capability assumptions'), 'Recommendation UI must expose capability caveats')
assert(panelSource.includes('Excluded incompatible models'), 'Recommendation UI must explain models excluded from automatic selection')
assert(panelSource.includes('recommendation.disclaimer'), 'Recommendation UI must disclose advisory limitations')
assert(panelSource.includes('Use suggestion'), 'Recommendation UI must require an explicit selection')
assert(panelSource.includes('does not change the agent until you save'), 'Recommendation UI must distinguish selection from persistence')
assert(panelSource.includes('aria-expanded={detailsExpanded}'), 'Suggested model details must use an accessible disclosure control')
assert(panelSource.includes('MODEL_FIT_DETAILS_STORAGE_KEY'), 'Suggestion disclosure state must persist across views')
assert(panelSource.includes('Auto-select top suggestion'), 'Recommendation UI must expose opt-in automatic selection')
assert(panelSource.includes('onAutoApplyChange'), 'Automatic selection must remain parent-controlled')
assert(panelSource.includes('sm:grid-cols-'), 'Recommendation controls must stack safely on mobile')
assert(panelSource.includes('break-all'), 'Long provider and model IDs must wrap')

assert(agentsSource.includes('buildAgentModelFitDescription({ identity, soul, tools })'), 'Existing-agent suggestions must use current agent instructions')
assert(agentsSource.includes('requestModelFit({'), 'Existing-agent editor must request a recommendation')
assert(agentsSource.includes('window.setTimeout(async () =>'), 'Existing-agent recommendations must debounce edits')
assert(agentsSource.includes('onUseSuggestion={useManualModel}'), 'Existing-agent suggestions must update the tracked editable model selection')
assert(agentsSource.includes('manualModelRef.current || modelRecommendation?.recommendedModel || model'), 'Disabling Auto must restore the last manual model')
assert(agentsSource.includes('disabled={autoModelSelection}'), 'Manual model selection must lock only while Auto is active')
assert(agentsSource.includes('normalizeAgentModelFitState(identityData?.modelFit)'), 'Agent-specific mode and priority must load from persisted identity metadata')
assert(agentsSource.includes('syncAgentModelFitIdentity('), 'Agent-specific mode and priority must be persisted with the agent')
assert(agentsSource.includes("modelSelection: autoModelSelection ? 'auto' : 'manual'"), 'Model save requests must include the agent-specific selection mode')
assert(agentsSource.includes('modelPreference,'), 'Model save requests must include the agent-specific priority')
assert(wizardSource.includes("modelSelection: autoModelSelection ? 'auto' : 'manual'"), 'New agents must persist their automatic selection mode')
assert(agentsSource.includes('onClick={handleSave}'), 'Existing-agent model changes must retain a separate save action')
assert(agentsSource.includes('max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-3xl'), 'Existing-agent editor must stay within phone viewport margins')
assert(agentsSource.includes('bg-black bg-opacity-30 p-4'), 'Existing-agent editor overlay must reserve phone viewport margins')

console.log('AgentModelFitIntegration.test.ts: 39 tests passed')
