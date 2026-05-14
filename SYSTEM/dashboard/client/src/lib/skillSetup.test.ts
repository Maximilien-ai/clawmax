import { getSkillSetupHint, supportsDashboardSkillSetup } from './skillSetup'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function main() {
  console.log(`\n${YELLOW}=== Skill Setup Helper Test Suite ===${RESET}\n`)

  await test('getSkillSetupHint() returns metadata-driven setup hints', () => {
    const hint = getSkillSetupHint({
      name: 'calendar-pro',
      setupRequirements: {
        label: 'Needs setup',
        message: 'Connect your calendar account before use.',
        actionId: 'calendar-auth',
        actionLabel: 'Connect Calendar',
        successMessage: 'Calendar connected.',
        commands: ['calendar auth login'],
        inputs: [
          {
            key: 'accountEmail',
            label: 'Account Email',
            kind: 'email',
            required: true,
          },
        ],
      },
    })

    assert(!!hint, 'Expected metadata-driven setup hint')
    assert(hint?.actionLabel === 'Connect Calendar', 'Expected action label to persist')
    assert(hint?.inputs?.[0]?.key === 'accountEmail', 'Expected setup input metadata to persist')
  })

  await test('supportsDashboardSkillSetup() only enables dashboard-runnable setup actions', () => {
    assert(supportsDashboardSkillSetup({
      name: 'calendar-pro',
      setupRequirements: {
        label: 'Needs setup',
        message: 'Connect your calendar account before use.',
        actionId: 'calendar-auth',
      },
    }) === false, 'Expected unknown setup actions to stay warning-only for now')
    assert(supportsDashboardSkillSetup({
      name: 'gog',
      setupRequirements: {
        label: 'Needs setup',
        message: 'Finish auth before use.',
        actionId: 'gog-google-workspace-auth',
      },
    }) === true, 'Expected supported setup action metadata to enable guided setup')
  })

  await test('gog fallback still exposes a guided setup hint', () => {
    const hint = getSkillSetupHint({ name: 'gog' })
    assert(!!hint, 'Expected gog fallback setup hint')
    assert(hint?.inputs?.length === 2, 'Expected gog fallback to expose setup inputs')
    assert(supportsDashboardSkillSetup({ name: 'gog' }) === true, 'Expected gog fallback to keep guided setup support')
  })

  await test('generic env/config requirements automatically produce setup warnings', () => {
    const envHint = getSkillSetupHint({
      name: 'trello',
      requires: {
        env: ['TRELLO_API_KEY', 'TRELLO_TOKEN'],
      },
    })
    assert(!!envHint, 'Expected env-based setup hint')
    assert(envHint?.message.includes('TRELLO_API_KEY'), 'Expected env keys in setup hint')

    const configHint = getSkillSetupHint({
      name: 'discord',
      requires: {
        config: ['channels.discord.token'],
      },
    })
    assert(!!configHint, 'Expected config-based setup hint')
    assert(configHint?.message.includes('channels.discord.token'), 'Expected config keys in setup hint')
  })

  await test('built-in setup catalog warns for shipped auth-dependent skills', () => {
    const githubHint = getSkillSetupHint({ name: 'github' })
    assert(!!githubHint, 'Expected GitHub setup hint')
    assert(githubHint?.commands?.includes('gh auth login'), 'Expected GitHub auth command hint')
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
}

main().catch((err: any) => {
  console.log(`${RED}Test suite crashed${RESET}`)
  console.log(`  Error: ${err?.message || String(err)}`)
  process.exit(1)
})
