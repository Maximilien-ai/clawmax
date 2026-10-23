/**
 * Template customization validation tests
 *
 * Run with: npx ts-node --transpileOnly server/routes/templates-customization.test.ts
 */

import fs from 'fs'
import path from 'path'
import { validateOrganizationCustomization } from './templates'
import { findMissingRequiredWorkflowFields } from '../lib/workflow-required-fields'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Template Customization Validation Tests ===${RESET}\n`)

test('rejects missing github repo when GitHub is enabled', () => {
  const result = validateOrganizationCustomization({
    useGithub: true,
    githubRepo: '',
    workflows: [],
  })

  assert(result.valid === false, 'Expected validation to fail')
  assert(result.errors.some((error) => error.includes('GitHub repository is empty')), 'Expected missing repo error')
})

test('rejects invalid workflow placeholders and bad URLs', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-1',
        name: 'Workflow One',
        content: `
- **Docs URL:** not-a-url
- **Action target:** [...]
`,
      },
    ],
  })

  assert(result.valid === false, 'Expected validation to fail')
  assert(result.errors.some((error) => error.includes('invalid URL')), 'Expected invalid URL error')
  assert(result.errors.some((error) => error.includes('empty required field')), 'Expected empty required field error')
})

test('rejects unresolved mustache-style workflow placeholders', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-raw-template',
        name: 'Workflow With Raw Template Tokens',
        content: `
- **Event date and time:** {{eventDateTime}}
- **Expected guests:** {{expectedGuests}}
`,
      },
    ],
  })

  assert(result.valid === false, 'Expected validation to fail')
  assert(result.errors.some((error) => error.includes('Event date and time')), 'Expected unresolved event date error')
  assert(result.errors.some((error) => error.includes('Expected guests')), 'Expected unresolved expected guests error')
})

test('accepts valid github repo and optional placeholders', () => {
  const result = validateOrganizationCustomization({
    useGithub: true,
    githubRepo: 'owner/repo',
    workflows: [
      {
        id: 'wf-2',
        name: 'Workflow Two',
        content: `
- **GitHub repo:** owner/repo
- **Webhook URL (optional):** [...]
`,
      },
    ],
  }, {
    repoExists: () => true,
  })

  assert(result.valid === true, 'Expected validation to pass')
  assert(result.errors.length === 0, 'Expected no validation errors')
})

test('accepts optional URL placeholders without treating them as invalid links', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-optional-url',
        name: 'Optional URL Workflow',
        content: `
- **Reference URL (optional):** [...]
`,
      },
    ],
  })

  assert(result.valid === true, 'Expected optional URL placeholder to pass')
  assert(result.errors.length === 0, 'Expected no URL validation errors for optional placeholders')
})

test('rejects invalid GitHub repo values inside workflow fields', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-bad-repo',
        name: 'Repo Validation Workflow',
        content: `
- **GitHub repo:** owner only
`,
      },
    ],
  })

  assert(result.valid === false, 'Expected invalid workflow repo to fail validation')
  assert(result.errors.some((error) => error.includes('invalid GitHub repo')), 'Expected invalid GitHub repo error')
})

test('accepts chief-of-staff style optional daily-run placeholders', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-chief-of-staff',
        name: 'Daily Priorities Kickoff',
        content: `
- **Today’s top priorities (optional):** [e.g., investor calls, hiring, customer follow-up]
- **Critical meetings (optional):** [e.g., 1:00 PM partner review, 4:00 PM team sync]
- **Inbox focus (optional):** [e.g., clear urgent threads, draft replies, identify delegate items]
- **Research needs (optional):** [e.g., people, companies, topics to brief before meetings]
- **GitHub repo (optional):** [e.g., owner/repo]
`,
      },
    ],
  })

  assert(result.valid === true, 'Expected optional day-of placeholders to pass')
  assert(result.errors.length === 0, 'Expected no validation errors for optional day-of placeholders')
})

test('accepts recurring desk optional apply fields for personal ops templates', () => {
  const result = validateOrganizationCustomization({
    workflows: [
      {
        id: 'wf-email-calendar',
        name: 'Communications Kickoff',
        content: `
- **Inbox goals (optional):** [e.g., clear urgent items]
- **Calendar goals (optional):** [e.g., reduce conflicts]
- **Priority contacts or threads (optional):** [people, teams, customers]
`,
      },
      {
        id: 'wf-meeting-capture',
        name: 'Meeting Capture Kickoff',
        content: `
