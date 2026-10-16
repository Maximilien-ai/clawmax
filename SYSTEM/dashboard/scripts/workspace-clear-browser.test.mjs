// Opt-in browser test. Uses only mocked API responses, never a real workspace.
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.CLAWMAX_TEST_PLAYWRIGHT_PATH || 'playwright')
const dashboard = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-clear-browser-'))
const server = await createServer({ configFile: false, root: path.join(dashboard, 'client'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const port = server.httpServer.address().port
const browser = await chromium.launch({ headless: true, ...(process.env.CLAWMAX_TEST_CHROME_PATH ? { executablePath: process.env.CLAWMAX_TEST_CHROME_PATH } : {}) })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    let clears = 0, mode = 'success'
    await page.route('**/api/**', async route => {
      if (route.request().url().endsWith('/clear/preview')) {
        return route.fulfill({ json: { token: 'synthetic-token', counts: { 'Agent files and history': 42, 'Workflow definitions, history and outputs': 50, 'Other workspace files and settings': 80 }, agentCount: 3, resume: false, lastOutcome: null } })
      }
      assert(route.request().url().endsWith('/default/clear'))
      assert.deepEqual(route.request().postDataJSON(), { token: 'synthetic-token', confirmation: 'CLEAR PERSONAL', acknowledged: true })
      clears++
      return route.fulfill(mode === 'success' ? { json: { ok: true, operationId: 'fixture' } } : { status: 503, body: '<html>Unavailable</html>', contentType: 'text/html' })
    })
    await page.goto(`http://127.0.0.1:${port}/test-fixtures/workspace-clear.html`)
    await page.getByRole('button', { name: 'Clear Personal workspace', exact: true }).click()
    await page.getByRole('button', { name: 'I understand — continue' }).waitFor()
    await page.getByText('3 agent(s) affected', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(artifacts, `${width}-review.png`) })
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(clears, 0)
    await page.getByRole('button', { name: 'Clear Personal workspace', exact: true }).click()
    await page.getByRole('button', { name: 'I understand — continue' }).click()
    const erase = page.getByRole('button', { name: 'Permanently clear Personal' })
    assert.equal(await erase.isEnabled(), false)
    await page.getByLabel('Final confirmation: type CLEAR PERSONAL').fill('wrong')
    assert.equal(await erase.isEnabled(), false)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(clears, 0)
    await page.getByRole('button', { name: 'Clear Personal workspace', exact: true }).click()
    await page.getByRole('button', { name: 'I understand — continue' }).click()
    await page.getByLabel('Final confirmation: type CLEAR PERSONAL').fill('CLEAR PERSONAL')
    await page.screenshot({ path: path.join(artifacts, `${width}-confirm.png`) })
    const box = await erase.boundingBox()
    assert(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 844)
    await erase.click()
    await page.getByRole('heading', { name: 'Personal cleared' }).waitFor()
    assert.equal(clears, 1)
    await page.reload()
    mode = 'error'
    await page.getByRole('button', { name: 'Clear Personal workspace', exact: true }).click()
    await page.getByRole('button', { name: 'I understand — continue' }).click()
    await page.getByLabel('Final confirmation: type CLEAR PERSONAL').fill('CLEAR PERSONAL')
    await page.getByRole('button', { name: 'Permanently clear Personal' }).click()
    await page.getByRole('alert').waitFor()
    assert.match(await page.getByRole('alert').innerText(), /unavailable/)
    await page.screenshot({ path: path.join(artifacts, `${width}-error.png`) })
    await page.close()
  }
  console.log(`Desktop/mobile clear dialog passed: both cancellations, typed confirmation, success, non-JSON failure, visible actions. Screenshots: ${artifacts}`)
} finally { await browser.close(); await server.close() }
