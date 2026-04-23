import { getResolvedMaintenanceBanner, resetResolvedMaintenanceBannerCache } from './cloud-maintenance-status'

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
  } finally {
    resetResolvedMaintenanceBannerCache()
  }
}

console.log(`\n${YELLOW}=== Cloud Maintenance Status Test Suite ===${RESET}\n`)

const originalFetch = globalThis.fetch
const originalSummaryUrl = process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
const originalToken = process.env.TEMPLATE_FEEDBACK_TOKEN
const originalPublicUrl = process.env.DASHBOARD_PUBLIC_URL
const originalAppUrl = process.env.DASHBOARD_APP_URL
const originalInstanceKey = process.env.CLAWMAX_INSTANCE_KEY

async function run() {
  await test('resolved maintenance banner prefers cloud scheduled status over env fallback', async () => {
    process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = 'https://www.clawmax.ai/api/template-feedback/sink-summary'
    process.env.TEMPLATE_FEEDBACK_TOKEN = 'test-token'
    process.env.CLAWMAX_INSTANCE_KEY = 'test7'

    let requestedUrl = ''
    let authHeader = ''
    globalThis.fetch = (async (input: any, init?: any) => {
      requestedUrl = String(input)
      authHeader = String(init?.headers?.Authorization || '')
      return {
        ok: true,
        json: async () => ({
          maintenance: {
            active: false,
            state: 'scheduled',
            starts_at: '2026-04-23T16:00:00.000Z',
            message: 'Planned ClawMax maintenance',
            operator_note: 'Please save your workspace first.',
          },
        }),
      } as any
    }) as any

    const banner = await getResolvedMaintenanceBanner({
      MAINTENANCE_STATE: 'none',
    })

    assert(!!banner, 'Expected cloud maintenance banner')
    assert(banner?.level === 'warning', 'Expected scheduled cloud status to map to warning level')
    assert(
      banner?.text === 'Planned ClawMax maintenance\n\nPlease save your workspace first.',
      'Expected message and operator note to be combined',
    )
    assert(requestedUrl.includes('/api/runtime/cloud-maintenance-status?instance_key=test7'), `Unexpected status URL: ${requestedUrl}`)
    assert(authHeader === 'Bearer test-token', `Unexpected auth header: ${authHeader}`)
  })

  await test('resolved maintenance banner falls back to env state when cloud request fails', async () => {
    process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = 'https://www.clawmax.ai/api/template-feedback/sink-summary'
    process.env.TEMPLATE_FEEDBACK_TOKEN = 'test-token'
    process.env.CLAWMAX_INSTANCE_KEY = 'test7'

    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as any

    const banner = await getResolvedMaintenanceBanner({
      MAINTENANCE_STATE: 'scheduled',
      MAINTENANCE_MESSAGE: 'Fallback maintenance notice',
      MAINTENANCE_STARTS_AT: '2026-04-23T16:00:00.000Z',
    })

    assert(!!banner, 'Expected fallback env maintenance banner')
    assert(banner?.text === 'Fallback maintenance notice', 'Expected fallback message to be used')
    assert(banner?.startAt === '2026-04-23T16:00:00.000Z', 'Expected fallback startAt to be preserved')
  })

  globalThis.fetch = originalFetch
  if (originalSummaryUrl === undefined) delete process.env.TEMPLATE_FEEDBACK_SUMMARY_URL
  else process.env.TEMPLATE_FEEDBACK_SUMMARY_URL = originalSummaryUrl
  if (originalToken === undefined) delete process.env.TEMPLATE_FEEDBACK_TOKEN
  else process.env.TEMPLATE_FEEDBACK_TOKEN = originalToken
  if (originalPublicUrl === undefined) delete process.env.DASHBOARD_PUBLIC_URL
  else process.env.DASHBOARD_PUBLIC_URL = originalPublicUrl
  if (originalAppUrl === undefined) delete process.env.DASHBOARD_APP_URL
  else process.env.DASHBOARD_APP_URL = originalAppUrl
  if (originalInstanceKey === undefined) delete process.env.CLAWMAX_INSTANCE_KEY
  else process.env.CLAWMAX_INSTANCE_KEY = originalInstanceKey

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

run().catch((err) => {
  globalThis.fetch = originalFetch
  console.error(err)
  process.exit(1)
})
