// Synthetic frontend regression: no workflow, Agent, or credential execution.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
try {
  for (const width of [1440, 390]) {
    for (const metering of [{ byAgent: [] }, { enabled: false }, { error: 'Unavailable' }]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      let reads = 0
      await page.addInitScript(() => {
        window.EventSource = class { close() {} }
        for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
      })
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname
        let json = {}, status = 200
        if (path === '/api/auth/config') json = { authDisabled: true }
        else if (path === '/api/auth/me') json = { authenticated: false }
        else if (path === '/api/system') json = { version: 'fixture', agentCount: 0, onlineCount: 0 }
        else if (path === '/api/workspaces') json = { workspaces: [] }
        else if (path === '/api/plugins') json = { plugins: [] }
        else if (path === '/api/workflows') json = { workflows: [] }
        else if (path === '/api/metering') { reads++; json = metering; status = metering.error ? 503 : 200 }
        else if (path.includes('/agents') || path.includes('/notifications') || path.includes('/groups') || path.includes('/communities')) json = []
        await route.fulfill({ status, json })
      })
      const meteringResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/metering')
      await page.goto(`${base}/workflows`)
      await page.getByRole('heading', { name: 'Workflows', exact: true }).waitFor()
      await meteringResponse
      const initialReads = reads
      assert.ok(initialReads > 0, 'Workflows should load metering')
      // Deliberate observation window: detect effects that spin after a response.
      await new Promise(resolve => setTimeout(resolve, 1500))
      assert.equal(reads, initialReads, 'A metering result must not trigger another metering request')
      assert.ok(reads <= 2, 'At most React StrictMode mount reads are permitted')
      console.log(`PASS ${width}px ${JSON.stringify(metering)}: ${reads} bounded metering reads`)
      await page.close()
    }
  }
} finally { await browser.close() }
