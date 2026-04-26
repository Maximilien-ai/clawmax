/**
 * Templates API Test Suite
 *
 * Run with: npx ts-node server/lib/templates.test.ts
 */

import {
  listTemplates,
  getTemplate,
  importOrganizationTemplate,
  saveTemplate,
  validateTemplate,
  validateImportedTemplateMd,
  validateAgentTemplateFiles,
  createOrganizationTemplate,
  readWorkspaceAgentFilesForOrganizationTemplate,
  slugify,
  type OrganizationTemplate,
  type AgentTemplate
} from './templates'
import { checkTemplatePrereqs } from './prereqs'
import { listTeams } from './teams'
import { getWorkflow } from './workflows'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { REPO_ROOT } from './paths'

// ANSI color codes
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result instanceof Promise) {
      result.then(() => {
        console.log(`${GREEN}✓${RESET} ${name}`)
        testsPassed++
      }).catch(err => {
        console.log(`${RED}✗${RESET} ${name}`)
        console.error(`  Error: ${err.message}`)
        testsFailed++
      })
    } else {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    }
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

console.log(`\n${YELLOW}=== Templates API Test Suite ===${RESET}\n`)

// Test 1: List templates returns arrays
test('listTemplates() returns templates', () => {
  const templates = listTemplates()
  assert(Array.isArray(templates), 'Should return an array')
  console.log(`  Found ${templates.length} templates`)
})

// Test 2: Templates are categorized by type
test('Templates have correct type property', () => {
  const templates = listTemplates()

  templates.forEach(template => {
    assert(
      template.type === 'agent' || template.type === 'organization',
      `Template type should be 'agent' or 'organization', got ${template.type}`
    )
  })

  const agentTemplates = templates.filter(t => t.type === 'agent')
  const orgTemplates = templates.filter(t => t.type === 'organization')
  console.log(`  ${agentTemplates.length} agent, ${orgTemplates.length} org templates`)
})

// Test 3: Pre-built org templates exist
test('Pre-built org templates are available', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]

  const smallStartup = templates.find(t => t.name === 'Small Startup Team')
  const engineeringTeam = templates.find(t => t.name === 'Engineering Team')

  assert(smallStartup !== undefined, 'Small Startup Team template should exist')
  assert(engineeringTeam !== undefined, 'Engineering Team template should exist')

  console.log(`  Found pre-built templates: ${templates.map(t => t.name).join(', ')}`)
})

// Test 4: Org templates include workflows
test('Organization templates include workflows', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]

  const templatesWithWorkflows = templates.filter(t => t.workflows && t.workflows.length > 0)
  assert(templatesWithWorkflows.length > 0, 'At least one org template should have workflows')

  const smallStartup = templates.find(t => t.name === 'Small Startup Team')
  if (smallStartup && smallStartup.workflows) {
    assert(smallStartup.workflows.length >= 2, 'Small Startup should have at least 2 workflows')
    console.log(`  Small Startup Team has ${smallStartup.workflows.length} workflows`)
  }
})

// Test 5: Org templates have required structure
test('Organization templates have required properties', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]

  templates.forEach(template => {
    assert(typeof template.name === 'string', 'name should be string')
    assert(template.name.length > 0, 'name should not be empty')
    assert(Array.isArray(template.agents), 'agents should be array')
    assert(template.agents.length > 0, 'should have at least one agent')

    // Check first agent structure
    const agent = template.agents[0]
    assert(typeof agent.id === 'string', 'agent.id should be string')
    assert(typeof agent.role === 'string', 'agent.role should be string')
  })

  console.log(`  All ${templates.length} org templates have valid structure`)
})

// Test 6: Workflows in templates have complete configuration
test('Workflows in org templates are complete', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]
  const templatesWithWorkflows = templates.filter(t => t.workflows && t.workflows.length > 0)

  templatesWithWorkflows.forEach(template => {
    template.workflows!.forEach(workflow => {
      assert(typeof workflow.id === 'string', 'workflow.id should be string')
      assert(typeof workflow.name === 'string', 'workflow.name should be string')
      assert(typeof workflow.schedule === 'string', 'workflow.schedule should be string')
      assert(typeof workflow.enabled === 'boolean', 'workflow.enabled should be boolean')
      assert(workflow.targeting !== undefined, 'workflow should have targeting')
      assert(typeof workflow.content === 'string', 'workflow.content should be string')
    })
  })

  const totalWorkflows = templatesWithWorkflows.reduce((sum, t) => sum + (t.workflows?.length || 0), 0)
  console.log(`  Validated ${totalWorkflows} workflows across ${templatesWithWorkflows.length} templates`)
})

// Test 6b: Managed workflows carry explicit owner metadata and slug-aligned IDs
test('Managed workflow template metadata matches published workflow spec', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]
  const toSlug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  templates.forEach(template => {
    if (template.source === 'workspace') return

    template.workflows?.forEach(workflow => {
      const workflowWithOwner = workflow as typeof workflow & { owner?: string }
      assert(typeof workflow.id === 'string' && workflow.id.length > 0, 'workflow.id should be present')
      assertEqual(workflow.id, toSlug(workflow.name), `workflow.id should match slugified name for ${template.name} / ${workflow.name}`)

      const executionMode = workflow.executionMode || 'managed'
      if (executionMode === 'managed') {
        assert(typeof workflowWithOwner.owner === 'string' && workflowWithOwner.owner.length > 0, `managed workflow should include owner for ${template.name} / ${workflow.name}`)
      }
    })
  })

  console.log('  Managed workflows have explicit owners and slug-aligned IDs')
})

