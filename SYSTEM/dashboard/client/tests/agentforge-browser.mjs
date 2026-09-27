// Run against the isolated Vite fixture; no live partner traffic is permitted.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    let connected = false
    let sharing = false
    let failConsent = false
    let consentCalls = 0
    const workspace = { id: 'synthetic', path: '/synthetic', name: 'Synthetic event workspace with a deliberately long name for layout testing' }
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      let payload = {}
      let status = 200
      if (url.pathname === '/api/workspaces') payload = { workspaces: [workspace] }
      else if (url.pathname === '/api/workspaces/active') payload = { workspace }
      else if (url.pathname.endsWith('/status')) payload = { agentforge: { configured: true, connected,
        purpose: 'Synthetic event learning support and progress evidence.', privacyUrl: 'https://synthetic.example/privacy', retentionDays: 30 },
        destinations: sharing ? [{ destinationId: 'agentforge', scopes: ['agent-chat'] }] : [], queuedEvents: sharing ? 2 : 0 }
      else if (url.pathname.endsWith('/agentforge/enrollment')) {
        assert.equal(route.request().postDataJSON().connectionCode, 'MixedCase-Synthetic-Token')
        connected = true
      } else if (url.pathname.endsWith('/consent')) {
        consentCalls++
        if (failConsent) { status = 502; payload = { error: 'Synthetic receiver unavailable. Try again.' } }
        else sharing = route.request().method() === 'POST'
      } else throw new Error(`Unexpected fixture API: ${url.pathname}`)
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    })
    await page.goto('http://127.0.0.1:5188/tests/agentforge.html#agentforge_enrollment=MixedCase-Synthetic-Token')
    await page.getByText('Choose what to share', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).hash, '')
    assert.equal(consentCalls, 0, 'enrollment must not imply consent')
    assert.equal(await page.getByRole('button', { name: 'Enable sharing', exact: true }).isEnabled(), false)
    assert.equal(await page.getByRole('checkbox').evaluateAll(nodes => nodes.some(node => node.checked)), false)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/private/tmp'}/agentforge-${width}-off.png` })
    await page.getByLabel('Agent chat prompts and responses', { exact: true }).check()
    await page.getByLabel('I agree to share these categories with AgentForge for the purpose above.', { exact: true }).check()
    failConsent = true
    await page.getByRole('button', { name: 'Enable sharing', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Synthetic receiver unavailable' }).waitFor()
    failConsent = false
    await page.getByRole('button', { name: 'Enable sharing', exact: true }).click()
    await page.getByRole('button', { name: 'Revoke sharing', exact: true }).waitFor()
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR || '/private/tmp'}/agentforge-${width}-on.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.getByRole('button', { name: 'Revoke sharing', exact: true }).click()
    await page.getByRole('button', { name: 'Enable sharing', exact: true }).waitFor()
    assert.equal(sharing, false)
    assert.deepEqual(failures, [])
    await page.close()
    console.log(`AgentForge ${width}px: enrollment, default-off, explicit consent, failure, status, revoke, layout passed`)
  }
} finally { await browser.close() }
