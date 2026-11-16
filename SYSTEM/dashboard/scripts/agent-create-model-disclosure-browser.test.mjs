// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-agent-panel-browser'
fs.mkdirSync(artifactDir, { recursive: true })
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const agent = { id: 'rc94-probe', generation: 'rc94-browser-generation', name: 'RC94 Acceptance Agent With A Long Name', status: 'offline', workspacePath: '/tmp/rc94/AGENTS/rc94-probe', tags: [], communities: [], groups: [], skills: [], model: 'openai/gpt-5', runtime: 'openclaw' }
const workspace = { id: 'rc94-browser', name: 'RC94 Acceptance Workspace With A Long Name', path: '/tmp/rc94', agentCount: 1, isActive: true, tags: [] }
const errors = []
let generateCalls = 0
const preferred = 'openai/gpt-5.4-mini'
page.on('pageerror', error => errors.push(error.stack))
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url()), p = url.pathname
  let body = {}
  if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', preferredModel: preferred, enabledRuntimes: ['openclaw'], userKeyDefaults: { openai: true, anthropic: false } }
  else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'rc94', login: 'rc94', name: 'RC94 Browser', role: 'admin' } }
  else if (p === '/api/system') body = { version: '2.0.0-test-rc94', hostname: 'browser-fixture', machineName: 'RC94', agentCount: 1, onlineCount: 0, workspacePath: workspace.path }
  else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
  else if (p === '/api/workspaces') body = { workspaces: [workspace] }
  else if (p === '/api/workspaces/active') body = { workspace }
  else if (p === '/api/agents/generate') {
    generateCalls++
    body = { identity: '# Synthetic Research Agent', soul: 'Use sources', tools: 'No tools', generatedBy: 'Synthetic acceptance fixture', suggestedName: 'research-agent', suggestedModel: 'openai/o3-2025-04-16', modelRecommendation: { recommendedModel: agent.model, confidence: 'medium', summary: 'Synthetic model fit', disclaimer: 'Advisory fixture', candidates: [{ model: agent.model, score: 1, tier: 'balanced', reasons: ['Synthetic reason'], caveats: [] }] } }
  }
  else if (p === '/api/agents/model-fit') body = { recommendedModel: agent.model, confidence: 'medium', summary: 'Synthetic model fit', disclaimer: 'Advisory fixture', candidates: [{ model: agent.model, score: 1, tier: 'balanced', reasons: ['Synthetic reason'], caveats: [] }] }
  else if (p === '/api/agents') body = { agents: [agent], total: 1, hasMore: false }
  else if (p === '/api/agents/rc94-probe') body = agent
  else if (p === '/api/agents/rc94-probe/activity') body = { recentFiles: [], recentMessages: [], skills: [], liveConfig: { model: agent.model, workspace: agent.workspacePath, agentDir: agent.workspacePath } }
  else if (p === '/api/agents/rc94-probe/config') body = { identity: '# RC94 Probe', soul: '', tools: '', runtime: 'openclaw', model: agent.model }
  else if (p === '/api/agents/rc94-probe/identity') body = { metadata: { model: agent.model, runtime: 'openclaw' }, liveConfig: { model: agent.model } }
  else if (p === '/api/agents/rc94-probe/gateway') body = { available: true }
  else if (p === '/api/agents/rc94-probe/chat/readiness') body = { available: true }
  else if (p === '/api/agents/rc94-probe/chat/archives') body = { archives: [] }
  else if (p === '/api/agents/turns/active') body = { turns: [] }
  else if (p === '/api/agents/rc94-probe/chat/messages') body = { messages: [{ id: 'rc94-reply', role: 'assistant', content: 'RC94 reply for forwarding', timestamp: 1720000000000 }] }
  else if (p === '/api/agents/rc94-probe/turns/active') body = { turns: [] }
  else if (p.includes('/models')) body = { models: [agent.model], modelsByProvider: { openai: { name: 'OpenAI', models: [agent.model] } } }
  else if (p === '/api/runtime/catalog' || p === '/api/integrations/runtimes') body = { runtimes: [{ id: 'openclaw', label: 'OpenClaw', enabled: true, models: [agent.model] }] }
  else if (p === '/api/plugins') body = { plugins: [] }
  else if (p === '/api/docs') body = { docs: [] }
  else if (p === '/api/communities') body = { communities: [] }
  else if (p === '/api/groups') body = { groups: [{ name: 'rc94-room', displayName: 'RC94 Group', members: [] }] }
  else if (p === '/api/workflows') body = { workflows: [] }
  else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
  else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
  else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
  else if (p.endsWith('/status')) body = { agents: [agent] }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})
// After the catch-all so it takes precedence: the app mounts only once the API reports live.
await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
try {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/agents`)
    await page.getByRole('button').filter({ hasText: /^Create\s*▾$/ }).click()
    await page.getByRole('button').filter({ hasText: /^\s*Create with AI\s*$/ }).click()
    const prompt = page.getByPlaceholder('e.g., A friendly project manager who helps track tasks and deadlines...')
    await prompt.waitFor()
    await prompt.fill('Create a research assistant who returns a concise sourced report. Ask before any external action.')
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).click()
    await page.getByText('Files generated successfully', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    const modelSelect = page.locator('select').filter({ has: page.locator(`option[value="${preferred}"]`) }).first()
    assert.equal(await modelSelect.inputValue(), preferred, 'AI must preserve saved default even when discovery omits it')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    const disclosure = page.locator('details[aria-label="Model suggestion"]')
    assert.equal(await disclosure.getAttribute('open'), null)
    await disclosure.locator('summary').click()
    await page.getByText('Synthetic model fit', { exact: true }).waitFor()
    assert(await disclosure.getByRole('checkbox', { name: 'Auto-select top suggestion', exact: true }).isVisible())
    await disclosure.locator('summary').click()
    assert.equal(await disclosure.getAttribute('open'), null)
    await page.screenshot({ path: path.join(artifactDir, `ai-agent-disclosure-${width}.png`) })
    console.log(`PASS ${width}px: AI-created model recommendation starts collapsed and expands on request`)
  }
  assert.equal(generateCalls, 2)
  assert.deepEqual(errors, [])
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-3500), errors)
  await page.screenshot({ path: path.join(artifactDir, 'ai-agent-disclosure-error.png') })
  throw error
} finally { await browser.close() }
