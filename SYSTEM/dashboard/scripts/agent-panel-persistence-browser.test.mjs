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
try {
  await page.goto(`${base}/agents`)
  await page.getByText('Additional agents (1)', { exact: false }).click()
  await page.getByText(agent.name, { exact: true }).waitFor({ timeout: 20000 })
  const pin = page.getByRole('button', { name: 'Keep open', exact: true })
  const detailsClose = page.getByRole('button', { name: 'Close details (Esc)', exact: true })
  const openDetails = () => page.getByText(agent.name, { exact: true }).click()
  await openDetails()
  await detailsClose.waitFor()
  assert.equal(await pin.getAttribute('aria-pressed'), 'false')
  await page.mouse.click(300, 900)
  await detailsClose.waitFor({ state: 'hidden' })
  console.log('PASS details dismiss on outside click by default')
  await openDetails()
  await pin.click()
  await page.mouse.click(300, 900)
  assert(await detailsClose.isVisible())
  await page.screenshot({ path: path.join(artifactDir, 'details-desktop.png') })
  await page.keyboard.press('Escape')
  await detailsClose.waitFor({ state: 'hidden' })
  console.log('PASS pinned details ignore outside click and close on Escape')
  await page.reload()
  await page.getByText('Additional agents (1)', { exact: false }).click()
  await openDetails()
  assert.equal(await pin.getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'Chat with agent', exact: true }).click()
  const closeChat = page.getByRole('button', { name: 'Close chat', exact: true })
  await closeChat.waitFor()
  await page.getByRole('button', { name: 'Download conversation as Markdown', exact: true }).waitFor()
  assert.equal(await pin.count(), 2)
  const chatRoot = closeChat.locator('xpath=ancestor::div[@tabindex="-1"]')
  const chatPin = chatRoot.getByRole('button', { name: 'Keep open', exact: true })
  assert.equal(await chatPin.getAttribute('aria-pressed'), 'true')
  const forward = chatRoot.getByRole('button', { name: 'Forward message', exact: true })
  await forward.press('Enter')
  await chatRoot.getByRole('menu', { name: 'Forward to', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await chatRoot.getByRole('menu', { name: 'Forward to', exact: true }).waitFor({ state: 'hidden' })
  assert(await closeChat.isVisible())
  assert.equal(await forward.evaluate(element => element === document.activeElement), true)
  console.log('PASS Forward Escape closes only the menu and restores trigger focus')
  await page.mouse.click(300, 900)
  assert(await closeChat.isVisible())
  await chatRoot.locator('button[title="Switch to slide"]').click()
  await page.mouse.click(300, 900)
  assert(await closeChat.isVisible())
  await page.screenshot({ path: path.join(artifactDir, 'chat-desktop.png') })
  await closeChat.click()
  assert(await detailsClose.isVisible())
  await detailsClose.click()
  console.log('PASS preference survives reload and is shared with chat; X closes only chat')
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('button').filter({ hasText: /^\s*Edit\s*$/ }).click()
  const closeConfig = page.getByRole('button', { name: 'Close config', exact: true })
  await closeConfig.waitFor()
  assert.equal(await pin.getAttribute('aria-pressed'), 'true')
  await page.mouse.click(300, 900)
  assert(await closeConfig.isVisible())
  await page.screenshot({ path: path.join(artifactDir, 'config-desktop.png') })
  await pin.click()
  await page.mouse.click(300, 900)
  await closeConfig.waitFor({ state: 'hidden' })
  console.log('PASS config shares pin preference, stays open when pinned, dismisses when unpinned')
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('button').filter({ hasText: /^\s*Edit\s*$/ }).click()
  await page.keyboard.press('Escape')
  await closeConfig.waitFor({ state: 'hidden' })
  console.log('PASS config Escape works immediately after open')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('button').filter({ hasText: /^\s*Edit\s*$/ }).click()
  await closeConfig.waitFor()
  await pin.click()
  await page.screenshot({ path: path.join(artifactDir, 'config-mobile.png') })
  assert(await pin.isVisible() && await closeConfig.isVisible())
  await closeConfig.click()
  await openDetails()
  await page.getByRole('button', { name: 'Chat with agent', exact: true }).click()
  await closeChat.waitFor()
  await page.screenshot({ path: path.join(artifactDir, 'chat-mobile.png') })
  assert(await closeChat.isVisible())
  await page.keyboard.press('Escape')
  await closeChat.waitFor({ state: 'hidden' })
  await detailsClose.click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page has no horizontal overflow')
  console.log('PASS mobile config/chat controls and Escape; no horizontal overflow')
  await page.screenshot({ path: path.join(artifactDir, 'agents-desktop.png') })
  assert.deepEqual(errors, [], 'No browser runtime errors')
} catch (error) {
  await page.screenshot({ path: path.join(artifactDir, 'browser-error.png') })
  console.log((await page.locator('body').innerText()).slice(0, 5000), errors)
  throw error
} finally { await browser.close() }
