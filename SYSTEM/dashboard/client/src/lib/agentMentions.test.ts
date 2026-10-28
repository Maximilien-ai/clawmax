import assert from 'assert'
import { mentionedAgentIds, updateMentionSelection } from './agentMentions'
const agents = [{ id: 'starter-template', name: 'Starter Assistant' }, { id: 'qa', name: 'QA (Lead)' }, { id: 'old', archived: true }]
assert.deepEqual(mentionedAgentIds('Create for @starter-template', agents), ['starter-template'])
assert.deepEqual(mentionedAgentIds('Use @Starter Assistant and @QA (Lead)', agents), ['starter-template', 'qa'])
assert.deepEqual(mentionedAgentIds('Use @all', agents), ['starter-template', 'qa'])
for (const prompt of ['@starter-tem', '@starter-template-other', '@all-other', 'email@qa', '@old', '@ all']) assert.deepEqual(mentionedAgentIds(prompt, agents), [])
assert.deepEqual(updateMentionSelection('@all', '@qa', ['starter-template', 'qa'], agents), ['qa'])
assert.deepEqual(updateMentionSelection('', '@qa', ['starter-template'], agents), ['starter-template', 'qa'])
console.log('Agent mentions: slugs, names, all, escaping, boundaries, archived exclusion and selection reconciliation passed')
