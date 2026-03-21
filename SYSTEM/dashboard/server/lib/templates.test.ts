/**
 * Templates API Test Suite
 *
 * Run with: npx ts-node server/lib/templates.test.ts
 */

import {
  listTemplates,
  getTemplate,
  validateTemplate,
  validateAgentTemplateFiles,
  createOrganizationTemplate,
  slugify,
  type OrganizationTemplate,
  type AgentTemplate
} from './templates'
import fs from 'fs'
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
  const result = createOrganizationTemplate('Test Template')

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
