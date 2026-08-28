import assert from 'assert'
import { hasExplicitBuilderEntityAction, requiredBuilderCreateTargets, selectBuilderSecondaryActions } from './builderExplicitActions'

assert.equal(hasExplicitBuilderEntityAction('Create an agent for customer support', 'agent'), true)
assert.equal(hasExplicitBuilderEntityAction('Update an agent for customer support', 'agent'), true)
assert.equal(hasExplicitBuilderEntityAction('Create a workflow for weekly reporting', 'workflow'), true)
assert.equal(hasExplicitBuilderEntityAction('Update a workflow for weekly reporting', 'workflow'), true)
assert.equal(hasExplicitBuilderEntityAction('Create a skill for GitHub triage', 'skill'), true)
assert.equal(hasExplicitBuilderEntityAction('Update a skill for GitHub triage', 'skill'), true)
assert.equal(hasExplicitBuilderEntityAction('Review the closest existing agent', 'agent'), false)

assert.deepEqual(requiredBuilderCreateTargets('I need an agent for customer briefs'), ['agent'])
assert.deepEqual(requiredBuilderCreateTargets('Use my existing research agent'), ['agent'])
assert.deepEqual(requiredBuilderCreateTargets('Create a team of agents'), ['team'])
assert.deepEqual(requiredBuilderCreateTargets('Create a company of agents'), ['company'])
assert.deepEqual(requiredBuilderCreateTargets('I need a workflow and a skill'), ['workflow', 'skill'])
assert.deepEqual(requiredBuilderCreateTargets('Create a team of agents with a workflow and skill'), ['team', 'workflow', 'skill'])

assert.deepEqual(
  selectBuilderSecondaryActions([
    { label: 'Open Templates' },
    { label: 'Review Workflows' },
    { label: 'AI Create Team Template' },
    { label: 'AI Create Workflow' },
    { label: 'AI Create Skill' },
  ]).map((action) => action.label),
  ['AI Create Team Template', 'AI Create Workflow', 'AI Create Skill'],
)

console.log('builderExplicitActions.test.ts: 14 tests passed')
