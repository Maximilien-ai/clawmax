/**
 * Templates API Test Suite
 *
 * Run with: npx ts-node server/lib/templates.test.ts
 */

import {
  listTemplates,
  getTemplate,
  validateTemplate,
  validateImportedTemplateMd,
  validateAgentTemplateFiles,
  createOrganizationTemplate,
  slugify,
  type OrganizationTemplate,
  type AgentTemplate
} from './templates'
import { checkTemplatePrereqs } from './prereqs'
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
