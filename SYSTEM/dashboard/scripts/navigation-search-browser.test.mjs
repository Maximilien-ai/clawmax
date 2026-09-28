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
      localStorage.setItem('clawmax-byok-preview', JSON.stringify({ openai: 'fixture-openai-key' }))
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
      else if (path === '/api/integrations/status') json = { visiblePartners: ['cognee'], partnerDefinitions: [{ slug: 'cognee', name: 'Cognee', description: 'Memory and semantic context for agents', category: 'context', fields: [] }] }
      else if (path === '/api/agents/models/discover') json = JSON.parse(route.request().postData() || '{}').openai === 'fixture-openai-key'
        ? { models: ['openai/gpt-6-sol'], modelsByProvider: { openai: { name: 'OpenAI', models: ['openai/gpt-6-sol'] } } }
        : { models: [], modelsByProvider: {} }
      else if (path === '/api/docs') json = { entries: [{ path: 'AGENTS/atlas/SOUL.md', section: 'AGENTS', kind: 'markdown', isAgentWorkspace: true }, { path: 'WORKFLOWS/outputs/daily-report.md', section: 'WORKFLOWS', kind: 'markdown' }] }
      else if (path === '/api/docs/content') json = { kind: 'markdown', content: '# Fixture file' }
      else if (path === '/api/message-counts') json = { counts: {} }
      else if (path === '/api/groups') json = { groups: [{ name: 'Review Group', members: [] }] }
      else if (path === '/api/communities') json = { communities: [{ name: 'Research Circle', members: [] }] }
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
    await input.fill('How do I connect Cognee memory to my agent?')
    await dialog.getByRole('option', { name: /Cognee/ }).click()
    await page.getByText(/^(BYOK & Partner Integrations|Partner Integrations)$/).last().waitFor()
    await page.getByText('Cognee status').waitFor()
    await page.getByRole('button', { name: /close|✕/i }).last().click()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('workspace api keys')
    await dialog.getByRole('option', { name: /Workspace Keys/ }).click()
    await page.waitForURL('**/keys')
    await page.getByRole('tab', { name: /Workspace Keys/ }).getAttribute('aria-selected').then(value => assert.equal(value, 'true'))
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('How do I set my keys?')
    await dialog.getByRole('option', { name: /Configure model providers/ }).click()
    await page.getByText(/^(BYOK & Partner Integrations|Partner Integrations)$/).last().waitFor()
    await page.getByRole('button', { name: /close|✕/i }).last().click()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('skills registries')
    await dialog.getByRole('option', { name: /Skill Registries/ }).click()
    await page.waitForURL('**/skills')
    await page.getByRole('heading', { name: 'Import Custom Skill' }).waitFor()
    await page.getByRole('button', { name: /Skill Registries/ }).last().getAttribute('class').then(value => assert.match(value || '', /purple/))
    await page.getByRole('heading', { name: 'Import Custom Skill' }).locator('..').getByRole('button').click()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('gpt-6-sol')
    await dialog.getByRole('option', { name: /openai\/gpt-6-sol/ }).click()
    await page.getByText(/^(BYOK & Partner Integrations|Partner Integrations)$/).last().waitFor()
    await page.getByRole('button', { name: /close|✕/i }).last().click()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('soul.md for atlas')
    await dialog.getByRole('option', { name: /SOUL.md.*AGENTS\/atlas/ }).click()
    await page.waitForURL('**/docs')
    await page.getByRole('heading', { name: 'Fixture file' }).waitFor()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('review group')
    await dialog.getByRole('option', { name: /Review Group/ }).click()
    await page.waitForURL('**/organizations')
    await page.getByText('Review Group').first().waitFor().catch(async (error) => { console.error((await page.locator('main').innerText()).slice(0, 2000)); throw error })
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('atlas')
    await dialog.getByRole('option', { name: /Atlas Analyst/ }).waitFor()
    await input.press('Enter')
    await page.waitForURL('**/agents')
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('daily brief')
    await dialog.getByRole('option', { name: /Daily Brief/ }).click()
    await page.waitForURL('**/workflows')
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('apply starter analyst template')
    await dialog.getByRole('option', { name: /Starter Analyst/ }).click()
    await page.waitForURL('**/templates')
    await page.getByRole('heading', { name: 'Starter Analyst', exact: true }).last().waitFor()
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('daily report workflow output')
    await dialog.getByRole('option', { name: /daily-report.md/ }).click()
    await page.waitForURL('**/docs')
    await page.getByRole('heading', { name: 'Fixture file' }).waitFor()
    await page.screenshot({ path: `/private/tmp/clawmax-navigation-search-${width}.png` })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
    failSkills = true
    await page.keyboard.press(width === 390 ? 'Control+k' : 'Meta+k')
    await input.fill('agents')
    await dialog.getByRole('status').getByText('Some workspace items could not load. Page results remain available.').waitFor()
    await dialog.getByRole('option', { name: 'Agents Page' }).waitFor()
    await input.press('Escape')
    assert.equal(await dialog.count(), 0)
    console.log(`PASS ${width}px: search keyboard, BYOK, registries, models, files, entities, and layout`)
    await page.close()
  }
} finally { await browser.close() }