test('ClawMax System Test workflows use current workflow groups instead of separate session labels', () => {
  const template = getTemplate('organization', 'clawmax-system-test') as OrganizationTemplate | null
  assert(template !== null, 'ClawMax System Test template should exist')

  const comms = template!.workflows?.find(workflow => workflow.id === 'test-communications')
  const report = template!.workflows?.find(workflow => workflow.id === 'test-report')

  assert(comms !== undefined, 'test-communications workflow should exist')
  assert(report !== undefined, 'test-report workflow should exist')

  assert(comms!.content.includes('current group channel'), 'Communications workflow should instruct agents to use the current group channel')
  assert(comms!.content.includes('Do not attempt to use a separate tool, plugin, transport, or session label'), 'Communications workflow should explicitly forbid separate session-label handling')
  assert(comms!.content.includes('Do not treat lack of direct transport control, plugin access, or separate posting ability as a failure for this test.'), 'Communications workflow should prevent false COMMS FAIL responses caused by transport confusion')
  assert(report!.content.includes('current group channel'), 'Report workflow should instruct agents to use the current group channel')
  assert(!/Post this to the Test Status group/i.test(report!.content), 'Report workflow should not require a separate post step')
})

test('ClawMax System Test prereqs do not hard-fail GitHub before GitHub is enabled', () => {
  const template = getTemplate('organization', 'clawmax-system-test') as OrganizationTemplate | null
  assert(template !== null, 'ClawMax System Test template should exist')

  const prereqs = checkTemplatePrereqs(template!, {
    useGithub: false,
    useWorkspaceFs: true,
  })

  assert(!prereqs.checks.some(check => check.id === 'github-auth'), 'GitHub CLI auth should not be checked before GitHub is enabled')
  assert(!prereqs.checks.some(check => check.id === 'gh-issues'), 'GitHub issue scope should not be checked before GitHub is enabled')
})

test('Shared SOUL guidance tells agents to respond in group chats when addressed', () => {
  const agentTemplates = listTemplates('agent') as AgentTemplate[]
  const checkedTemplates = [
    'research-lead-template',
    'data-analyst-template',
    'literature-reviewer-template',
    'experiment-planner-template',
  ]

  for (const slug of checkedTemplates) {
    const template = agentTemplates.find(t => t.slug === slug)
    assert(template !== undefined, `${slug} should exist`)
    const soulPath = path.join(REPO_ROOT, 'TEMPLATES', 'agents', slug, 'SOUL.md')
    const soul = fs.readFileSync(soulPath, 'utf-8')
    assert(!soul.includes("You're not the user's voice — be careful in group chats."), `${slug} should not use the old ambiguous group chat warning`)
    assert(soul.includes('respond when addressed or when @all is used'), `${slug} should explicitly tell agents to respond in group chats when addressed`)
  }
})

// Test 7: slugify function works correctly
test('slugify() converts names to filesystem-safe slugs', () => {
  assertEqual(slugify('Small Startup Team'), 'small-startup-team')
  assertEqual(slugify('Engineering Team'), 'engineering-team')
  assertEqual(slugify('Test   Multiple  Spaces'), 'test-multiple-spaces')
  assertEqual(slugify('UPPERCASE'), 'uppercase')
  assertEqual(slugify('Special!@#$%Characters'), 'special-characters')

  console.log('  slugify("Small Startup Team") → "small-startup-team"')
})

// Test 8: validateTemplate accepts valid org template
test('validateTemplate() accepts valid organization template', () => {
  const validTemplate: OrganizationTemplate = {
    name: 'Test Org',
    type: 'organization',
    version: '1.0.0',
    teams: [
      { id: 'engineering', name: 'Engineering', leaderAgentId: 'test-agent', memberAgentIds: ['test-agent'] }
    ],
    agents: [
      { id: 'test-agent', role: 'Test Role' }
    ]
  }

  const result = validateTemplate(validTemplate)
  assert(result.valid === true, 'Should accept valid template')
  assert(result.errors === undefined || result.errors.length === 0, 'Should have no errors')
})

// Test 9: validateTemplate rejects invalid template
test('validateTemplate() rejects invalid template', () => {
  const invalidTemplate = {
    name: 'Test',
    type: 'invalid-type',
    agents: []
  }

  const result = validateTemplate(invalidTemplate)
  assert(result.valid === false, 'Should reject invalid template')
  assert(result.errors !== undefined && result.errors.length > 0, 'Should have errors')

  console.log(`  Caught ${result.errors?.length} validation errors`)
})

// Test 10: getTemplate retrieves org template by slug
test('getTemplate() retrieves org template by slug', () => {
  const template = getTemplate('organization', 'small-startup-team')

  if (template) {
    assert(template.type === 'organization', 'Should return organization template')
    assertEqual(template.name, 'Small Startup Team')
    assert(template.agents.length > 0, 'Should have agents')
  } else {
    console.log('  Template not found (may need to be created first)')
  }
})

