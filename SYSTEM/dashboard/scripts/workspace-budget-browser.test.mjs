// Real dialogs/context with synthetic API only: never creates or overwrites disk data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5188'
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-budget-browser-'))
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    page.on('pageerror', error => console.error('Browser page error:', error.stack))
    page.setDefaultTimeout(12000)
    const personal = { id: 'default', name: 'Personal', path: '/synthetic/personal', createdAt: '', lastAccessedAt: '' }
    const workspaces = [personal]
    const budgets = new Map([['default', { limitUsd: 42, enforced: false }]])
    const posts = [], puts = [], patches = []
    let readMode = 'ok', writeMode = 'ok', conflict = false, featureEnabled = true, patchFailure = false
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let v = 1; v <= 10; v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed')
      localStorage.setItem('clawmax-onboarding-auto-opened:default', 'true')
    })
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), pathname = url.pathname, method = request.method()
      let json = {}
      if (pathname === '/api/health/live') json = { alive: true }
      else if (pathname === '/api/auth/config') json = { authDisabled: true }
      else if (pathname === '/api/auth/me') json = { authenticated: false }
      else if (pathname === '/api/system') json = { version: 'budget-fixture', agentCount: 0, onlineCount: 0 }
      else if (pathname === '/api/plugins') json = { plugins: [] }
      else if (pathname === '/api/activity-export/status') json = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
      else if (pathname === '/api/templates') json = { agents: [], organizations: [], workflows: [] }
      else if (pathname === '/api/templates/feedback/summary') json = { summaries: {} }
      else if (pathname === '/api/workspaces/active') json = { workspace: personal }
      else if (pathname === '/api/workspaces' && method === 'GET') json = { workspaces }
      else if (pathname === '/api/workspaces' && method === 'POST') {
        const body = request.postDataJSON()
        posts.push(body)
        assert(!('notifySuccess' in body), 'UI toast option must not reach server')
        if (conflict && !body.mode) return route.fulfill({ status: 409, json: { error: 'Path exists', code: 'WORKSPACE_PATH_CONFLICT', conflict: { canOverwrite: true } } })
        const workspace = { ...personal, ...body, id: `created-${posts.length}` }
        workspaces.push(workspace)
        budgets.set(workspace.id, { limitUsd: 10, enforced: true })
        json = { workspace }
      } else if (pathname === '/api/budget') {
        const id = url.searchParams.get('workspaceId')
        if (method === 'PUT') {
          const body = request.postDataJSON()
          puts.push(body)
          assert.equal(body.workspaceId, id)
          if (writeMode === 'transport') return route.abort('failed')
          if (writeMode === 'fail') return route.fulfill({ status: 503, json: { error: 'Synthetic budget failure' } })
          budgets.set(id, { limitUsd: body.limitUsd, enforced: body.enforced })
          json = { ok: true }
        } else {
          if (readMode === 'fail') return route.fulfill({ status: 503, json: { error: 'Synthetic read failure' } })
          if (readMode === 'malformed') return route.fulfill({ json: { config: {} } })
          if (readMode === 'transport') return route.abort('failed')
          json = featureEnabled ? { enabled: true, config: budgets.get(id) || { limitUsd: 10, enforced: true }, currentSpendUsd: 0, usedPct: 0, level: 'ok' } : { enabled: false }
        }
      } else if (pathname.startsWith('/api/workspaces/') && method === 'PATCH') {
        patches.push(request.postDataJSON())
        if (patchFailure) return route.fulfill({ status: 503, json: { error: 'Synthetic metadata failure' } })
        Object.assign(workspaces.find(w => w.id === pathname.split('/').pop()), request.postDataJSON())
      } else if (/agents|skills|workflows|notifications|groups|communities/.test(pathname)) json = []
      await route.fulfill({ json })
    })
    await page.goto(`${base}/templates`)
    const switcher = () => page.locator('button[title]').filter({ hasText: personal.name }).first()
    const dismissOnboarding = async () => {
      const heading = page.getByRole('heading', { name: 'Get this workspace running' })
      if (await heading.isVisible()) await heading.locator('../..').getByRole('button', { name: '✕', exact: true }).click()
    }
    try { await switcher().waitFor() } catch (error) {
      console.error('Initial page:', (await page.locator('body').innerText()).slice(0, 1200))
      throw error
    }
    await dismissOnboarding()
    const create = async name => {
      await switcher().click()
      await page.getByRole('button', { name: 'Create New Workspace', exact: true }).click()
      await page.getByRole('dialog').getByLabel('Workspace Name *', { exact: true }).fill(name)
    }
    const edit = async () => {
      await switcher().click()
      await page.getByTitle('Edit workspace', { exact: true }).first().click()
      await page.getByRole('dialog', { name: 'Edit Workspace', exact: true }).waitFor()
    }
    const dialog = () => page.getByRole('dialog')
    const budget = () => dialog().getByLabel('Cost Budget (USD)', { exact: true })
    const submit = () => dialog().getByRole('button', { name: 'Update Workspace', exact: true })
    const visibleFooter = async name => {
      const box = await dialog().getByRole('button', { name, exact: true }).boundingBox()
      assert(box && box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= 844)
    }

    await create('Zero workspace')
    await budget().fill('0')
    await dialog().getByLabel('Enforce limit').uncheck()
    writeMode = 'fail'
    await dialog().getByRole('button', { name: 'Create Workspace', exact: true }).click()
    await dialog().getByRole('alert').waitFor()
    assert.match(await dialog().getByRole('alert').innerText(), /was created, but its budget was not saved/)
    assert.equal(await budget().inputValue(), '0')
    assert(await dialog().getByLabel('Workspace Name *', { exact: true }).isDisabled())
    assert.equal(await page.getByText('Workspace "Zero workspace" created successfully', { exact: true }).count(), 0)
    const createdCount = posts.length
    await visibleFooter('Retry Budget Save')
    await page.screenshot({ path: path.join(artifacts, `${width}-create-error.png`) })
    writeMode = 'ok'
    await dialog().getByRole('button', { name: 'Retry Budget Save', exact: true }).click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(posts.length, createdCount, 'retry must not create another workspace')
    assert.deepEqual(budgets.get('created-1'), { limitUsd: 0, enforced: false })

    // Overwrite has the same zero-preserving checked-save/retry contract.
    conflict = true
    await create('Overwrite workspace')
    await budget().fill('0')
    await dialog().getByRole('button', { name: 'Create Workspace', exact: true }).click()
    writeMode = 'transport'
    await dialog().getByRole('button', { name: /Overwrite/ }).click()
    await dialog().getByRole('alert').waitFor()
    assert.equal(posts.at(-1).mode, 'overwrite')
    const overwriteCount = posts.length
    writeMode = 'ok'
    await dialog().getByRole('button', { name: 'Retry Budget Save', exact: true }).click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(posts.length, overwriteCount)
    assert.equal(puts.at(-1).limitUsd, 0)
    conflict = false

    // A failed read allows metadata-only save without ever writing defaults.
    readMode = 'fail'
    await edit()
    await dialog().getByRole('alert').waitFor()
    assert.equal(await budget().count(), 0)
    const beforeWrites = puts.length
    await dialog().getByLabel('Workspace Name *', { exact: true }).fill('Renamed Personal')
    await visibleFooter('Update Workspace')
    await page.screenshot({ path: path.join(artifacts, `${width}-edit-read-error.png`) })
    await submit().click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(puts.length, beforeWrites)
    assert.deepEqual(budgets.get('default'), { limitUsd: 42, enforced: false })
    assert.equal(patches.at(-1).name, 'Renamed Personal')

    // Malformed/transport reads are visible; retry does not discard metadata draft.
    for (const failure of ['malformed', 'transport']) {
      readMode = failure
      await edit()
      await dialog().getByRole('alert').waitFor()
      await dialog().getByLabel('Workspace Name *', { exact: true }).fill('Draft name')
      readMode = 'ok'
      await dialog().getByRole('button', { name: 'Retry loading budget', exact: true }).click()
      await budget().waitFor()
      assert.equal(await budget().inputValue(), '42')
      assert.equal(await dialog().getByLabel('Enforce limit').isChecked(), false)
      assert.equal(await dialog().getByLabel('Workspace Name *', { exact: true }).inputValue(), 'Draft name')
      await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await edit()
    await budget().waitFor()
    await submit().click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(puts.length, beforeWrites, 'even a successful read does not authorize an unchanged budget write')

    await edit()
    await budget().fill('0')
    writeMode = 'fail'
    const beforePatches = patches.length
    await submit().click()
    await dialog().getByRole('alert').waitFor()
    assert.equal(patches.length, beforePatches)
    assert.equal(await budget().inputValue(), '0')
    writeMode = 'ok'
    patchFailure = true
    await submit().click()
    await dialog().getByText('Synthetic metadata failure', { exact: true }).waitFor()
    const afterBudgetSaved = puts.length
    patchFailure = false
    await submit().click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(puts.length, afterBudgetSaved, 'metadata retry must not repeat the completed budget write')
    await page.reload()
    await switcher().waitFor()
    await dismissOnboarding()
    await edit()
    await budget().waitFor()
    assert.equal(await budget().inputValue(), '0')
    await page.screenshot({ path: path.join(artifacts, `${width}-edit-persisted.png`) })
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click()

    // Closing partial creation resets the retry identity; next create is independent.
    await create('Partial close')
    writeMode = 'fail'
    await dialog().getByRole('button', { name: 'Create Workspace', exact: true }).click()
    await dialog().getByRole('alert').waitFor()
    await dialog().getByRole('button', { name: 'Close', exact: true }).click()
    writeMode = 'ok'
    featureEnabled = false
    const disabledWrites = puts.length
    await create('No budget feature')
    await budget().waitFor({ state: 'detached' })
    await dialog().getByRole('button', { name: 'Create Workspace', exact: true }).click()
    await dialog().waitFor({ state: 'detached' })
    assert.equal(puts.length, disabledWrites)
    assert.equal(posts.at(-1).name, 'No budget feature')
    console.log(`PASS ${width}px workspace creation/overwrite, zero, failures/retry, metadata isolation, persistence and disabled feature`)
    await page.close()
  }
  console.log(`Screenshots: ${artifacts}`)
} finally { await browser.close() }
