import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ModelFitRecommendationPanel from './ModelFitRecommendationPanel'

const props = { recommendation: null, preference: 'balanced' as const, onPreferenceChange() {} }
const collapsed = renderToStaticMarkup(<ModelFitRecommendationPanel {...props} collapsible />)
assert.match(collapsed, /^<details\b[^>]*>/)
assert(!/^<details\b[^>]*\bopen(?:[\s=>])/.test(collapsed), 'Editing starts with the entire recommendation collapsed')
assert.match(collapsed, /<summary[^>]*>Automatic model suggestion/)
assert.equal((collapsed.match(/Automatic model suggestion/g) || []).length, 1, 'The expanded panel does not repeat its heading')
assert(collapsed.includes('Model recommendation priority'), 'The user can expand to the existing controls')
const creation = renderToStaticMarkup(<ModelFitRecommendationPanel {...props} />)
assert.match(creation, /^<section\b/, 'Creation keeps its existing presentation')
const failure = renderToStaticMarkup(<ModelFitRecommendationPanel {...props} collapsible autoApply error="Model list unavailable" />)
const summary = failure.slice(failure.indexOf('<summary'), failure.indexOf('</summary>'))
assert(summary.includes('Auto-select on'), 'An existing automatic-selection setting is visible while collapsed')
assert(summary.includes('Model list unavailable') && summary.includes('role="alert"'), 'Errors are visible without expanding')
console.log('ModelFitDisclosure.test.tsx: passed')
