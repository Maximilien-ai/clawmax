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
const catalog = [{ name: 'research-key', displayName: 'Research and Field Team With A Long Group Name', description: 'Sources and analysis' }, { name: 'ops-key', displayName: 'Operations', description: 'Delivery' }]
let failGroupLoad = false, failWrite = false
let writeStarted, releaseWrite
const started = new Promise(resolve => { writeStarted = resolve })
let pauseWrite = true
page.on('pageerror', error => errors.push(error.stack))
await page.route('**/api/**', async route => {
  const url = new URL(route.request().url()), p = url.pathname
  let body = {}
  if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
  else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'rc94', login: 'rc94', name: 'RC94 Browser', role: 'admin' } }
  else if (p === '/api/system') body = { version: '2.0.0-test-rc94', hostname: 'browser-fixture', machineName: 'RC94', agentCount: 1, onlineCount: 0, workspacePath: workspace.path }
  else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
  else if (p === '/api/workspaces') body = { workspaces: [workspace] }
  else if (p === '/api/workspaces/active') body = { workspace }
  else if (p === '/api/agents') body = { agents: [agent], total: 1, hasMore: false }
  else if (p === '/api/agents/rc94-probe') body = agent
  else if (p === '/api/agents/rc94-probe/communities') {
    const payload = route.request().postDataJSON()
    assert.deepEqual(Object.keys(payload), ['groups'], 'The group control never replaces communities')
    if (pauseWrite) { writeStarted(); await new Promise(resolve => { releaseWrite = resolve }); pauseWrite = false }
    if (failWrite) { await route.fulfill({ status: 503, json: { error: 'Membership store is unavailable' } }); return }
    agent.groups = catalog.filter(group => payload.groups.includes(group.name))
    body = { ok: true }
  }
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
  else if (p === '/api/groups') { if (failGroupLoad) { await route.fulfill({ status: 503, json: { error: 'Group list unavailable' } }); return }; body = { groups: catalog } }
  else if (p === '/api/workflows') body = { workflows: [] }
  else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
  else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
  else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
  else if (p.endsWith('/status')) body = { agents: [agent] }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})
try {
  for (const width of [1440, 390]) {
    agent.groups = []
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${base}/agents`)
    await page.getByText('Additional agents (1)', { exact: false }).click()
    await page.getByText(agent.name, { exact: true }).click()
    const region = page.getByRole('group', { name: `Groups for ${agent.name}`, exact: true })
    failGroupLoad = true
    await region.getByRole('button', { name: '+ Add to group', exact: true }).click()
    await region.getByRole('button', { name: 'Retry loading groups', exact: true }).waitFor()
    assert(await region.getByRole('alert').isVisible())
    failGroupLoad = false
    await region.getByRole('button', { name: 'Retry loading groups', exact: true }).click()
    const search = region.getByRole('textbox', { name: `Search groups for ${agent.name}`, exact: true })
    await search.fill('does-not-match')
    await region.getByText('No matching groups.', { exact: true }).waitFor()
    await search.fill('sources')
    const add = region.getByRole('button', { name: `Add ${agent.name} to ${catalog[0].displayName}`, exact: true })
    if (width === 1440) {
      await add.click()
      await started
      assert(await add.isDisabled())
      releaseWrite()
    } else await add.click()
    const removeLabel = `Remove ${agent.name} from ${catalog[0].displayName}`
    await region.getByRole('button', { name: removeLabel, exact: true }).waitFor()
    await region.getByText(`Added to ${catalog[0].displayName}`, { exact: true }).waitFor()
    assert.equal(agent.groups.length, 1)
    await page.screenshot({ path: path.join(artifactDir, `groups-${width}.png`) })
    await search.press('Escape')
    await search.waitFor({ state: 'hidden' })
    assert(await page.getByRole('button', { name: 'Close details (Esc)', exact: true }).isVisible())
    await page.reload()
    await page.getByText('Additional agents (1)', { exact: false }).click()
    await page.getByText(agent.name, { exact: true }).click()
    await region.getByRole('button', { name: removeLabel, exact: true }).waitFor()
    failWrite = true
    await region.getByRole('button', { name: removeLabel, exact: true }).click()
    await region.getByText('Membership store is unavailable', { exact: true }).waitFor()
    assert(await region.getByRole('button', { name: removeLabel, exact: true }).isVisible())
    assert.equal(agent.groups.length, 1)
    failWrite = false
    agent.groups.push(catalog[1]) // Another tab added a membership since this view loaded.
    await region.getByRole('button', { name: removeLabel, exact: true }).click()
    await region.getByRole('button', { name: removeLabel, exact: true }).waitFor({ state: 'hidden' })
    await region.getByRole('button', { name: `Remove ${agent.name} from Operations`, exact: true }).waitFor()
    assert.deepEqual(agent.groups.map(group => group.name), ['ops-key'])
    await page.reload()
    await page.getByText('Additional agents (1)', { exact: false }).click()
    await page.getByText(agent.name, { exact: true }).click()
    await region.getByRole('button', { name: `Remove ${agent.name} from Operations`, exact: true }).waitFor()
    assert.equal(await region.getByRole('button', { name: removeLabel, exact: true }).count(), 0)
    console.log(`PASS ${width}px: searchable add/remove, load retry, pending state, save failure, fresh membership preservation, reload persistence, and Escape`)
  }
  assert.deepEqual(errors, [])
} catch (error) {
  await page.screenshot({ path: path.join(artifactDir, 'groups-error.png') })
  console.error(errors)
  throw error
} finally { await browser.close() }