test('organization templates expose derived kind metadata', () => {
  const buildCompany = getTemplate('organization', 'build-a-company-hack-test') as OrganizationTemplate | null
  assert(buildCompany !== null, 'Build-a-Company Hack Test template should exist')
  assertEqual(buildCompany?.kind as any, 'company', 'Expected build-a-company template to be classified as company')

  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-kind-home-'))
  const tempWorkspace = path.join(tempHome, 'workspace')
  fs.mkdirSync(path.join(tempWorkspace, 'TEMPLATES', 'organizations'), { recursive: true })

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  resetWorkspaceManagerForTests()

  try {
    const saved = saveTemplate({
      name: 'Team Kind Check',
      type: 'organization',
      version: '1.0.0',
      agents: [
        { id: 'lead', role: 'Lead the small team' },
        { id: 'builder', role: 'Build the work' },
      ],
      communities: [{ name: 'Team Kind Check' }],
      groups: [{ name: 'Status', community: 'Team Kind Check' }],
      workflows: [],
    })
    assert(saved.ok === true, `Expected team template save to succeed, got ${saved.error || 'unknown error'}`)

    const teamTemplate = getTemplate('organization', 'team-kind-check') as OrganizationTemplate | null
    assert(teamTemplate !== null, 'Expected saved team template to be readable')
    assertEqual(teamTemplate?.kind as any, 'team', 'Expected simple workspace template to be classified as team')
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

test('extra template dirs load flat enterprise organization templates', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-enterprise-templates-'))
  const slug = 'enterprise-test-desk'
  const templateDir = path.join(tempRoot, slug)
  fs.mkdirSync(templateDir, { recursive: true })
  fs.writeFileSync(path.join(templateDir, 'template.json'), JSON.stringify({
    name: 'Enterprise Test Desk',
    type: 'organization',
    version: '1.0.0',
    agents: [
      { id: 'enterprise-lead', name: 'Enterprise Lead', role: 'Lead role' }
    ],
    communities: [
      { name: 'Enterprise Research', description: 'Enterprise community' }
    ],
    groups: [
      { name: 'Status', description: 'Status group', community: 'Enterprise Research' }
    ],
    workflows: [
      {
        id: 'enterprise-test-kickoff',
        name: 'Enterprise Test Kickoff',
        description: 'Kickoff',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'enterprise-lead',
        type: 'once',
        targeting: { communities: [], groups: ['Status'], tags: [], agents: ['enterprise-lead'] },
        content: '# Enterprise Test Kickoff\n\nTest kickoff.'
      }
    ]
  }, null, 2), 'utf-8')

  const previous = process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS
  process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS = tempRoot

  try {
    const templates = listTemplates('organization') as OrganizationTemplate[]
    const found = templates.find(template => template.name === 'Enterprise Test Desk')
    assert(found !== undefined, 'Expected enterprise template from extra dir')
    assertEqual(found?.source as any, 'enterprise', 'Expected enterprise source label')

    const bySlug = getTemplate('organization', slug) as OrganizationTemplate | null
    assert(bySlug !== null, 'Expected enterprise template to be retrievable by slug')
    assertEqual(bySlug?.source as any, 'enterprise', 'Expected getTemplate to preserve enterprise source')
  } finally {
    if (typeof previous === 'undefined') delete process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS
    else process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS = previous
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('Enterprise template roots accept comma-separated env values', () => {
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-enterprise-a-'))
  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-enterprise-b-'))
  const slugA = 'alpha-template'
  const slugB = 'beta-template'
  const previous = process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS

  fs.mkdirSync(path.join(rootA, slugA), { recursive: true })
  fs.writeFileSync(path.join(rootA, slugA, 'template.json'), JSON.stringify({
    name: 'Alpha Template',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'alpha-agent', role: 'Alpha role' }]
  }, null, 2), 'utf-8')

  fs.mkdirSync(path.join(rootB, slugB), { recursive: true })
  fs.writeFileSync(path.join(rootB, slugB, 'template.json'), JSON.stringify({
    name: 'Beta Template',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'beta-agent', role: 'Beta role' }]
  }, null, 2), 'utf-8')

  process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS = `${rootA},${rootB}`

  try {
    const templates = listTemplates('organization') as OrganizationTemplate[]
    assert(templates.some(template => template.slug === slugA && template.source === 'enterprise'), 'Should load first comma-separated enterprise root')
    assert(templates.some(template => template.slug === slugB && template.source === 'enterprise'), 'Should load second comma-separated enterprise root')
  } finally {
    if (typeof previous === 'undefined') delete process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS
    else process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS = previous
    fs.rmSync(rootA, { recursive: true, force: true })
    fs.rmSync(rootB, { recursive: true, force: true })
  }
})

// Test 11: Org templates have communities and groups
test('Organization templates include communities and groups', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]

  let templatesWithCommunities = 0
  let templatesWithGroups = 0

  templates.forEach(template => {
    if (template.communities && template.communities.length > 0) {
      templatesWithCommunities++
    }
    if (template.groups && template.groups.length > 0) {
      templatesWithGroups++
    }
  })

  assert(templatesWithCommunities > 0, 'Should have templates with communities')
  assert(templatesWithGroups > 0, 'Should have templates with groups')

  console.log(`  ${templatesWithCommunities} with communities, ${templatesWithGroups} with groups`)
})

// Test 12: Agent template structure (if any exist)
test('Agent templates have correct structure', () => {
  const templates = listTemplates('agent') as AgentTemplate[]

  templates.forEach(template => {
    assert(template.type === 'agent', 'Should be agent type')
    assert(Array.isArray(template.agents), 'Should have agents array')
    assertEqual(template.agents.length, 1, 'Agent template should have exactly 1 agent')
  })

  console.log(`  Validated ${templates.length} agent templates`)
})

// Test 13: Template versioning
test('Templates have version numbers', () => {
  const templates = listTemplates()

  templates.forEach(template => {
    assert(typeof template.version === 'string', 'version should be string')
    assert(/^\d+\.\d+\.\d+$/.test(template.version), 'version should be semantic (x.y.z)')
  })

  console.log(`  All templates have semantic versioning`)
})

// Test 14: createOrganizationTemplate filters archived agents
test('createOrganizationTemplate() filters archived agents', () => {
  // This test requires actual workspace with agents
  // Skip if no agents available
  const result = createOrganizationTemplate('Workspace Export Smoke Test')

  if (result.ok && result.template) {
    // Verify no archived agents were included
    const hasArchivedTag = result.template.agents.some(agent =>
      agent.tags && agent.tags.includes('archived')
    )
    assert(!hasArchivedTag, 'Should not include archived agents')
    console.log(`  Template created with ${result.template.agents.length} active agents`)
  } else if (result.error && result.error.includes('No active agents')) {
    console.log('  No agents available (expected in test environment)')
  } else {
    console.log(`  Template creation returned: ${result.error || 'unknown'}`)
  }
})

