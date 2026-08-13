import assert from 'node:assert'
import { getPluginAiCreateCopy } from './pluginAiCreateCopy'

const optimize = getPluginAiCreateCopy({ objectKind: 'optimization-plan' })
assert.strictEqual(optimize.title, 'AI Create Optimization Plan')
assert.match(optimize.placeholder, /monthly cost/) 
assert.match(optimize.intro, /agent or workflow/) 

const lifecycle = getPluginAiCreateCopy({ objectKind: 'lifecycle-view' })
assert.strictEqual(lifecycle.title, 'AI Create Lifecycle')
assert.match(lifecycle.placeholder, /model changes/) 
assert.match(lifecycle.intro, /time window/) 

const generic = getPluginAiCreateCopy({ name: 'Guardrail', singular: 'Guardrail' })
assert.strictEqual(generic.title, 'AI Create Guardrail')
console.log('plugin AI create copy tests passed')
