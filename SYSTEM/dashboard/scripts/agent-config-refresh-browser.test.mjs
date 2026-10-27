// Real editor, synthetic API only: no private agent data or live mutations.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
    let failRepair = false
    let writes = 0
    let savedModel = 'openai/gpt-5.4-mini-2026-03-17'
    let activityRequests = 0
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let i = 1; i <= 10; i++) localStorage.setItem(`clawmax-workspace-tour:disable:v${i}`, 'dismissed')
    })
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let json = {}
      if (request.method() === 'PUT') writes++
      if (path === '/api/agents/atlas/model' && request.method() === 'PATCH') { savedModel = request.postDataJSON().model; json = { ok: true } }
      else if (path === '/api/agents/atlas/activity') { activityRequests++; json = { recentFiles: [], recentMessages: [], skills: [], liveConfig: { model: savedModel, workspace: '/fixture/AGENTS/atlas', agentDir: '/fixture/agent' } } }
      else if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 1, onlineCount: 0 }
      else if (path === '/api/agents') json = { total: 1, agents: [{ id: 'atlas', name: 'Atlas', status: 'offline', workspacePath: '/fixture/AGENTS/atlas', tags: [], groups: [], communities: [], skills: [] }] }
      else if (path === '/api/agents/atlas/config') json = { identity: '- **Name:** atlas', soul: '# Soul\nKeep existing instructions.', tools: '' }
      else if (path === '/api/agents/atlas/identity') json = { metadata: {}, liveConfig: { model: 'openai/gpt-5.4-mini-2026-03-17' }, modelWarning: { model: 'openai/gpt-5.4-mini-2026-03-17', message: 'Use openai/gpt-5.4-mini, a model listed by the runtime.' } }
      else if (path === '/api/agents/models/discover') json = { models: ['openai/gpt-5.5'], modelsByProvider: { openai: { name: 'OpenAI', models: ['openai/gpt-5.5'] } } }
      else if (path === '/api/agents/validate-config') {
        const body = request.postDataJSON()
        const errors = body.identity.includes('**Name:**') ? [] : ['IDENTITY.md is missing a **Name:** field']
        json = { valid: !errors.length, errors, warnings: [] }
      } else if (path === '/api/agents/atlas/config/repair') {
        if (failRepair) return route.fulfill({ status: 503, json: { error: 'Synthetic repair unavailable' } })
        const body = request.postDataJSON()
        json = { config: { ...body, identity: '- **Name:** atlas\n\n' + body.identity }, valid: true, errors: [], warnings: [], changes: ['Restored Name'] }
      }
      await route.fulfill({ json })
    })
    // After the catch-all so it takes precedence: the app mounts only once the API reports live.
    await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
    await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5174'}/agents?agent=atlas&action=edit`)
    const current = page.getByRole('dialog', { name: 'Edit Agent Config' }).locator('select').first()
    await current.waitFor()
    assert.equal(await current.inputValue(), 'openai/gpt-5.4-mini-2026-03-17')
    assert.match(await current.locator('option:checked').innerText(), /current; not offered/)
    await page.getByText('This model is not supported by the current runtime.', { exact: true }).waitFor()
    await page.screenshot({ path: `/private/tmp/rc95-model-warning-${width}.png` })
    await current.selectOption('openai/gpt-5.5')
    assert.equal(await current.inputValue(), 'openai/gpt-5.5')
    assert.equal(await page.getByText('This model is not supported by the current runtime.', { exact: true }).count(), 0)
    assert.equal(writes, 0, 'changing draft does not silently save')
    const before = activityRequests
    const dialog = page.getByRole('dialog', { name: 'Edit Agent Config' })
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.locator('span.font-mono').filter({ hasText: /^openai\/gpt-5\.5$/ }).first().waitFor()
    assert(activityRequests > before, 'Open detail panel refetches activity after Save')
    assert.equal(writes, 1)
    assert.equal(savedModel, 'openai/gpt-5.5')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `/private/tmp/rc95-panel-refresh-${width}.png` })
    await page.close()
    console.log(`PASS ${width}px: open side panel immediately shows saved model without reopening`)
  }
} finally { await browser.close() }
