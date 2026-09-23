// Frontend-only regression: all API calls are synthetic; no agents are provisioned.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
    })
    let failApply = true
    const agent = { id: 'fixture-agent', role: 'Fixture operator', model: 'openai/gpt-5.4-mini' }
    const template = type => ({ name: type === 'agent' ? 'Navigation Agent' : 'Navigation Team', slug: `navigation-${type}`, type, source: 'system', version: '1.0', description: 'Synthetic navigation test', agents: [agent], groups: [], communities: [], workflows: [] })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}, status = 200
      if (path === '/api/auth/config') json = { authDisabled: true, userKeyDefaults: { openai: true }, preferredModel: 'openai/gpt-5.4-mini' }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 0, onlineCount: 0 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/templates') json = { agents: [template('agent')], organizations: [template('organization')], workflows: [] }
      else if (path === '/api/templates/organizations/prereqs') json = { ready: true, checks: [], summary: { pass: 1, warn: 0, fail: 0 } }
      else if (path === '/api/templates/organizations/conflicts') json = { agentConflicts: [], groupConflicts: [], communityConflicts: [], workflowConflicts: [] }
      else if (path === '/api/templates/organizations/validate-customization') json = { valid: true, errors: [], warnings: [] }
      else if (path.endsWith('/import')) { status = failApply ? 409 : 200; json = failApply ? { error: 'Synthetic apply failure; retry safely' } : { agentIds: ['fixture-agent'], success: true } }
      else if (path === '/api/templates/organizations/navigation-organization') json = template('organization')
      else if (path.includes('/models')) json = { models: ['openai/gpt-5.4-mini'] }
      else if (path.includes('/agents') || path.includes('/skills') || path.includes('/workflows') || path.includes('/notifications') || path.includes('/groups') || path.includes('/communities')) json = []
      await route.fulfill({ status, json })
    })
    await page.goto(`${base}/templates`)
    await page.getByText('Navigation Agent', { exact: true }).waitFor()
    for (const name of ['Navigation Agent', 'Navigation Team']) {
      failApply = true
      await page.goto(`${base}/templates`)
      await page.getByRole('heading', { name, exact: true }).click()
      await page.getByRole('button', { name: 'Apply Now', exact: true }).click()
      const isAgent = name === 'Navigation Agent'
      const input = page.getByPlaceholder(isAgent ? 'fixture-agent' : 'e.g., proj1-', { exact: true })
      const value = isAgent ? 'fixture-custom' : 'custom-'
      await input.fill(value)
      const submit = page.getByRole('button', { name: isAgent ? 'Apply Template' : '⚡ Apply Template', exact: true })
      await submit.click()
      await page.getByRole('main').getByText('Synthetic apply failure; retry safely', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, '/templates')
      assert.equal(await input.inputValue(), value)
      await page.screenshot({ path: `/private/tmp/rc85-template-${width}-${isAgent ? 'agent' : 'team'}-error.png` })
      failApply = false
      await submit.click()
      await page.waitForURL('**/agents')
      await page.getByRole('heading', { name: 'Agents', exact: true }).waitFor()
      assert.equal(await input.count(), 0)
      console.log(`PASS ${width}px ${name}: failure preserves input; retry navigates to Agents`)
    }
    await page.close()
  }
} finally { await browser.close() }
