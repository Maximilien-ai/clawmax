// Synthetic API fixtures only: never executes a workflow or accesses credentials.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const id = 'tr-1234567890abcdef-workflow-123456789abc'
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(15000)
    let saved
    let failDetail = false
    const workflow = { id, name: 'Daily Example', description: 'Scheduled brief', status: 'completed', enabled: true, schedule: '0 9 * * *', timezone: 'America/Los_Angeles', executionMode: 'automated', content: 'Write a concise brief', targeting: { agents: ['collector', 'analyst'], groups: ['opaque-group-id'], communities: [], tags: [], teamIds: [] }, participantCount: 2 }
    await page.addInitScript(() => { window.EventSource = class { close() {} }; for (let v=1;v<=10;v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed') })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}
      if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 2 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/metering') json = { byAgent: [] }
      else if (path === '/api/workflows') json = { workflows: [{ ...workflow, content: undefined, targeting: undefined }] }
      else if (path === `/api/workflows/${id}`) {
        if (route.request().method() === 'PUT') { saved = route.request().postDataJSON(); Object.assign(workflow, saved); json = { success: true } }
        else if (failDetail) { await route.fulfill({ status: 503, json: { error: 'unavailable' } }); return }
        else json = workflow
      }
      else if (path.endsWith('/executions')) json = { executions: [] }
      else if (path === '/api/agents') json = { agents: [{ id: 'collector', name: 'Collector' }, { id: 'analyst', name: 'Analyst' }] }
      else if (path === '/api/groups') json = { groups: [{ name: 'opaque-group-id', displayName: 'Readable Operations Group' }] }
      else if (path === '/api/communities') json = { communities: [] }
      else if (path === '/api/teams') json = { teams: [] }
      await route.fulfill({ json })
    })
    await page.goto(`${base}/workflows`)
    console.log(`${width}px: opened fixture`)
    await page.locator('span').filter({ hasText: /^Daily Example$/ }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Workflow' })
    const save = dialog.getByRole('button', { name: 'Save Changes', exact: true })
    await save.waitFor()
    console.log(`${width}px: editor loaded`)
    assert.equal(await dialog.getByRole('checkbox', { name: 'Readable Operations Group', exact: true }).isChecked(), true)
    assert.equal(await dialog.getByRole('checkbox', { name: /^Collector/ }).isChecked(), true)
    assert.equal(await dialog.getByRole('checkbox', { name: /^Analyst/ }).isChecked(), true)
    await dialog.getByRole('button', { name: 'Monday 9am', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Automatic brief' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `/private/tmp/workflow-editor-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    await save.click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(saved.schedule, '0 9 * * 1')
    assert.equal(saved.timezone, 'America/Los_Angeles')
    assert.deepEqual(saved.targeting.groups, ['opaque-group-id'])
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await save.waitFor()
    assert.equal(await dialog.getByPlaceholder('0 9 * * *', { exact: true }).inputValue(), '0 9 * * 1')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.locator('span').filter({ hasText: /^Daily Example$/ }).click()
    await page.getByRole('button', { name: 'Edit', exact: true }).waitFor()
    failDetail = true
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await dialog.getByText(/Unable to load workflow/).waitFor()
    assert.equal(await save.isDisabled(), true)
    console.log(`PASS ${width}px: complete detail, readable selected participants, schedule/timezone save, reopen, blocked failed load`)
    await page.close()
  }
} finally { await browser.close() }
