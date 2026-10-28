// Synthetic API only: verify startup recovery and a usable retry state at both widths.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.clock.install()
    let ready = false
    let appRequests = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/api/health/live') return route.fulfill({ status: ready ? 200 : 502, json: { alive: ready } })
      appRequests++
      const json = path === '/api/auth/config' ? { authDisabled: true } : path === '/api/workspaces' ? { workspaces: [] } : path === '/api/plugins' ? { plugins: [] } : {}
      await route.fulfill({ json })
    })
    await page.goto(process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5183')
    await page.getByRole('status').filter({ hasText: 'Connecting' }).waitFor()
    assert.equal(appRequests, 0, 'app requests wait for the API')
    await page.clock.fastForward(121000)
    await page.getByRole('alert').waitFor()
    const retry = page.getByRole('button', { name: 'Try again', exact: true })
    const bounds = await retry.boundingBox()
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 900)
    await page.screenshot({ path: `/private/tmp/rc95-readiness-${width}.png` })
    ready = true
    await retry.click()
    await page.getByRole('alert').waitFor({ state: 'detached' })
    await page.waitForFunction(() => !!document.querySelector('main'))
    assert(appRequests > 0, 'retry mounts the app after recovery')
    console.log(`PASS ${width}px startup waiting, bounded failure, retry and recovery`)
    await page.close()
  }
} finally { await browser.close() }