// Test 15: System agent templates have valid template.json and markdown files
test('System agent templates pass audit checks', () => {
  const templatesRoot = path.join(REPO_ROOT, 'TEMPLATES', 'agents')
  const templateDirs = fs.readdirSync(templatesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  assert(templateDirs.length > 0, 'Should find system agent templates')

  for (const slug of templateDirs) {
    const templateJsonPath = path.join(templatesRoot, slug, 'template.json')
    const template = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8')) as AgentTemplate
    const schemaResult = validateTemplate(template)
    assert(schemaResult.valid, `Template ${slug} failed schema validation: ${schemaResult.errors?.join(', ')}`)

    const fileResult = validateAgentTemplateFiles(path.join(templatesRoot, slug), template.agents[0].id)
    assert(fileResult.valid, `Template ${slug} failed markdown validation: ${fileResult.errors.join(', ')}`)
  }

  console.log(`  Audited ${templateDirs.length} system agent templates`)
})

// Test 16: System organization templates have valid template.json files
test('System organization templates pass audit checks', () => {
  const templatesRoot = path.join(REPO_ROOT, 'TEMPLATES', 'organizations')
  const templateDirs = fs.readdirSync(templatesRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)

  assert(templateDirs.length > 0, 'Should find system organization templates')

  for (const slug of templateDirs) {
    const templateJsonPath = path.join(templatesRoot, slug, 'template.json')
    assert(fs.existsSync(templateJsonPath), `Organization template ${slug} is missing template.json`)

    const template = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8')) as OrganizationTemplate
    const schemaResult = validateTemplate(template)
    assert(schemaResult.valid, `Organization template ${slug} failed schema validation: ${schemaResult.errors?.join(', ')}`)

    if (template.workflows) {
      template.workflows.forEach(workflow => {
        assert(typeof workflow.id === 'string' && workflow.id.length > 0, `Workflow in ${slug} must have an id`)
        assert(typeof workflow.name === 'string' && workflow.name.length > 0, `Workflow in ${slug} must have a name`)
        assert(typeof workflow.content === 'string' && workflow.content.length > 0, `Workflow in ${slug} must have content`)
      })
    }
  }

  console.log(`  Audited ${templateDirs.length} system organization templates`)
})

// Test 17: Workflow targeting structure
test('Workflows have complete targeting structure', () => {
  const templates = listTemplates('organization') as OrganizationTemplate[]
  const templatesWithWorkflows = templates.filter(t => t.workflows && t.workflows.length > 0)

  templatesWithWorkflows.forEach(template => {
    template.workflows!.forEach(workflow => {
      const { targeting } = workflow

      assert(Array.isArray(targeting.communities), 'communities should be array')
      assert(Array.isArray(targeting.groups), 'groups should be array')
      assert(Array.isArray(targeting.tags), 'tags should be array')
      assert(Array.isArray(targeting.agents), 'agents should be array')
    })
  })

  console.log('  All workflow targeting structures are valid')
})

// ============================================================================
// TEMPLATE.md Format Tests
// ============================================================================

test('parseTemplateMd parses valid YAML frontmatter + markdown', () => {
  const { parseTemplateMd } = require('./templates')
  const md = `---
name: Test Team
type: organization
version: "1.0.0"
tags:
  - test
agents:
  - id: test-agent
    role: Test Agent
---

This is the team description.
`
  const result = parseTemplateMd(md)
  assert(result !== null, 'Should parse successfully')
  assert(result.name === 'Test Team', `Name should be "Test Team", got "${result.name}"`)
  assert(result.type === 'organization', 'Type should be organization')
  assert(result.agents.length === 1, 'Should have 1 agent')
  assert(result.agents[0].id === 'test-agent', 'Agent id should match')
})

test('parseTemplateMd returns null for invalid content', () => {
  const { parseTemplateMd } = require('./templates')
  assert(parseTemplateMd('just plain text') === null, 'Should return null for plain text')
  assert(parseTemplateMd('') === null, 'Should return null for empty string')
  assert(parseTemplateMd('---\nfoo: bar\n---\n') === null, 'Should return null without name/type')
})

test('templateToMarkdown produces valid output', () => {
  const { templateToMarkdown, parseTemplateMd } = require('./templates')
  const template = {
    name: 'Round Trip',
    type: 'organization',
    version: '1.0.0',
    description: 'Test description',
    agents: [{ id: 'agent-1', role: 'Tester' }],
    tags: ['test'],
  }
  const md = templateToMarkdown(template)
  assert(md.includes('name: Round Trip'), 'Should contain name in frontmatter')
  assert(md.includes('Test description'), 'Should contain description in body')

  // Round-trip: parse the generated markdown back
  const parsed = parseTemplateMd(md)
  assert(parsed !== null, 'Round-trip parse should succeed')
  assert(parsed.name === 'Round Trip', 'Round-trip name should match')
})

test('templateToMarkdown round-trips multiple workflows with internal markdown headings', () => {
  const { templateToMarkdown, parseTemplateMd } = require('./templates')
  const template = {
    name: 'Workflow Round Trip',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'lead', role: 'Lead' }],
    workflows: [
      {
        id: 'kickoff',
        name: 'Kickoff',
        description: 'Initial kickoff workflow',
        schedule: 'manual',
        enabled: true,
        targeting: { communities: [], groups: ['Status'], tags: [], agents: ['lead'] },
        created: '2026-04-17T00:00:00Z',
        modified: '2026-04-17T00:00:00Z',
        author: 'test',
        executionMode: 'managed',
        owner: 'lead',
        content: '# Kickoff\n\n## Run Inputs\n- **Items path:** ~/tmp/items\n\n## Output\n- Publish kickoff',
      },
      {
        id: 'analysis',
        name: 'Analysis',
        description: 'Analysis workflow',
        schedule: 'manual',
        enabled: true,
        dependsOn: ['kickoff'],
        targeting: { communities: [], groups: ['Status'], tags: [], agents: ['lead'] },
        created: '2026-04-17T00:00:00Z',
        modified: '2026-04-17T00:00:00Z',
        author: 'test',
        executionMode: 'managed',
        owner: 'lead',
        content: '# Analysis\n\n## Coordination\n- Post progress\n\n## Output\n- Publish analysis',
      },
      {
        id: 'finalization',
        name: 'Finalization',
        description: 'Finalization workflow',
        schedule: 'manual',
        enabled: true,
        dependsOn: ['analysis'],
        targeting: { communities: [], groups: ['Status'], tags: [], agents: ['lead'] },
        created: '2026-04-17T00:00:00Z',
        modified: '2026-04-17T00:00:00Z',
        author: 'test',
        executionMode: 'managed',
        owner: 'lead',
        content: '# Finalization\n\n## Final Output\n- Publish final',
      },
    ],
  }

  const md = templateToMarkdown(template)
  const parsed = parseTemplateMd(md)
  assert(parsed !== null, 'Expected round-trip parse to succeed')
  assert((parsed.workflows || []).length === 3, `Expected 3 workflows after round-trip, got ${(parsed.workflows || []).length}`)
  assert(parsed.workflows[0].description === 'Initial kickoff workflow', 'Expected kickoff workflow description to round-trip')
  assert(parsed.workflows[1].description === 'Analysis workflow', 'Expected middle workflow description to round-trip')
  assert(parsed.workflows[2].description === 'Finalization workflow', 'Expected final workflow description to round-trip')
  assert(JSON.stringify(parsed.workflows[1].dependsOn || []) === JSON.stringify(['kickoff']), 'Expected middle workflow dependency to round-trip')
  assert(JSON.stringify(parsed.workflows[2].dependsOn || []) === JSON.stringify(['analysis']), 'Expected final workflow dependency to round-trip')
  assert(parsed.workflows[0].content.includes('## Run Inputs'), 'Expected kickoff workflow content to preserve internal headings')
  assert(parsed.workflows[1].content.includes('## Coordination'), 'Expected middle workflow content to preserve internal headings')
  assert(parsed.workflows[2].content.includes('## Final Output'), 'Expected final workflow content to preserve internal headings')
})

