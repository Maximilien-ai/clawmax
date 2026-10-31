// #377: real dialog/providers, synthetic API; no live workspace or paid calls.
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dashboard = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-budget-browser-'))
const server = await createServer({ configFile: false, root: path.join(dashboard, 'client'), plugins: [react()], server: { host: '127.0.0.1', port: 0 } })
await server.listen()
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } }); page.setDefaultTimeout(5000)
  const workspace = { id: 'budget-test', name: 'Before', path: '/tmp/synthetic-budget', tags: [], color: '#3B82F6' }
  let config = { limitUsd: 42, enforced: false }, mode = 'load-error', writes = 0
  await page.route('**/api/**', async route => {
   const req = route.request(), url = new URL(req.url())
   if (url.pathname === '/api/budget') {
    assert.equal(url.searchParams.get('workspaceId'), workspace.id)
    if (req.method() === 'PUT') {
     writes++
     if (mode === 'save-error') return route.fulfill({ status: 503, json: { error: 'Budget unavailable' } })
     const body = req.postDataJSON(); config = { limitUsd: body.limitUsd, enforced: body.enforced }
     return route.fulfill({ json: { config } })
    }
    if (mode === 'load-error') return route.fulfill({ status: 503, body: '<html>Unavailable</html>' })
    if (mode === 'malformed') return route.fulfill({ json: { config: { limitUsd: 'oops' } } })
    return route.fulfill({ json: { config, currentSpendUsd: 1, usedPct: 2, level: 'ok' } })
   }
   if (req.method() === 'PATCH') Object.assign(workspace, req.postDataJSON())
   return route.fulfill({ json: { workspaces: [workspace], workspace } })
  })
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test-fixtures/workspace-budget.html`)
  const open = () => page.getByRole('button', { name: 'Edit test workspace' }).click()
  const save = () => page.getByRole('button', { name: 'Update Workspace', exact: true }).click()
  const closed = () => page.getByRole('heading', { name: 'Edit Workspace' }).waitFor({ state: 'hidden' })
  await open(); await page.getByRole('button', { name: 'Retry budget settings' }).waitFor()
  assert.equal(await page.getByLabel('Cost Budget (USD)').count(), 0)
  await page.screenshot({ path: path.join(artifacts, `${width}-load-error.png`) })
  await page.getByLabel('Workspace Name *').fill('Renamed'); await save(); await closed()
  assert.deepEqual(config, { limitUsd: 42, enforced: false }); assert.equal(writes, 0)
  await open(); await page.getByRole('button', { name: 'Retry budget settings' }).waitFor(); mode = 'ready'
  await page.getByRole('button', { name: 'Retry budget settings' }).click(); await page.getByLabel('Cost Budget (USD)').waitFor()
  assert.equal(await page.getByLabel('Cost Budget (USD)').inputValue(), '42')
  await page.getByLabel('Cost Budget (USD)').fill('0'); mode = 'save-error'; await save()
  await page.getByText('Budget unavailable', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Cost Budget (USD)').inputValue(), '0')
  mode = 'ready'; await save(); await closed(); assert.deepEqual(config, { limitUsd: 0, enforced: false })
  await page.reload(); await open(); await page.getByLabel('Cost Budget (USD)').waitFor()
  assert.equal(await page.getByLabel('Cost Budget (USD)').inputValue(), '0')
  const oldWrites = writes; await page.getByLabel('Workspace Name *').fill('Metadata only'); await save(); await closed(); assert.equal(writes, oldWrites)
  mode = 'malformed'; await open(); await page.getByRole('button', { name: 'Retry budget settings' }).waitFor()
  mode = 'ready'; await page.getByRole('button', { name: 'Retry budget settings' }).click(); await page.getByLabel('Cost Budget (USD)').waitFor()
  await page.screenshot({ path: path.join(artifacts, `${width}-ready.png`) })
  await page.getByRole('button', { name: 'Update Workspace' }).scrollIntoViewIfNeeded()
  const box = await page.getByRole('button', { name: 'Update Workspace' }).boundingBox()
  assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844)
  await page.close()
  const creation = await browser.newPage({ viewport: { width, height: 844 } })
  creation.setDefaultTimeout(5000)
  let creates = 0, budgetWrites = 0, failBudget = true, conflict = false
  let createdConfig = { limitUsd: 10, enforced: true }
  const created = { ...workspace, id: 'new-workspace', name: 'New' }
  await creation.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname === '/api/workspaces' && req.method() === 'POST') {
      creates++
      const body = req.postDataJSON()
      if (conflict && body.mode === 'create') return route.fulfill({ status: 409, json: { error: 'Path exists', code: 'WORKSPACE_PATH_CONFLICT', conflict: { path: '/tmp/existing', canOverwrite: true, canAdopt: true } } })
      return route.fulfill({ json: { workspace: created } })
    }
    if (url.pathname === '/api/budget' && req.method() === 'PUT') {
      budgetWrites++
      assert.equal(url.searchParams.get('workspaceId'), created.id)
      const body = req.postDataJSON(); assert.equal(body.workspaceId, created.id)
      if (failBudget) return route.fulfill({ status: 503, body: '<html>Unavailable</html>' })
      createdConfig = { limitUsd: body.limitUsd, enforced: body.enforced }
      return route.fulfill({ json: { config: createdConfig } })
    }
    if (url.pathname === '/api/budget') return route.fulfill({ json: { enabled: true, config: createdConfig } })
    return route.fulfill({ json: { workspaces: [workspace], workspace } })
  })
  await creation.goto(`http://127.0.0.1:${server.httpServer.address().port}/test-fixtures/workspace-budget.html`)
  const newDialog = async () => {
    await creation.getByRole('button', { name: 'New test workspace' }).click()
    await creation.getByLabel('Workspace Name *').fill('New')
  }
  await newDialog()
  await creation.getByLabel('Cost Budget (USD)').fill('0')
  await creation.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await creation.getByRole('alert').waitFor()
  assert.equal(creates, 1); assert.equal(budgetWrites, 1)
  assert.equal(await creation.getByText('Workspace "New" is ready', { exact: true }).count(), 0)
  assert.equal(await creation.getByLabel('Cost Budget (USD)').inputValue(), '0')
  assert.equal(await creation.getByLabel('Workspace Name *').isEnabled(), false)
  await creation.screenshot({ path: path.join(artifacts, `${width}-partial-create.png`) })
  failBudget = false
  await creation.getByRole('button', { name: 'Retry budget save' }).click()
  await creation.getByRole('heading', { name: 'Create New Workspace' }).waitFor({ state: 'hidden' })
  assert.equal(creates, 1); assert.deepEqual(createdConfig, { limitUsd: 0, enforced: true })
  await creation.reload(); await newDialog(); conflict = true; failBudget = true
  await creation.getByLabel('Cost Budget (USD)').fill('123')
  await creation.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await creation.getByRole('button', { name: 'Overwrite', exact: true }).click()
  await creation.getByRole('button', { name: 'Retry budget save' }).waitFor()
  assert.equal(creates, 3)
  failBudget = false
  await creation.getByRole('button', { name: 'Retry budget save' }).click()
  await creation.getByRole('heading', { name: 'Create New Workspace' }).waitFor({ state: 'hidden' })
  assert.equal(creates, 3); assert.equal(createdConfig.limitUsd, 123)
  await newDialog(); const previousWrites = budgetWrites
  await creation.getByRole('button', { name: 'Create Workspace', exact: true }).click()
  await creation.getByRole('button', { name: 'Use Existing', exact: true }).click()
  await creation.getByRole('heading', { name: 'Create New Workspace' }).waitFor({ state: 'hidden' })
  assert.equal(budgetWrites, previousWrites); assert.equal(createdConfig.limitUsd, 123)
  await creation.close()
 }
 console.log(`PASS desktop/mobile: failed/malformed load, metadata preserves budget, retry, zero, failed save retains draft, reload persistence, unchanged budget not rewritten; creation/overwrite zero and partial-save retry without duplicates; adoption preserves budget. Screenshots: ${artifacts}`)
} finally { await browser.close(); await server.close() }
