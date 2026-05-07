/**
 * Template customization validation tests
 *
 * Run with: npx ts-node --transpileOnly server/routes/templates-customization.test.ts
 */

import { validateOrganizationCustomization } from './templates'

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