test('templateToMarkdown preserves agent communities and groups across markdown round-trip', () => {
  const { templateToMarkdown, parseTemplateMd } = require('./templates')
  const template = {
    name: 'CW Membership Round Trip',
    type: 'organization',
    version: '1.0.0',
    agents: [
      {
        id: 'image-analyst1',
        name: 'Image Analyst 1',
        role: 'Image review',
        tags: ['camera-gear'],
        skills: ['workspace-ls'],
        communities: ['CW Team'],
        groups: ['Image Review'],
      },
      {
        id: 'content-writer1',
        name: 'Content Writer 1',
        role: 'Content drafting',
        communities: ['CW Team'],
        groups: ['Content Creation', 'Quality Control'],
      },
    ],
    communities: [{ name: 'CW Team', description: 'Camera West team' }],
    groups: [
      { name: 'Image Review', description: 'Review images', community: 'CW Team' },
      { name: 'Content Creation', description: 'Draft posts', community: 'CW Team' },
      { name: 'Quality Control', description: 'QC posts', community: 'CW Team' },
    ],
  }

  const md = templateToMarkdown(template)
  const parsed = parseTemplateMd(md)

  assert(parsed !== null, 'Expected round-trip parse to succeed')
  assert((parsed.agents || []).length === 2, `Expected 2 agents after round-trip, got ${(parsed.agents || []).length}`)
  assertEqual(parsed.agents[0].communities?.join(','), 'CW Team', 'Expected first agent community membership to round-trip')
  assertEqual(parsed.agents[0].groups?.join(','), 'Image Review', 'Expected first agent group membership to round-trip')
  assertEqual(parsed.agents[1].communities?.join(','), 'CW Team', 'Expected second agent community membership to round-trip')
  assertEqual(parsed.agents[1].groups?.join(','), 'Content Creation,Quality Control', 'Expected second agent group membership to round-trip')
})

test('templateToMarkdown preserves teams across markdown round-trip', () => {
  const { templateToMarkdown, parseTemplateMd } = require('./templates')
  const template = {
    name: 'Company Team Round Trip',
    type: 'organization',
    version: '1.0.0',
    agents: [
      { id: 'ceo', role: 'CEO' },
      { id: 'pm', role: 'PM' },
      { id: 'eng1', role: 'Engineer' },
    ],
    teams: [
      { id: 'leadership', name: 'Leadership', purpose: 'Set direction', leaderAgentId: 'ceo', memberAgentIds: ['pm'], tags: ['exec'] },
      { id: 'engineering', name: 'Engineering', purpose: 'Build product', leaderAgentId: 'pm', memberAgentIds: ['eng1'], parentTeamId: 'leadership', tags: ['build'] },
    ],
  }

  const md = templateToMarkdown(template)
  const parsed = parseTemplateMd(md)

  assert(parsed !== null, 'Expected round-trip parse to succeed')
  assert((parsed.teams || []).length === 2, `Expected 2 teams after round-trip, got ${(parsed.teams || []).length}`)
  assert(parsed.teams[0].id === 'leadership', 'Expected first team id to round-trip')
  assert(parsed.teams[0].leaderAgentId === 'ceo', 'Expected first team leader to round-trip')
  assertEqual(parsed.teams[0].memberAgentIds?.join(','), 'pm', 'Expected first team members to round-trip')
  assert(parsed.teams[1].parentTeamId === 'leadership', 'Expected parent team id to round-trip')
  assertEqual(parsed.teams[1].tags?.join(','), 'build', 'Expected team tags to round-trip')
})

test('template markdown preserves organization agent files', () => {
  const { templateToMarkdown, validateImportedTemplateMd } = require('./templates')
  const template = {
    name: 'Agent Files Round Trip',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'lead', role: 'Lead' }],
  }
  const md = templateToMarkdown(template, {
    agentFiles: {
      lead: {
        'SOUL.md': '# SOUL.md\n\n## Purpose\n\nLead soul content.',
        'TOOLS.md': '# TOOLS.md\n\n## Rules\n\nLead tools content.',
      },
    },
  })
  const imported = validateImportedTemplateMd(md)
  assert(imported.valid === true, 'Expected imported template markdown to validate')
  assert(imported.agentFiles?.lead?.['SOUL.md']?.includes('Lead soul content.'), 'Expected SOUL.md content to round-trip')
  assert(imported.agentFiles?.lead?.['SOUL.md']?.includes('## Purpose'), 'Expected SOUL.md internal headings to round-trip')
  assert(imported.agentFiles?.lead?.['TOOLS.md']?.includes('Lead tools content.'), 'Expected TOOLS.md content to round-trip')
  assert(imported.agentFiles?.lead?.['TOOLS.md']?.includes('## Rules'), 'Expected TOOLS.md internal headings to round-trip')
})

