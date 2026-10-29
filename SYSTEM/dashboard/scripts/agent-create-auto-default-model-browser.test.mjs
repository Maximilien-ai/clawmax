// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
// Auto (no saved new-agent default) with a key kept only in this browser: the server has no key, so it
// sends no recommendation, and OpenAI discovery lists models sorted by id with deprecated gpt-4.1 first.
// The wizard must default to a current model, keep an explicitly saved one, and ask when none is current.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-agent-auto-default-model-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })

const SORTED = ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-5', 'openai/gpt-5.4-mini', 'openai/gpt-5.5']
const fixture = { models: SORTED }
const agent = { id: 'existing-agent', name: 'Existing Agent', status: 'offline', workspacePath: '/tmp/auto-default/AGENTS/existing-agent', tags: [], communities: [], groups: [], skills: [], model: 'openai/gpt-5.5', runtime: 'openclaw' }
const workspace = { id: 'auto-default', name: 'Auto default fixture', path: '/tmp/auto-default', agentCount: 1, isActive: true, tags: [] }

async function newPage(width) {
  const page = await browser.newPage({ viewport: { width, height: 860 } })
  page.setDefaultTimeout(10000)
  page.errors = []
  page.on('pageerror', (error) => page.errors.push(error.stack))
  await page.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname
    let body = {}
    // No server keys and Auto: no preferredModel and no recommendedModel.
    if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', preferredModel: null, enabledRuntimes: [], userKeyDefaults: { openai: false }, systemKeyDefaults: { openai: false } }
    else if (p === '/api/integrations/config') body = { config: {} }
    else if (p === '/api/agents/models/discover') body = { models: fixture.models, modelsByProvider: { openai: { name: 'OpenAI', models: fixture.models } } }
    else if (p === '/api/integrations/runtimes') body = { runtimes: [{ id: 'openclaw', label: 'OpenClaw', models: [] }], enabledRuntimes: [] }
    else if (p === '/api/health/live') body = { alive: true }
    else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture', name: 'Fixture', role: 'admin' } }
    else if (p === '/api/system') body = { version: '2.0.0-test-fixture', hostname: 'browser-fixture', agentCount: 1, onlineCount: 0, workspacePath: workspace.path }
    else if (p === '/api/workspaces') body = { workspaces: [workspace] }
    else if (p === '/api/workspaces/active') body = { workspace }
    else if (p === '/api/agents/next') body = { id: 'agent0', port: 18800 }
    else if (p === '/api/agents') body = { agents: [agent], total: 1, hasMore: false }
    else if (p === `/api/agents/${agent.id}`) body = agent
    else if (p === `/api/agents/${agent.id}/identity`) body = { metadata: { model: agent.model, runtime: 'openclaw' }, liveConfig: { model: agent.model } }
    else if (p === '/api/templates/agents') body = { templates: [] }
    else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
    else if (p === '/api/agents/turns/active') body = { turns: [] }
    else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
    else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
    else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
    else if (p === '/api/docs') body = { docs: [] }
    else if (p === '/api/plugins') body = { plugins: [] }
    else if (p === '/api/communities') body = { communities: [] }
    else if (p === '/api/groups') body = { groups: [] }
    else if (p === '/api/workflows') body = { workflows: [] }
    else if (p.endsWith('/status')) body = { agents: [agent] }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  return page
}

const wizard = (page) => page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Add Agent', level: 2 }) })
const modelValue = (page) => wizard(page).getByRole('button', { name: 'models', exact: true }).getAttribute('data-model-value')

// A synthetic browser-only OpenAI key, optionally with a saved new-agent default.
async function openWizard(page, preferredModel) {
  await page.goto(`${base}/agents`)
  await page.evaluate((preferred) => {
    for (let i = 1; i <= 10; i++) localStorage.setItem(`clawmax-workspace-tour:disable:v${i}`, 'dismissed')
    localStorage.setItem('clawmax-byok-preview', JSON.stringify({ openai: 'sk-fixture-not-a-real-key', ...(preferred ? { preferredModel: preferred } : {}) }))
  }, preferredModel)
  await page.reload()
  await page.getByRole('button').filter({ hasText: /^Create\s*▾$/ }).click()
  await page.getByRole('button').filter({ hasText: /^\s*Create with Wizard\s*$/ }).click()
  await page.getByRole('heading', { name: 'Add Agent', level: 2 }).waitFor()
}
async function waitForModel(page, expected) {
  await page.waitForFunction((value) => document.querySelector('button[data-model-value]')?.dataset.modelValue === value, expected)
    .catch(async () => assert.fail(`Expected model "${expected}", got "${await modelValue(page)}"`))
}
async function check(page, name, fn) {
  try { await fn(); assert.deepEqual(page.errors, []); console.log(`PASS ${name}`) } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${name.replace(/\W+/g, '-')}.png`) })
    throw new Error(`${name}: ${error.message}`)
  }
}

try {
  for (const width of [1280, 390]) {
    const page = await newPage(width)
    await check(page, `${width}px: Auto defaults to gpt-5.4-mini although deprecated gpt-4.1 is listed first`, async () => {
      fixture.models = SORTED
      await openWizard(page)
      await waitForModel(page, 'openai/gpt-5.4-mini')
    })
    await page.close()
  }

  const page = await newPage(1280)
  await check(page, 'without gpt-5.4-mini access Auto takes the first current model, not gpt-4.1 or gpt-4o', async () => {
    fixture.models = SORTED.filter((model) => model !== 'openai/gpt-5.4-mini')
    await openWizard(page)
    await waitForModel(page, 'openai/gpt-5')
  })

  await check(page, 'an explicitly saved gpt-4.1 default is kept and flagged as deprecated', async () => {
    fixture.models = SORTED
    await openWizard(page, 'openai/gpt-4.1')
    await waitForModel(page, 'openai/gpt-4.1')
    await wizard(page).getByText('"gpt-4.1" is deprecated and shuts off on 2027-01-14', { exact: false }).first().waitFor()
  })

  await check(page, 'with only deprecated models listed, no model is chosen and the wizard says what to do', async () => {
    fixture.models = ['openai/gpt-4.1', 'openai/gpt-4.1-mini', 'openai/gpt-4o']
    await openWizard(page)
    await page.getByRole('alert').filter({ hasText: 'every model offered for your keys is deprecated or retired' }).waitFor()
    assert.equal(await modelValue(page), '')
    assert.equal(await wizard(page).getByRole('button', { name: 'Next', exact: true }).isDisabled(), true)
  })
  await page.close()
} finally {
  await browser.close()
}
