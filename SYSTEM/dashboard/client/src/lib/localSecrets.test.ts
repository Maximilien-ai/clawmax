/**
 * Local secrets test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/localSecrets.test.ts
 */

import {
  findManagedSecretConflicts,
  getPartnerVaultKey,
  mergeSecretSources,
  parseEnvLikeSecrets,
  readPartnerValuesFromSharedSecrets,
  summarizeSecretReadiness,
  writePartnerValuesToSharedSecrets,
} from './localSecrets'

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

console.log(`\n${YELLOW}=== Local Secrets Test Suite ===${RESET}\n`)

test('parseEnvLikeSecrets parses basic key value pairs and ignores comments', () => {
  const parsed = parseEnvLikeSecrets(`
    # comment
    OPENAI_API_KEY=abc123
    GEMINI_API_KEY = xyz789
  `)
  assert(parsed.OPENAI_API_KEY === 'abc123', 'Expected OPENAI_API_KEY')
  assert(parsed.GEMINI_API_KEY === 'xyz789', 'Expected GEMINI_API_KEY')
  assert(Object.keys(parsed).length === 2, 'Expected only two parsed keys')
})

test('parseEnvLikeSecrets accepts export prefix and quoted values', () => {
  const parsed = parseEnvLikeSecrets(`
    export REDIS_URL="redis://localhost:6379"
    OTP_ALLOWED_EMAILS='a@example.com,b@example.com'
  `)
  assert(parsed.REDIS_URL === 'redis://localhost:6379', 'Expected REDIS_URL')
  assert(parsed.OTP_ALLOWED_EMAILS === 'a@example.com,b@example.com', 'Expected OTP_ALLOWED_EMAILS')
})

test('parseEnvLikeSecrets ignores invalid lines and empty values', () => {
  const parsed = parseEnvLikeSecrets(`
    not-valid
    123BAD=value
    EMPTY=
    VALID_KEY=value
  `)
  assert(parsed.VALID_KEY === 'value', 'Expected VALID_KEY')
  assert(!('EMPTY' in parsed), 'Expected EMPTY to be ignored')
  assert(Object.keys(parsed).length === 1, 'Expected only one valid parsed key')
})

test('mergeSecretSources uses local over workspace over global', () => {
  const merged = mergeSecretSources(
    { SHARED_KEY: 'global', GLOBAL_ONLY: 'one' },
    { SHARED_KEY: 'workspace', WORKSPACE_ONLY: 'two' },
    { SHARED_KEY: 'local', LOCAL_ONLY: 'three' }
  )
  assert(merged.SHARED_KEY === 'local', 'Expected local secret to win')
  assert(merged.GLOBAL_ONLY === 'one', 'Expected global-only secret')
  assert(merged.WORKSPACE_ONLY === 'two', 'Expected workspace-only secret')
  assert(merged.LOCAL_ONLY === 'three', 'Expected local-only secret')
})

test('findManagedSecretConflicts returns only differing overlapping keys', () => {
  const conflicts = findManagedSecretConflicts(
    { OPENAI_API_KEY: 'shared-openai', ANTHROPIC_API_KEY: 'same-anthropic', REDIS_URL: 'redis://a' },
    { OPENAI_API_KEY: 'byok-openai', ANTHROPIC_API_KEY: 'same-anthropic', GEMINI_API_KEY: 'gemini' }
  )
  assert(conflicts.length === 1, 'Expected one conflict')
  assert(conflicts[0].key === 'OPENAI_API_KEY', 'Expected OPENAI_API_KEY conflict')
  assert(conflicts[0].sharedValue === 'shared-openai', 'Expected shared value')
  assert(conflicts[0].managedValue === 'byok-openai', 'Expected managed value')
})