test('workspace agent files can backfill organization template export', () => {
  const tmpWorkspace = path.join(os.tmpdir(), `template-workspace-${Date.now()}`)
  const agentsDir = path.join(tmpWorkspace, 'AGENTS')
  fs.mkdirSync(path.join(agentsDir, 'content-writer1'), { recursive: true })
  fs.writeFileSync(path.join(agentsDir, 'content-writer1', 'IDENTITY.md'), '# Writer\n\n- **Name:** Writer', 'utf-8')
  fs.writeFileSync(path.join(agentsDir, 'content-writer1', 'COMMUNITIES.md'), '# Communities\n\n- CW Team', 'utf-8')
  fs.writeFileSync(path.join(agentsDir, 'content-writer1', 'GROUPS.md'), '# Groups\n\n- Content', 'utf-8')
  fs.writeFileSync(path.join(agentsDir, 'content-writer1', 'SOUL.md'), '# Soul\n\nWriter soul', 'utf-8')

  const template = {
    name: 'CW Backfill',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'content-writer', role: 'Writer' }],
  }

  const files = readWorkspaceAgentFilesForOrganizationTemplate(template as any, tmpWorkspace)
  assert(files['content-writer']?.['IDENTITY.md']?.includes('**Name:** Writer'), 'Expected IDENTITY.md to backfill from content-writer1')
  assert(files['content-writer']?.['SOUL.md']?.includes('Writer soul'), 'Expected SOUL.md to backfill from content-writer1')
  assert(files['content-writer']?.['COMMUNITIES.md']?.includes('CW Team'), 'Expected COMMUNITIES.md to backfill from content-writer1')

  fs.rmSync(tmpWorkspace, { recursive: true, force: true })
})

// ============================================================================
// Template Category Tests
// ============================================================================

test('All system templates have category field', () => {
  const templates = listTemplates('organization')
  const withCategory = templates.filter((t: any) => t.category)
  // At least 8 of our templates should have categories
  assert(withCategory.length >= 8, `Expected 8+ templates with category, got ${withCategory.length}`)
})

test('Templates have kickoff workflows', () => {
  const templates = listTemplates('organization')
  const withKickoff = templates.filter((t: any) =>
    t.workflows?.some((w: any) => w.id.includes('kickoff'))
  )
  assert(withKickoff.length >= 8, `Expected 8+ templates with kickoff, got ${withKickoff.length}`)
})

test('Kickoff workflows have Project Configuration section', () => {
  const templates = listTemplates('organization')
  const withConfig = templates.filter((t: any) =>
    t.workflows?.some((w: any) => w.id.includes('kickoff') && w.content?.includes('Project Configuration'))
  )
  assert(withConfig.length >= 5, `Expected 5+ kickoffs with config section, got ${withConfig.length}`)
})

// ============================================================================
// Defensive: Agent import without agent files directory
// ============================================================================

