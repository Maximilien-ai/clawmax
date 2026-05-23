import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { buildAiBuilderRecommendation } from './ai-builder'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'ai-builder-evals.json'), 'utf8'),
) as Array<{
  name: string
  prompt: string
  intent: ReturnType<typeof buildAiBuilderRecommendation>['intent']
  scope: ReturnType<typeof buildAiBuilderRecommendation>['scope']
  operation?: ReturnType<typeof buildAiBuilderRecommendation>['operation']
  confidence?: ReturnType<typeof buildAiBuilderRecommendation>['confidence']
  page?: ReturnType<typeof buildAiBuilderRecommendation>['recommendedPath']['primaryAction']['page']
  action?: ReturnType<typeof buildAiBuilderRecommendation>['recommendedPath']['primaryAction']['action']
  confirmationOptionsMin?: number
  titleIncludes?: string
}>

for (const scenario of cases) {
  test(`ai builder routing: ${scenario.name}`, () => {
    const result = buildAiBuilderRecommendation(scenario.prompt)
    assert.equal(result.intent, scenario.intent)
    assert.equal(result.scope, scenario.scope)
    if (scenario.operation) assert.equal(result.operation, scenario.operation)
    if (scenario.confidence) assert.equal(result.confidence, scenario.confidence)
    if (scenario.page) assert.equal(result.recommendedPath.primaryAction.page, scenario.page)
    if (scenario.action) assert.equal(result.recommendedPath.primaryAction.action, scenario.action)
    if (scenario.titleIncludes) assert(result.recommendedPath.title.includes(scenario.titleIncludes), `Expected title to include ${scenario.titleIncludes}`)
    if (scenario.confirmationOptionsMin) {
      assert(result.confirmationOptions.length >= scenario.confirmationOptionsMin, `Expected at least ${scenario.confirmationOptionsMin} confirmation options`)
    }
  })
}

test('low-confidence recommendation summary explicitly says confirmation is needed', () => {
  const result = buildAiBuilderRecommendation('Maybe use my current agent or a template for product research, whichever fits best')
  assert.equal(result.confidence, 'low')
  assert(result.summary.toLowerCase().includes('not fully confident'), 'Expected low-confidence summary language')
})

test('high-confidence recommendation does not add confirmation options', () => {
  const result = buildAiBuilderRecommendation('Use the Astro Guide agent template if it is a better fit than my current agents')
  assert.equal(result.confidence, 'high')
  assert.equal(result.confirmationOptions.length, 0)
})
