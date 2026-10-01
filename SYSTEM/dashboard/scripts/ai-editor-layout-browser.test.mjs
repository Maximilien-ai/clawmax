// Isolated component fixture: no model calls or real user state.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.CLAWMAX_TEST_PLAYWRIGHT_PATH || 'playwright')
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-editor-layout-'))
const dashboard = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({ configFile: false, root: path.join(dashboard, 'client'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } })
await server.listen()
let browser
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CLAWMAX_TEST_CHROME_PATH ? { executablePath: process.env.CLAWMAX_TEST_CHROME_PATH } : {}) })
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.route('**/api/**', route => route.fulfill({ json: {} }))
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test-fixtures/ai-editor.html`)
    const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true })
    const direction = page.getByRole('textbox', { name: 'Improvement Direction', exact: true })
    const expand = page.getByRole('button', { name: 'Expand with AI', exact: true })
    const visibleWithoutScroll = async () => {
      for (const locator of [direction, expand, page.getByRole('button', { name: 'Save & Generate', exact: true })]) {
        const box = await locator.boundingBox()
        assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `Action clipped at ${width}x${height}`)
        assert(await locator.evaluate(el => {
          const r = el.getBoundingClientRect()
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
        }), 'Action obscured or inside clipped scroll area')
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    }
    await expand.waitFor()
    await visibleWithoutScroll()
    assert((await prompt.boundingBox()).height <= 180)
    await page.screenshot({ path: path.join(artifacts, `${width}-initial.png`) })
    await direction.fill('concise')
    await expand.click()
    await page.getByText('AI expanded', { exact: true }).waitFor()
    assert.match(await prompt.inputValue(), /Expanded: concise \(markdown\)/)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    assert.match(await page.locator('output').innerText(), /Expanded: concise/)
    await prompt.fill('long editable prompt\n'.repeat(120))
    await page.getByRole('button', { name: 'Show Preview', exact: false }).click()
    await visibleWithoutScroll()
    await direction.fill('fail')
    await expand.click()
    await page.getByRole('alert').waitFor()
    await visibleWithoutScroll()
    await page.screenshot({ path: path.join(artifacts, `${width}-error-preview.png`) })
    await prompt.fill('')
    assert(await expand.isDisabled())
    await visibleWithoutScroll()
    await page.close()
  }
  console.log(`AI editor layout passed: four desktop/mobile sizes, no-scroll actions, expansion/save, long draft/preview, error and empty states. Screenshots: ${artifacts}`)
} finally { await browser?.close(); await server.close() }
