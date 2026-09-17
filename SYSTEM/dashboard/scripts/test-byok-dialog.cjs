// Run against a local Vite frontend. All API traffic is fulfilled with synthetic
// data; no provider keys, user profiles, or running instance settings are used.
// PLAYWRIGHT_MODULE can point to an existing Playwright installation.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function main() {
  const deploymentKind = process.env.BYOK_TEST_DEPLOYMENT_KIND || 'local'
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
        if (path === '/api/auth/config') data = { authDisabled: true, githubEnabled: false, deploymentKind, ollamaEnabled: deploymentKind !== 'cloud', defaultOllamaBaseUrl: deploymentKind === 'cloud' ? '' : 'http://host.containers.internal:11434', defaultOpenAiCompatibleBaseUrl: deploymentKind === 'cloud' ? '' : 'http://host.containers.internal:1234/v1' }
        if (path === '/api/auth/me') data = { authenticated: true, user: { id: 'qa', login: 'qa', name: 'QA' } }
        if (path === '/api/workspaces') data = { workspaces: [workspace] }
        if (path === '/api/workspaces/active') data = { workspace }
        if (path === '/api/agents') data = { agents: [{ id: 'qa-agent', name: 'QA Agent' }] }
        if (path === '/api/integrations/config') {
          if (request.method() === 'PUT') { savedConfig = request.postDataJSON(); saves++ }
          data = { config: savedConfig }
        }
        if (path === '/api/integrations/status') data = { validationAvailable: true, providers: [], visiblePartners: [], partnerDefinitions: [] }
        // Even a stale API response advertising an installed CLI must not make
        // the cloud BYOK panel expose local-runtime choices.
        if (path === '/api/integrations/runtimes') data = { runtimes: [{ id: 'claude', label: 'Claude Code', installed: true }], enabledRuntimes: [] }
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
      if (deploymentKind === 'cloud') {
        assert(snapshot.includes('Cloud instances cannot access models or CLI tools on your computer.'))
        assert(!snapshot.includes('Run via CLI') && !snapshot.includes('Ollama') && !snapshot.includes('Claude Code'))
        assert(snapshot.includes('Cloud-reachable services'))
      } else {
        assert(snapshot.includes('Run via CLI') && snapshot.includes('Ollama') && snapshot.includes('Claude Code'))
      }
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
      if (deploymentKind === 'cloud') {
        const compatible = dialog.getByRole('button', { name: 'OpenAI-Compatible', exact: false })
        assert.equal(await compatible.count(), 1)
        await compatible.click()
        const baseUrl = dialog.getByLabel('Base URL', { exact: true })
        assert.equal(await baseUrl.inputValue(), '', 'Cloud must not prefill localhost')
        await baseUrl.fill('http://localhost:1234/v1')
        await save.click()
        assert.equal(saves, 0, 'Invalid local endpoint must not be persisted on cloud')
        assert(await dialog.isVisible(), 'Rejected save must keep the dialog open')
        assert((await dialog.ariaSnapshot()).includes('Enter a cloud-reachable service URL.'))
        await checkBounds('cloud-endpoint-error')
        await baseUrl.fill('https://models.example.com/v1')
      }
      if (process.env.BYOK_SCREENSHOT_DIR) {
        await page.getByRole('status').evaluateAll(nodes => Promise.all(nodes.flatMap(node => node.getAnimations({ subtree: true })).map(animation => animation.finished.catch(() => {}))))
        await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/byok-${deploymentKind}-${viewport.width}.png` })
        await page.evaluate(() => document.documentElement.classList.add('dark'))
        await checkBounds('dark-mode')
        await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/byok-${deploymentKind}-dark-${viewport.width}.png` })
        await page.evaluate(() => document.documentElement.classList.remove('dark'))
      }
      await save.click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(saves, 1, 'Save should use the existing persistence handler once')
      if (deploymentKind === 'cloud') {
        assert.equal(savedConfig.openaiCompatibleBaseUrl, 'https://models.example.com/v1')
        assert.equal(savedConfig.agentRuntime, 'openclaw')
        assert.deepEqual(savedConfig.enabledRuntimes, [])
      }
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
        if (event === 'open-runtime-wizard') {
          const runtimeSnapshot = await active.ariaSnapshot()
          assert.equal(runtimeSnapshot.includes('checkbox "Claude Code'), deploymentKind !== 'cloud')
          if (deploymentKind === 'cloud') assert(runtimeSnapshot.includes('Cloud instances cannot access models or CLI tools on your computer.'))
        }
        const box = await active.getByRole('button', { name: 'Save & Close', exact: true }).boundingBox()
        assert(box && box.y >= 0 && box.y + box.height <= viewport.height, `${event}: Save fits`)
        await active.getByRole('button', { name: 'Close', exact: true }).click()
      }
      await page.getByRole('button', { name: 'Create ▾', exact: true }).click()
      assert((await page.locator('main').ariaSnapshot()).includes('Create with Wizard'))
      await page.getByRole('button', { name: 'Create with Wizard Create with Wizard', exact: true }).click()
      const executionCopy = deploymentKind === 'cloud' ? 'Cloud agents use model-provider API keys. Local models and CLI tools on your computer are unavailable.' : 'Enable a CLI runtime in BYOK → “Run via CLI” to run agents without provider keys.'
      await page.getByText(executionCopy, { exact: true }).waitFor()
      if (process.env.BYOK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/agent-wizard-${deploymentKind}-${viewport.width}.png` })
      await page.getByRole('button', { name: '×', exact: true }).click()
      await page.getByRole('button', { name: '▶ Additional agents (1)', exact: true }).click()
      await page.getByRole('button', { name: 'More actions', exact: true }).click()
      // The agent action menu is portaled outside <main>.
      const actionSnapshot = await page.locator('body').ariaSnapshot()
      assert(actionSnapshot.includes('button "Edit Edit"'))
      await page.getByRole('button', { name: 'Edit Edit', exact: true }).click()
      const editorCopy = deploymentKind === 'cloud' ? 'Local CLI runtimes are unavailable on cloud. Choose OpenClaw with model-provider keys.' : 'Enable a CLI runtime first in BYOK → “Run via CLI” to make it selectable here.'
      await page.getByText(editorCopy, { exact: true }).waitFor()
      await page.getByText(editorCopy, { exact: true }).scrollIntoViewIfNeeded()
      if (process.env.BYOK_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BYOK_SCREENSHOT_DIR}/agent-editor-${deploymentKind}-${viewport.width}.png` })
      console.log(`${deploymentKind} ${viewport.width}x${viewport.height}: layout, availability, validation-error, save/reload, Partners/Runtime passed`)
      await page.close()
    }
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