- **Meeting name (optional):** [e.g., weekly staff sync]
- **Participants (optional):** [people or teams involved]
- **What to capture (optional):** [decisions, action items]
`,
      },
      {
        id: 'wf-personal-research',
        name: 'Research Request Kickoff',
        content: `
- **Research target (optional):** [person, company, topic]
- **Question to answer (optional):** [e.g., what matters most before the conversation?]
- **Context (optional):** [meeting, outreach, diligence]
`,
      },
      {
        id: 'wf-family-ops',
        name: 'Family Week Kickoff',
        content: `
- **This week’s priorities (optional):** [school, appointments, travel]
- **Key family members or roles (optional):** [names or roles]
- **Known stress points (optional):** [time crunches, overloaded days]
`,
      },
      {
        id: 'wf-market-signal',
        name: 'Market Attention Kickoff',
        content: `
- **Watchlist or sector (optional):** [tickers, themes, sector]
- **Time horizon (optional):** [today, this week]
- **Risk style (optional):** [conservative, balanced, aggressive]
`,
      },
      {
        id: 'wf-tax-planning',
        name: 'Tax Kickoff',
        content: `
- **Tax year or period (optional):** [e.g., 2025 filing]
- **Primary question (optional):** [e.g., readiness, deduction review]
- **Known tax documents (optional):** [W-2, 1099, K-1]
`,
      },
    ],
  })

  assert(result.valid === true, 'Expected recurring-desk optional placeholders to pass')
  assert(result.errors.length === 0, 'Expected no validation errors for recurring-desk optional placeholders')
})

function serverMissingFields(result: { errors: string[] }): string[] {
  return result.errors.map((error) => error.match(/empty required field: (.+)\.$/)?.[1] || '').filter(Boolean)
}

test('the apply form and the server agree on required workflow fields, including declared optional inputs', () => {
  const content = `## Run Inputs
- **Event type:** [birthday, dinner, meetup]
- **Food and drink plan:** [food and drink plan]
- **Budget or purchase constraints:** [budget or purchase constraints]
- **Dietary notes (optional):** [e.g., vegan guests]
- **Output artifact:** run-of-show
`
  const inputs = [
    { name: 'eventType', label: 'Event type', required: true },
    { name: 'foodAndDrinkPlan', label: 'Food and drink plan', required: false },
    // Declared under a different label; matched by name.
    { name: 'outputArtifact', label: 'Final output artifact', required: true },
  ]
  const formMissing = findMissingRequiredWorkflowFields(content, inputs)
  assert(
    JSON.stringify(formMissing) === JSON.stringify(['Event type', 'Budget or purchase constraints']),
    `Unexpected required fields: ${JSON.stringify(formMissing)}`,
  )
  const result = validateOrganizationCustomization({ workflows: [{ id: 'kickoff', name: 'Kickoff', content, inputs }] })
  assert(JSON.stringify(serverMissingFields(result)) === JSON.stringify(formMissing), `Server disagrees: ${JSON.stringify(result.errors)}`)
})

test('Small Event Planning Desk deploys once its required kickoff inputs are filled, and not before', () => {
  const templatePath = path.resolve(__dirname, '../../../../TEMPLATES/organizations/small-event-planning-desk/template.json')
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'))
  const workflows = template.workflows.map((workflow: any) => ({ id: workflow.id, name: workflow.name, content: workflow.content, inputs: workflow.inputs }))
  const kickoff = workflows.find((workflow: any) => workflow.id === 'small-event-kickoff')

  const before = validateOrganizationCustomization({ workflows })
  const missing = findMissingRequiredWorkflowFields(kickoff.content, kickoff.inputs)
  assert(before.valid === false, 'Expected the unfilled template to be rejected')
  assert(JSON.stringify(serverMissingFields(before)) === JSON.stringify(missing), `Server and form disagree: ${JSON.stringify(before.errors)}`)
  assert(missing.includes('Event type') && missing.includes('Venue or format'), 'Expected the declared required inputs to be required')
  assert(!missing.includes('Food and drink plan'), 'Expected the input the template declares optional not to block deployment')

  const filled = missing.reduce((content: string, label: string) => content.replace(
    new RegExp(`^(-\\s+\\*\\*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\*\\*)\\s+.*$`, 'm'),
    `$1 value for ${label}`,
  ), kickoff.content)
  const after = validateOrganizationCustomization({
    workflows: workflows.map((workflow: any) => workflow.id === kickoff.id ? { ...workflow, content: filled } : workflow),
  })
  assert(after.valid === true, `Expected the filled template to pass: ${JSON.stringify(after.errors)}`)
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