test('partner vault helpers only map declared fields', () => {
  assert(getPartnerVaultKey('opik', 'apiKey') === 'OPIK_API_KEY', 'Expected api key mapping')
  assert(getPartnerVaultKey('github', 'defaultRepo') === 'GITHUB_DEFAULT_REPO', 'Expected default repo mapping')

  const fields = [
    { key: 'apiKey', label: 'API key', secret: true },
    { key: 'workspace', label: 'Workspace' },
  ]
  const read = readPartnerValuesFromSharedSecrets('opik', fields, {
    OPIK_API_KEY: 'secret',
    OPIK_WORKSPACE: 'demo',
    OTHER_KEY: 'ignore',
  })
  assert(read.apiKey === 'secret', 'Expected apiKey from shared secrets')
  assert(read.workspace === 'demo', 'Expected workspace from shared secrets')

  const written = writePartnerValuesToSharedSecrets('opik', fields, { KEEP_ME: 'yes' }, { apiKey: 'secret2', workspace: 'demo2' })
  assert(written.OPIK_API_KEY === 'secret2', 'Expected written api key')
  assert(written.OPIK_WORKSPACE === 'demo2', 'Expected written workspace')
  assert(written.KEEP_ME === 'yes', 'Expected preserved existing key')
})

test('writePartnerValuesToSharedSecrets removes stale partner values when fields are cleared', () => {
  const fields = [
    { key: 'apiKey', label: 'API key', secret: true },
    { key: 'workspace', label: 'Workspace' },
  ]

  const written = writePartnerValuesToSharedSecrets(
    'opik',
    fields,
    {
      OPIK_API_KEY: 'secret',
      OPIK_WORKSPACE: 'demo',
      KEEP_ME: 'yes',
    },
    {
      apiKey: '',
      workspace: '',
    }
  )

  assert(!('OPIK_API_KEY' in written), 'Expected cleared apiKey to be removed from shared secrets')
  assert(!('OPIK_WORKSPACE' in written), 'Expected cleared workspace to be removed from shared secrets')
  assert(written.KEEP_ME === 'yes', 'Expected unrelated keys to be preserved')
})

test('summarizeSecretReadiness reports ready when all required inputs are configured', () => {
  const readiness = summarizeSecretReadiness(
    [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', kind: 'api_key' },
      { key: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token', kind: 'token' },
    ],
    {
      OPENAI_API_KEY: 'sk-live-12345678',
      SLACK_BOT_TOKEN: 'xoxb-12345678',
    }
  )

  assert(readiness.status === 'ready', 'Expected readiness to be ready')
  assert(readiness.present === 2, 'Expected both secrets to be present')
  assert(readiness.missingRequired === 0, 'Expected no required secrets missing')
  assert(readiness.degraded === 0, 'Expected no degraded secrets')
})

test('summarizeSecretReadiness reports missing when required inputs are absent', () => {
  const readiness = summarizeSecretReadiness(
    [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', kind: 'api_key' },
      { key: 'PROJECT_ID', label: 'Project ID', kind: 'id' },
      { key: 'OPTIONAL_NOTE', label: 'Optional Note', required: false, kind: 'text' },
    ],
    {
      PROJECT_ID: 'project-123',
    }
  )

  assert(readiness.status === 'missing', 'Expected readiness to be missing')
  assert(readiness.missingRequired === 1, 'Expected one required secret missing')
  assert(readiness.optionalMissing === 1, 'Expected one optional secret missing')
  assert(readiness.missingLabels.includes('OpenAI API Key'), 'Expected missing label to include OpenAI API Key')
})

test('summarizeSecretReadiness reports degraded for placeholder and optional gaps', () => {
  const readiness = summarizeSecretReadiness(
    [
      { key: 'API_BASE_URL', label: 'API Base URL', kind: 'url' },
      { key: 'ACCESS_TOKEN', label: 'Access Token', kind: 'token' },
      { key: 'TEAM_NAME', label: 'Team Name', required: false, kind: 'text' },
    ],
    {
      API_BASE_URL: 'example.com',
      ACCESS_TOKEN: 'changeme',
    }
  )

  assert(readiness.status === 'degraded', 'Expected readiness to be degraded')
  assert(readiness.degraded === 2, 'Expected two degraded inputs')
  assert(readiness.optionalMissing === 1, 'Expected one optional secret missing')
  assert(readiness.degradedLabels.includes('API Base URL'), 'Expected API Base URL to need review')
  assert(readiness.degradedLabels.includes('Access Token'), 'Expected Access Token to need review')
  assert(readiness.optionalMissingLabels.includes('Team Name'), 'Expected optional label to be tracked')
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
