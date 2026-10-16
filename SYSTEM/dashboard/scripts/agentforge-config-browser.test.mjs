// Real Dashboard wizard, synthetic API persistence only. Never contacts a receiver.
import assert from 'node:assert/strict'
import fs from 'node:fs'
const partner = JSON.parse(fs.readFileSync(new URL('../../../PARTNERS/agentforge/partner.json', import.meta.url)))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5174'
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.setDefaultTimeout(10000)
    let config = { enabledPartners: ['agentforge'], partners: {} }
    let saves = 0
    let consentCalls = 0
    let failSave = false
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let i = 1; i <= 10; i++) localStorage.setItem(`clawmax-workspace-tour:disable:v${i}`, 'dismissed')
    })
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      let json = {}
      if (pathname === '/api/auth/config') json = { authDisabled: true }
      else if (pathname === '/api/auth/me') json = { authenticated: false }
      else if (pathname === '/api/system') json = { version: '2.0-parity-fixture' }
      else if (pathname === '/api/workspaces') json = { workspaces: [] }
      else if (pathname === '/api/plugins') json = { plugins: [] }
      else if (pathname === '/api/integrations/status') json = { visiblePartners: ['agentforge'], partnerDefinitions: [partner] }
      else if (pathname === '/api/integrations/config') {
        if (route.request().method() === 'PUT') {
          if (failSave) { await route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } }); return }
          config = route.request().postDataJSON(); saves++
        }
        json = { config, secretPresence: {} }
      } else if (pathname === '/api/activity-export/status') json = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
      else if (pathname === '/api/activity-export/consent') { consentCalls++; throw new Error('Configuration must never grant consent') }
      await route.fulfill({ json })
    })
    await page.goto(`${base}/builder`)
    const openPartner = async () => {
      await page.getByRole('button', { name: 'Search ClawMax' }).click()
      const search = page.getByRole('dialog', { name: 'Search ClawMax' })
      await search.getByRole('combobox').fill('AgentForge')
      await search.getByRole('option', { name: /NYU - AgentForge/ }).click()
      await page.getByText('NYU - AgentForge status', { exact: true }).waitFor()
    }
    await openPartner()
    const api = page.getByLabel('AgentForge API base URL', { exact: true })
    const privacy = page.getByLabel('AgentForge privacy URL', { exact: true })
    await api.fill('https://synthetic.example/api')
    await privacy.fill('https://synthetic.example/privacy')
    await page.getByRole('button', { name: 'Save & Close', exact: true }).click()
    await page.getByText('NYU - AgentForge status', { exact: true }).waitFor({ state: 'hidden' })
    assert.equal(saves, 1)
    assert.equal(config.partners.agentforge.apiUrl, 'https://synthetic.example/api')
    await page.reload()
    await openPartner()
    assert.equal(await api.inputValue(), 'https://synthetic.example/api')
    assert.equal(await privacy.inputValue(), 'https://synthetic.example/privacy')
    assert.equal(await page.getByRole('button', { name: 'Activity Export status', exact: true }).count(), 0)
    failSave = true
    await page.getByRole('button', { name: 'Save & Close', exact: true }).click()
    await page.getByText('Workspace integration settings could not be saved. Your edits remain open; retry when the server is available.', { exact: true }).waitFor()
    await page.getByText('NYU - AgentForge status', { exact: true }).waitFor()
    assert.equal(saves, 1)
    assert.equal(consentCalls, 0)
    assert.deepEqual(errors, [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `/private/tmp/agentforge-config-${width}.png` })
    await page.close()
    console.log(`PASS ${width}px: AgentForge edit/save/reload/persistence/failure/default-off`)
  }
} finally { await browser.close() }
