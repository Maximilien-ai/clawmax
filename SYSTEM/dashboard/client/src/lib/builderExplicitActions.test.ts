import assert from 'assert'
import { hasExplicitBuilderEntityAction } from './builderExplicitActions'

assert.equal(hasExplicitBuilderEntityAction('Create an agent for customer support', 'agent'), true)
assert.equal(hasExplicitBuilderEntityAction('Update an agent for customer support', 'agent'), true)
assert.equal(hasExplicitBuilderEntityAction('Create a workflow for weekly reporting', 'workflow'), true)
assert.equal(hasExplicitBuilderEntityAction('Update a workflow for weekly reporting', 'workflow'), true)
assert.equal(hasExplicitBuilderEntityAction('Create a skill for GitHub triage', 'skill'), true)
assert.equal(hasExplicitBuilderEntityAction('Update a skill for GitHub triage', 'skill'), true)
assert.equal(hasExplicitBuilderEntityAction('Review the closest existing agent', 'agent'), false)

console.log('builderExplicitActions.test.ts: 7 tests passed')
