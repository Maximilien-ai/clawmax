import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(
  path.join(__dirname, 'components', 'AddAgentWizard.tsx'),
  'utf8',
)

assert(source.includes('availableModels,'), 'Agent generation must send the runtime-visible model list')
assert(source.includes('data.modelRecommendation'), 'Agent generation must retain the server recommendation')
assert(source.includes('Suggested model:'), 'Agent generation must identify the suggested model')
assert(source.includes('modelRecommendation.confidence'), 'Recommendation UI must show confidence')
assert(source.includes('modelRecommendation.candidates[0].reasons'), 'Recommendation UI must explain the leading candidate')
assert(source.includes('Other runtime-visible candidates:'), 'Recommendation UI must expose alternative runtime-visible models')
assert(source.includes('Review capability assumptions'), 'Recommendation UI must expose capability caveats')
assert(source.includes('modelRecommendation.disclaimer'), 'Recommendation UI must disclose advisory limitations')
assert(source.includes("set('model', resolveAddAgentWizardSuggestedModel"), 'Recommendation must still pass through availability validation')
assert(source.includes('setModelRecommendation(null)'), 'Starting over must clear stale recommendation evidence')

console.log('AgentModelFitIntegration.test.ts: 10 tests passed')
