// Real editor, synthetic API only: no private agent data or live mutations.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
    let failRepair = false
    let writes = 0
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let i = 1; i <= 10; i++) localStorage.setItem(`clawmax-workspace-tour:disable:v${i}`, 'dismissed')
    })
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let json = {}
      if (request.method() === 'PUT') writes++
      if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 1, onlineCount: 0 }
      else if (path === '/api/agents') json = { total: 1, agents: [{ id: 'atlas', name: 'Atlas', status: 'offline', workspacePath: '/fixture/AGENTS/atlas', tags: [], groups: [], communities: [], skills: [] }] }
      else if (path === '/api/agents/atlas/config') json = { identity: '# Unsaved identity', soul: '# Soul\nKeep existing instructions.', tools: '' }
      else if (path === '/api/agents/atlas/identity') json = { metadata: {}, liveConfig: { model: 'openai/gpt-5.5' } }
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
    await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5174'}/agents?agent=atlas&action=edit`)
    const doctor = page.getByRole('button', { name: 'Doctor — fix draft', exact: true })
    await doctor.click()
    await page.getByText('Restored Name. Review and Save to apply.', { exact: true }).waitFor()
    assert.equal(writes, 0, 'Doctor must not save the draft')
    failRepair = true
    await doctor.click()
    await page.getByText('Synthetic repair unavailable', { exact: true }).waitFor()
    assert.equal(writes, 0)
    assert.equal(await page.locator('textarea').first().inputValue(), '- **Name:** atlas\n\n# Unsaved identity')
    assert.deepEqual(errors, [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `/private/tmp/clawmax-doctor-${width}.png` })
    await page.close()
    console.log(`PASS ${width}px: repair, review-before-save, failure preserves draft, no horizontal overflow`)
  }
} finally { await browser.close() }
