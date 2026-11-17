// Production Review UI with bundled catalog data and intercepted APIs; no live writes.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(import.meta.dirname, '../../..')
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'PLUGINS/public/clawmax-review/clawmax-plugin.json')))
const bundleDir = path.join(root, 'PLUGINS/public/clawmax-review/templates')
const templates = fs.readdirSync(bundleDir).filter(file => file.endsWith('.json')).flatMap(file => {
 const bundle = JSON.parse(fs.readFileSync(path.join(bundleDir, file)))
 return bundle.items.map(item => ({
  id: `${bundle.release}:${item.id}`, pluginId: plugin.slug, objectKind: plugin.objectKind,
  name: item.name, description: item.description, recommended: bundle.recommended !== false,
  tags: [...(bundle.tags || []), ...(item.tags || [])],
  payload: { ...bundle.defaults, name: item.name, description: item.description,
   tags: [...(bundle.tags || []), ...(bundle.defaults.tags || []), ...(item.tags || [])],
   fields: { ...bundle.defaults.fields, ...item.fields, release: bundle.release } },
 }))
})
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5196'
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/private/tmp/clawmax-rc98-review-browser'
fs.mkdirSync(artifacts, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme })
  const page = await context.newPage(); page.setDefaultTimeout(15000)
  const items = [], errors = [], applied = []
  await page.addInitScript(theme => {
   localStorage.setItem('dark-mode', String(theme === 'dark'))
   window.EventSource = class { close() {} }
   for (let v=1;v<=10;v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed')
  }, theme)
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/api/**', async route => {
   const request = route.request(), pathname = new URL(request.url()).pathname
   let json = {}
   if (pathname === '/api/health/live') json = { alive: true }
   else if (pathname === '/api/auth/config') json = { authDisabled: true }
   else if (pathname === '/api/auth/me') json = { authenticated: false }
   else if (pathname === '/api/system') json = { version: '2.0.0-test-rc98', agentCount: 0 }
   else if (pathname === '/api/workspaces') json = { workspaces: [] }
   else if (pathname === '/api/plugins') json = { plugins: [plugin] }
   else if (pathname.endsWith('/context')) json = { context: { agents: [], workflows: [], groups: [], communities: [] } }
   else if (pathname.endsWith('/items')) { assert.equal(request.method(), 'GET'); json = { items } }
   else if (pathname.endsWith('/templates')) json = { templates }
   else if (pathname.endsWith('/apply')) {
    assert.equal(request.method(), 'POST')
    const template = templates.find(t => t.id === decodeURIComponent(pathname.split('/').at(-2)))
    assert(template && template.payload.fields.release === '2.0.0-test-rc98', 'Only current RC98 checks may be initialized')
    const item = { ...template.payload, id: `fixture-${items.length}`, kind: plugin.objectKind, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    items.push(item); applied.push(template.id); json = { item }
   } else assert.equal(request.method(), 'GET', 'Unexpected write outside the synthetic checklist API')
   await route.fulfill({ json })
  })
  await page.goto(`${base}/plugins/plugin-review-notes`)
  const start = page.getByRole('button', { name: 'Start 2.0.0-test-rc98 checklist', exact: true })
  if (!(await start.isVisible())) await page.getByRole('button', { name: /^Suggested/ }).click()
  await start.waitFor()
  assert.equal(await page.getByRole('button', { name: /Start 2.0.0-test-rc96 checklist/ }).count(), 0)
  assert.equal(await page.locator('html').evaluate(el => el.classList.contains('dark')), theme === 'dark')
  await start.click()
  await page.getByText('RC98 — Event task quality', { exact: true }).waitFor()
  await page.getByText('RC98 — Event device and provider', { exact: true }).waitFor()
  assert.equal(applied.length, 2)
  assert(items.every(item => item.fields.outcome === 'pending' && item.fields.completed === false))
  await page.reload()
  await page.getByText('RC98 — Event task quality', { exact: true }).waitFor()
  assert.equal(applied.length, 2, 'Reload must not reinitialize or duplicate the checklist')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: path.join(artifacts, `review-${theme}-${width}.png`), fullPage: true })
  console.log(`PASS ${theme} ${width}px: only two RC98 checks, explicit initialization, pending outcomes, reload persistence, no overflow/errors`)
  await context.close()
 }
} finally { await browser.close() }
