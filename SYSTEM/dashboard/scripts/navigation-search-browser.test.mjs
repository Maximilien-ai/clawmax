// Synthetic browser regression; no live workspace data or credentials are used.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5188'

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.on('pageerror', (error) => console.error('page error:', error.stack))
    page.setDefaultTimeout(10000)
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
    })
    let failSkills = false
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}
      if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 1, onlineCount: 0 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/agents/atlas/activity') json = { recentFiles: [], todos: null, completed: null, identity: null }
      else if (path === '/api/agents') json = { agents: [{ id: 'atlas', name: 'Atlas Analyst', workspacePath: '/fixture/AGENTS/atlas', status: 'offline', tags: [], communities: [], groups: [], skills: [] }] }
      else if (path === '/api/workflows') json = { workflows: [{ id: 'daily-brief', name: 'Daily Brief', description: 'Daily operations' }] }
      else if (path === '/api/templates') json = { agents: [{ type: 'agent', slug: 'starter-analyst', name: 'Starter Analyst', source: 'system', agents: [] }], organizations: [], workflows: [] }
      else if (path === '/api/skills') { if (failSkills) { await route.fulfill({ status: 503, json: {} }); return }; json = { skills: [{ name: 'research-skill', description: 'Research sources' }] } }
      else if (path === '/api/message-counts') json = { counts: {} }
      else if (path === '/api/groups') json = { groups: [] }
      else if (path === '/api/communities') json = { communities: [] }
      await route.fulfill({ json })
    })
    await page.goto(`${base}/builder`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    const trigger = page.getByRole('button', { name: 'Search ClawMax' })
    await trigger.waitFor()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    const dialog = page.getByRole('dialog', { name: 'Search ClawMax' })
    const input = dialog.getByRole('combobox')
    await input.fill('atlas')
    await dialog.getByRole('option', { name: /Atlas Analyst/ }).waitFor()
    await page.screenshot({ path: `/private/tmp/clawmax-navigation-search-dialog-${width}.png` })
    await input.fill('run workflow')
    await dialog.getByRole('option', { name: /Workflows/ }).waitFor()
    await input.fill('atlas')
    await input.press('Enter')
    await page.waitForURL('**/agents')
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('daily brief')
    await dialog.getByRole('option', { name: /Daily Brief/ }).click()
    await page.waitForURL('**/workflows')
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('starter analyst')
    await dialog.getByRole('option', { name: /Starter Analyst/ }).click()
    await page.waitForURL('**/templates')
    await page.getByRole('heading', { name: 'Starter Analyst', exact: true }).last().waitFor()
    await page.screenshot({ path: `/private/tmp/clawmax-navigation-search-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    failSkills = true
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('agents')
    await dialog.getByRole('status').getByText('Some workspace items could not load. Page results remain available.').waitFor()
    await dialog.getByRole('option', { name: /Agents/ }).waitFor()
    await input.press('Escape')
    assert.equal(await dialog.count(), 0)
    console.log(`PASS ${width}px: search keyboard, entity navigation, template detail, partial failure, and layout`)
    await page.close()
  }
} finally { await browser.close() }
