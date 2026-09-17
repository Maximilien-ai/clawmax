// Run against a local Vite frontend. All API traffic is fulfilled with synthetic
// data; no provider keys, user profiles, or running instance settings are used.
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  })
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const page = await browser.newPage({ viewport })
      page.setDefaultTimeout(10000)
      page.on('pageerror', error => console.error('Synthetic page error:', error.message))
      let savedConfig = {}
      let saves = 0
      let finishValidation
      let signalValidationStarted
      const validationStarted = new Promise(resolve => { signalValidationStarted = resolve })
      const workspace = { id: 'byok-layout-qa', name: 'Layout QA', path: '/qa', createdAt: '2026-09-17', lastAccessedAt: '2026-09-17' }
      await page.route('**/api/**', async (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        let data = {}
        if (path === '/api/auth/config') data = { authDisabled: true, githubEnabled: false }
        if (path === '/api/auth/me') data = { authenticated: true, user: { id: 'qa', login: 'qa', name: 'QA' } }
        if (path === '/api/workspaces') data = { workspaces: [workspace] }
        if (path === '/api/workspaces/active') data = { workspace }
        if (path === '/api/agents') data = { agents: [{ id: 'qa-agent', name: 'QA Agent' }] }
        if (path === '/api/integrations/config') {
          if (request.method() === 'PUT') { savedConfig = request.postDataJSON(); saves++ }
          data = { config: savedConfig }
        }
        if (path === '/api/integrations/status') data = { validationAvailable: true, providers: [], visiblePartners: [], partnerDefinitions: [] }
        if (path === '/api/integrations/runtimes') data = { runtimes: [], enabledRuntimes: [] }
        if (path === '/api/integrations/validate') {
          await new Promise(resolve => { finishValidation = resolve; signalValidationStarted() })
          return route.fulfill({ status: 503, json: { error: 'Synthetic validation unavailable' } })
        }
        if (!['GET', 'HEAD'].includes(request.method()) && path !== '/api/integrations/config') return route.fulfill({ status: 403, json: { error: 'Unexpected write blocked by layout QA' } })
        return route.fulfill({ json: data })
      })
      await page.goto(process.env.BYOK_TEST_URL || 'http://127.0.0.1:5176/agents')
      // Use the same event as the visible BYOK entry point, including on mobile
      // where the app header may be collapsed. No application state is injected.
      await page.getByRole('button', { name: 'BYOK', exact: true }).waitFor({ state: 'attached' })
      const dismissTour = page.getByRole('button', { name: "Don't show again", exact: true })
      await dismissTour.waitFor()
      await dismissTour.click()
      await page.evaluate(() => window.dispatchEvent(new Event('open-byok-wizard')))
      const dialog = page.getByRole('dialog', { name: 'Models & Partner Integrations', exact: true })
      await dialog.waitFor()
      const snapshot = await dialog.ariaSnapshot()
      assert(snapshot.includes('Save & Close'))
      const save = dialog.getByRole('button', { name: 'Save & Close', exact: true })
      async function checkBounds(label) {
        const box = await save.boundingBox()
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${label}: Save must fit the viewport`)
        await save.click({ trial: true })
        assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `${label}: no horizontal overflow`)
      }
      await checkBounds('initial')
      const body = dialog.locator('.overflow-y-auto')
      const start = await save.boundingBox()
      await body.evaluate(el => { el.scrollTop = el.scrollHeight })
      await checkBounds('scrolled')
      assert.deepEqual(await save.boundingBox(), start, 'Save must not move when settings scroll')
      await body.evaluate(el => { el.scrollTop = 0 })
      const key = dialog.getByLabel('API key', { exact: true })
      // Fake value is deliberately not a provider credential.
      await key.fill('sk-layout-fixture-not-a-real-key')
      await dialog.getByRole('button', { name: 'Check Key', exact: true }).click()
      await dialog.getByRole('button', { name: 'Checking…', exact: true }).waitFor()
      assert(await save.isDisabled(), 'Save remains disabled during validation')
      await validationStarted
      finishValidation()
      await dialog.getByRole('button', { name: 'Check Key', exact: true }).waitFor()
      await checkBounds('validation-error')
      if (process.env.BYOK_SCREENSHOT_DIR) {
        await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/byok-${viewport.width}.png` })
        await page.evaluate(() => document.documentElement.classList.add('dark'))
        await checkBounds('dark-mode')
        await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/byok-dark-${viewport.width}.png` })
        await page.evaluate(() => document.documentElement.classList.remove('dark'))
      }
      await save.click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(saves, 1, 'Save should use the existing persistence handler once')
      await page.reload()
      await page.getByRole('button', { name: 'BYOK', exact: true }).waitFor({ state: 'attached' })
      await page.evaluate(() => window.dispatchEvent(new Event('open-byok-wizard')))
      await dialog.waitFor()
      assert.equal(await key.inputValue(), 'sk-layout-fixture-not-a-real-key', 'synthetic browser key should survive save/reload')
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      for (const event of ['open-partners-wizard', 'open-runtime-wizard']) {
        await page.evaluate(name => window.dispatchEvent(new Event(name)), event)
        const active = page.getByRole('dialog')
        await active.waitFor()
        assert((await active.ariaSnapshot()).includes('Save & Close'))
        const box = await active.getByRole('button', { name: 'Save & Close', exact: true }).boundingBox()
        assert(box && box.y >= 0 && box.y + box.height <= viewport.height, `${event}: Save fits`)
        await active.getByRole('button', { name: 'Close', exact: true }).click()
      }
      console.log(`${viewport.width}x${viewport.height}: layout, scroll, validation-error, save/reload, Partners/Runtime passed`)
      await page.close()
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