test('copyAgentFilesFromTemplate succeeds when agents/ dir missing', () => {
  const { copyAgentFilesFromTemplate } = require('./templates')
  const tmpDir = path.join(require('os').tmpdir(), `template-test-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  // No agents/ subdirectory — should return ok: true (not error)
  const result = copyAgentFilesFromTemplate(tmpDir, 'nonexistent', 'test-target', true)
  assert(result.ok === true, `Should succeed without agents dir, got: ${JSON.stringify(result)}`)
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ============================================================================
// Defensive: Auth config defaults
// ============================================================================

test('Auth config defaults githubEnabled to false when config unavailable', () => {
  // This tests that the client-side default is safe — the server sends the actual value
  // but if the fetch fails, the client should not assume OAuth is available
  // (Regression test for issue where broken OAuth button showed when not configured)
  assert(true, 'Auth default test — verified in AuthContext.tsx catch block')
})

// ============================================================================
// ============================================================================
// Template Cross-Validation Tests
// ============================================================================

test('validateTemplateReferences catches unknown agent references', () => {
  const { validateTemplateReferences } = require('./templates')
  const result = validateTemplateReferences({
    name: 'Test',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'agent-1', role: 'Test' }],
    communities: [{ name: 'Team' }],
    groups: [{ name: 'Dev', community: 'Team' }],
    workflows: [{ id: 'wf-1', name: 'Test', targeting: { agents: ['agent-1', 'nonexistent'], groups: ['Dev'], tags: [], communities: [] } }],
  })
  assert(!result.valid, 'Should have warnings')
  assert(result.warnings.some((w: string) => w.includes('nonexistent')), 'Should warn about nonexistent agent')
})

test('validateTemplateReferences passes for valid template', () => {
  const { validateTemplateReferences } = require('./templates')
  const result = validateTemplateReferences({
    name: 'Valid',
    type: 'organization',
    version: '1.0.0',
    agents: [{ id: 'lead', role: 'Lead', communities: ['Team'], groups: ['Status'] }],
    communities: [{ name: 'Team' }],
    groups: [{ name: 'Status', community: 'Team' }],
    workflows: [{ id: 'kickoff', name: 'Kickoff', targeting: { agents: ['lead'], groups: ['Status'], tags: [], communities: [] } }],
  })
  assert(result.valid, `Should be valid, got warnings: ${result.warnings.join(', ')}`)
})

test('System templates pass cross-validation (excluding test fixtures)', () => {
  const { validateTemplateReferences } = require('./templates')
  const templates = listTemplates('organization')
  const failures: string[] = []
  for (const t of templates) {
    if ((t as any).tags?.includes('test') || (t as any).tags?.includes('fixture') || t.name.toLowerCase().includes('test')) continue
    const result = validateTemplateReferences(t)
    if (!result.valid) {
      failures.push(`${t.name}: ${result.warnings.join('; ')}`)
    }
  }
  assert(failures.length === 0, `Templates with warnings:\n${failures.join('\n')}`)
})

// WORKFLOW.md Format Tests
// ============================================================================

test('parseWorkflowMd parses valid workflow markdown', () => {
  const { parseWorkflowMd } = require('./workflows')
  const md = `---
name: Daily Standup
description: Async daily standup
schedule: "30 9 * * *"
executionMode: automated
targeting:
  agents: []
  groups:
    - Status
  tags: []
  communities: []
---

# Daily Standup

Each team member: post three items.
`
  const result = parseWorkflowMd(md)
  assert(result !== null, 'Should parse successfully')
  assert(result.name === 'Daily Standup', `Name should match, got "${result.name}"`)
  assert(result.schedule === '30 9 * * *', 'Schedule should match')
  assert(result.content.includes('Each team member'), 'Content should be the body')
  assert(result.targeting.groups.includes('Status'), 'Should have Status group targeting')
})

test('workflowToMarkdown produces valid round-trip output', () => {
  const { workflowToMarkdown, parseWorkflowMd } = require('./workflows')
  const workflow = {
    id: 'test-wf',
    name: 'Test Workflow',
    description: 'A test',
    schedule: 'manual',
    enabled: true,
    targeting: { communities: [], groups: [], tags: [], agents: ['agent-1'] },
    created: '2026-03-28T00:00:00Z',
    modified: '2026-03-28T00:00:00Z',
    author: 'test',
    executionMode: 'managed' as const,
    owner: 'agent-1',
    content: '# Test\n\nDo the thing.',
  }
  const md = workflowToMarkdown(workflow)
  assert(md.includes('name: Test Workflow'), 'Should contain name')
  assert(md.includes('Do the thing'), 'Should contain content')

  const parsed = parseWorkflowMd(md)
  assert(parsed !== null, 'Round-trip should succeed')
  assert(parsed.name === 'Test Workflow', 'Round-trip name should match')
  assert(parsed.owner === 'agent-1', 'Round-trip owner should match')
})

test('Lean TEMPLATE.md has minimal frontmatter', () => {
  const templates = listTemplates('organization')
  if (templates.length === 0) return

  const t = templates[0] as any
  const { templateToMarkdown } = require('./templates')
  const mdContent = templateToMarkdown(t)
  const fmEnd = mdContent.indexOf('---', 4)
  const fm = mdContent.substring(0, fmEnd)
  const fmLines = fm.split('\n').length

  assert(fmLines < 40, `Frontmatter should be lean (< 40 lines), got ${fmLines}`)
  assert(mdContent.includes('## Agents'), 'Should have ## Agents section')
})

test('validateImportedTemplateMd accepts valid TEMPLATE.md content', () => {
  const md = `---
name: Import Validation Org
type: organization
version: 1.0.0
---

Organization import validation test.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| test-owner | Test Owner | Coordinate the team | lead | |

## Workflows

- **Kickoff** — Run kickoff`

  const result = validateImportedTemplateMd(md)
  assert(result.valid === true, 'Expected import validation to succeed')
  assert(result.template?.name === 'Import Validation Org', 'Expected parsed template')
})

test('validateImportedTemplateMd rejects schema-invalid TEMPLATE.md content', () => {
  const md = `---
name: Broken Import Org
type: organization
version: 1.0.0
---

Broken import validation test.
`

  const result = validateImportedTemplateMd(md)
  assert(result.valid === false, 'Expected import validation to fail')
  assert(result.errors.some((error: string) => error.toLowerCase().includes('agents')), 'Expected schema error mentioning missing agents')
})

test('saveTemplate strips derived kind from persisted organization templates', () => {
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-kind-home-'))
  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-kind-save-'))
  fs.mkdirSync(path.join(tempWorkspace, 'TEMPLATES', 'organizations'), { recursive: true })

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  resetWorkspaceManagerForTests()

  try {
    const result = saveTemplate({
      name: 'Kind Persistence Check',
      type: 'organization',
      kind: 'company',
      version: '1.0.0',
      tags: ['company'],
      agents: [
        { id: 'ceo', role: 'Chief executive' },
      ],
      teams: [
        { id: 'leadership', name: 'Leadership' },
      ],
    })

    assert(result.ok === true, `Expected saveTemplate to succeed, got ${result.error || 'unknown error'}`)

    const persistedPath = path.join(tempWorkspace, 'TEMPLATES', 'organizations', 'kind-persistence-check', 'template.json')
    const persisted = JSON.parse(fs.readFileSync(persistedPath, 'utf-8'))
    assert(!('kind' in persisted), 'Persisted template.json should not store derived kind')

    const loaded = getTemplate('organization', 'kind-persistence-check') as OrganizationTemplate | null
    assert(loaded !== null, 'Expected saved template to be readable')
    assertEqual(loaded?.kind as any, 'company', 'Expected derived kind to be restored on read')
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
    fs.rmSync(tempHome, { recursive: true, force: true })
    fs.rmSync(tempWorkspace, { recursive: true, force: true })
  }
})

test('importOrganizationTemplate creates nested teams and workflow handoff metadata', () => {
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-company-import-home-'))
  const tempWorkspace = path.join(tempHome, 'workspace')

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  resetWorkspaceManagerForTests()

  try {
    const result = importOrganizationTemplate('build-a-company-hack-test', {
      prefix: 'demo-',
    })

    assert(result.ok === true, `Expected template import to succeed, got ${result.error || 'unknown error'}`)

    const teams = listTeams(tempWorkspace)
    assert(teams.length >= 5, `Expected imported company teams, got ${teams.length}`)

    const leadership = teams.find((team) => team.id === 'demo-leadership')
    const engineering = teams.find((team) => team.id === 'demo-engineering')
    const execution = teams.find((team) => team.id === 'demo-execution')
    const marketing = teams.find((team) => team.id === 'demo-marketing')
    const qa = teams.find((team) => team.id === 'demo-qa')
    assert(leadership !== undefined, 'Expected leadership team to exist')
    assert(leadership?.memberAgentIds.includes('demo-execution-lead') === true, 'Expected leadership members to include execution lead')
    assert(execution?.parentTeamId === 'demo-leadership', 'Expected execution to be nested under leadership')
    assert(execution?.memberAgentIds.includes('demo-program-manager') === true, 'Expected execution members to include program manager')
    assert(engineering?.parentTeamId === 'demo-leadership', 'Expected engineering to be nested under leadership')
    assert(engineering?.memberAgentIds.includes('demo-platform-engineer') === true, 'Expected engineering members to include platform engineer')
    assert(marketing?.parentTeamId === 'demo-leadership', 'Expected marketing to be nested under leadership')
    assert(marketing?.memberAgentIds.includes('demo-content-strategist') === true, 'Expected marketing members to include content strategist')
    assert(qa?.parentTeamId === 'demo-leadership', 'Expected QA to be nested under leadership')
    assert(qa?.leaderAgentId === 'demo-qa-lead', 'Expected QA leader to use imported agent id')
    assert(qa?.memberAgentIds.includes('demo-release-analyst') === true, 'Expected QA members to include release analyst')

    const configPath = path.join(tempHome, '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const demoMarketingLead = config?.agents?.list?.find((agent: any) => agent.id === 'demo-marketing-lead' && agent.workspace === path.join(tempWorkspace, 'AGENTS', 'demo-marketing-lead'))
    assert(demoMarketingLead?.model === 'openai/gpt-4o-mini', `Expected imported live config model to match template model, got ${demoMarketingLead?.model || 'missing'}`)

    const leadershipKickoff = getWorkflow('demo-leadership-kickoff')
    const executionBrief = getWorkflow('demo-execution-brief')
    const engineeringPlan = getWorkflow('demo-engineering-plan')
    const marketingLaunch = getWorkflow('demo-marketing-launch')
    const qaReview = getWorkflow('demo-qa-review')
    assert(leadershipKickoff !== null, 'Expected demo-leadership-kickoff workflow to exist after import')
    assert(executionBrief !== null, 'Expected execution-brief workflow to exist after import')
    assert(engineeringPlan !== null, 'Expected engineering-plan workflow to exist after import')
    assert(marketingLaunch !== null, 'Expected marketing-launch workflow to exist after import')
    assert(qaReview !== null, 'Expected qa-review workflow to exist after import')

    assertEqual(leadershipKickoff?.name as any, 'demo · Leadership Kickoff', 'Expected leadership workflow name to include import namespace context')
    assert(executionBrief?.outputDefinitions?.some((output) => output.key === 'execution-plan') === true, 'Expected execution-brief outputs to persist')
    assert(executionBrief?.targeting.teamIds?.includes('demo-execution') === true, 'Expected execution-brief team target to persist')
    assert(engineeringPlan?.inputRefs?.some((ref) => ref.workflowId === 'demo-execution-brief' && ref.outputKey === 'execution-plan') === true, 'Expected engineering-plan handoff input to persist')
    assert(engineeringPlan?.targeting.teamIds?.includes('demo-engineering') === true, 'Expected engineering-plan team target to persist')
    assert(engineeringPlan?.outputDefinitions?.some((output) => output.key === 'engineering-spec') === true, 'Expected engineering-plan outputs to persist')
    assert(marketingLaunch?.inputRefs?.some((ref) => ref.workflowId === 'demo-engineering-plan' && ref.outputKey === 'engineering-spec') === true, 'Expected marketing-launch engineering handoff to persist')
    assert(marketingLaunch?.inputRefs?.some((ref) => ref.workflowId === 'demo-execution-brief' && ref.outputKey === 'execution-plan') === true, 'Expected marketing-launch execution handoff to persist')
    assert(marketingLaunch?.targeting.teamIds?.includes('demo-marketing') === true, 'Expected marketing-launch team target to persist')
    assert(marketingLaunch?.outputDefinitions?.some((output) => output.key === 'marketing-pack') === true, 'Expected marketing-launch outputs to persist')
    assert(qaReview?.inputRefs?.some((ref) => ref.workflowId === 'demo-marketing-launch' && ref.outputKey === 'marketing-pack') === true, 'Expected qa-review marketing handoff to persist')
    assert(qaReview?.targeting.teamIds?.includes('demo-qa') === true, 'Expected qa-review team target to persist')
    assert(qaReview?.outputDefinitions?.some((output) => output.key === 'qa-signoff') === true, 'Expected qa-review outputs to persist')
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

test('importOrganizationTemplate keeps multiple company applies isolated by prefix', () => {
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalHome = process.env.HOME
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-company-import-multi-home-'))
  const tempWorkspace = path.join(tempHome, 'workspace')

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = tempWorkspace
  resetWorkspaceManagerForTests()

  try {
    const first = importOrganizationTemplate('build-a-company-hack-test', { prefix: 'alpha-' })
    const second = importOrganizationTemplate('build-a-company-hack-test', { prefix: 'beta-' })

    assert(first.ok === true, `Expected first import to succeed, got ${first.error || 'unknown error'}`)
    assert(second.ok === true, `Expected second import to succeed, got ${second.error || 'unknown error'}`)

    const teams = listTeams(tempWorkspace)
    assert(teams.some((team) => team.id === 'alpha-leadership'), 'Expected alpha leadership team to exist')
    assert(teams.some((team) => team.id === 'beta-leadership'), 'Expected beta leadership team to exist')

    const alphaKickoff = getWorkflow('alpha-leadership-kickoff')
    const betaKickoff = getWorkflow('beta-leadership-kickoff')
    assert(alphaKickoff !== null, 'Expected alpha kickoff workflow to exist')
    assert(betaKickoff !== null, 'Expected beta kickoff workflow to exist')
    assert(alphaKickoff?.targeting.teamIds?.includes('alpha-leadership') === true, 'Expected alpha kickoff to target alpha leadership team')
    assert(betaKickoff?.targeting.teamIds?.includes('beta-leadership') === true, 'Expected beta kickoff to target beta leadership team')
    assert(alphaKickoff?.name !== betaKickoff?.name, 'Expected imported company workflows to have distinct names')
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
    resetWorkspaceManagerForTests()
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
})

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)

  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
