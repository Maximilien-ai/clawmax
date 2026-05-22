import assert from 'assert'
import { buildWorkspaceStarterPrompts, normalizeStarterPromptList } from './builderStarterPrompts'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('recent user prompt is treated as highest-signal starter prompt input', () => {
  const prompts = buildWorkspaceStarterPrompts({
    workspaceName: 'Research Lab',
    recentPrompts: ['Team of agents to optimize my peptide usage'],
    agents: [],
    skills: [],
    workflows: [],
    templates: { agents: [], organizations: [] },
  })
  assert.equal(prompts[0], 'Team of agents to optimize my peptide usage')
})

test('recent prompt follow-up uses only real matching skills and agent names', () => {
  const prompts = buildWorkspaceStarterPrompts({
    workspaceName: 'Personal',
    recentPrompts: ['I already have an agent, but it needs GitHub and Slack access.'],
    agents: [{ id: 'fake-agent', name: 'fake-agent' }],
    skills: [{ name: 'github' }, { name: 'slack' }, { name: 'himalaya' }],
    workflows: [],
    templates: { agents: [], organizations: [] },
  })
  assert(prompts.some((prompt) => /github and slack/i.test(prompt)), 'Expected real skill names in follow-up prompt')
  assert(!prompts.some((prompt) => /Turn this into the best next build/i.test(prompt)), 'Expected duplicate rewrite prompt to be removed')
})

test('personal workspace name influences fallback suggestions', () => {
  const prompts = buildWorkspaceStarterPrompts({
    workspaceName: 'Personal',
    agents: [],
    skills: [],
    workflows: [],
    templates: { agents: [], organizations: [] },
  })
  assert(prompts.some((prompt) => /personal/i.test(prompt)), 'Expected personal-oriented prompt')
})

test('multiple agents and shared skills can produce team-formation suggestions', () => {
  const prompts = buildWorkspaceStarterPrompts({
    workspaceName: 'Personal',
    agents: [
      { id: 'astro-guide', name: 'Astro Guide', skills: ['github', 'slack'], tags: ['astronomy'], groups: [{ name: 'Observing' }] },
      { id: 'sky-notes', name: 'Sky Notes', skills: ['github'], tags: ['astronomy'], groups: [{ name: 'Observing' }] },
      { id: 'trip-helper', name: 'Trip Helper', skills: ['slack'], tags: ['travel'] },
    ],
    skills: [{ name: 'github' }, { name: 'slack' }, { name: 'himalaya' }],
    workflows: [],
    templates: { agents: [], organizations: [] },
  })
  assert(prompts.some((prompt) => /coordinated team|clearer operating team|dedicated team/i.test(prompt)), 'Expected team-formation prompt')
  assert(prompts.some((prompt) => /github and slack/i.test(prompt)), 'Expected multi-skill strategy prompt')
})

test('empty workspace can draw from templates and other workspace names', () => {
  const prompts = buildWorkspaceStarterPrompts({
    workspaceName: 'New Space',
    otherWorkspaceNames: ['Travel Ops'],
    agents: [],
    skills: [],
    workflows: [],
    templates: {
      agents: [{ name: 'Astro Guide' }],
      organizations: [{ name: 'Product Research Team' }],
    },
  })
  assert(prompts.some((prompt) => prompt.includes('Product Research Team')), 'Expected template-based prompt')
  assert(prompts.some((prompt) => prompt.includes('Travel Ops')), 'Expected other-workspace-based prompt')
})

test('normalizeStarterPromptList deduplicates and caps results', () => {
  const prompts = normalizeStarterPromptList([
    'One',
    'one',
    'Two',
    'Three',
    'Four',
    'Five',
  ])
  assert.deepEqual(prompts, ['One', 'Two', 'Three', 'Four'])
})

test('normalizeStarterPromptList removes near-duplicate prompt variants', () => {
  const prompts = normalizeStarterPromptList([
    'I already have an agent, but it needs GitHub and Slack access.',
    'Turn this into the best next build for Personal: I already have an agent, but it needs GitHub and Slack access.',
    'Design a small personal planning team for errands, follow-ups, and weekly reviews.',
    'Design a travel planning assistant that helps compare itineraries, costs, and next actions.',
  ])
  assert.equal(prompts.length, 3)
})

console.log('builderStarterPrompts.test.ts: ok')
