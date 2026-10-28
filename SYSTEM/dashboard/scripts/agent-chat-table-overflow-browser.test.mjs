// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
// Wide Markdown tables in agent chat must scroll inside their own box, never widen the bubble,
// the message viewport or the page, in both chat layouts at desktop and phone widths.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-chat-table-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const agent = { id: 'table-probe', generation: 'table-browser-generation', name: 'Table Probe Agent', status: 'offline', workspacePath: '/tmp/table/AGENTS/table-probe', tags: [], communities: [], groups: [], skills: [], model: 'openai/gpt-5', runtime: 'openclaw' }
const workspace = { id: 'table-browser', name: 'Table Browser Workspace', path: '/tmp/table', agentCount: 1, isActive: true, tags: [] }
const longCell = 'Durable append-only log with per-workflow partitions, idempotent consumers and replay support'
const wideTable = [
  '| Decision | Context | Chosen option | Rejected option | Consequences | Owner | Review date | Status |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  `| Event transport | Agents exchange workflow handoffs across regions with strict ordering | ${longCell} | Point-to-point HTTP callbacks with retries | Ordering preserved; operational cost increases | platform-architecture-team | 2026-11-15 | Accepted |`,
  '| Model routing | Mixed providers with different capabilities and context windows | Capability-aware routing table resolved at turn start | Static per-agent model string | Fewer runtime failures; more configuration surface | runtime-and-models-working-group | 2026-12-01 | Proposed |',
].join('\n')
const reply = [
  '## Architecture decisions', '', wideTable, '', 'A short table stays compact:', '',
  '| Key | Value |', '| --- | --- |', '| Region | us-west |', '',
  '```json', '{ "status": "ok", "items": [1, 2, 3] }', '```',
].join('\n')
const messages = [
  { id: 'table-question', role: 'user', content: 'Give me an architecture decision table.', timestamp: 1720000000000 },
  { id: 'table-reply', role: 'assistant', content: reply, timestamp: 1720000001000 },
]

async function newPage(viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.stack))
  await page.route('**/api/**', async route => {
    const p = new URL(route.request().url()).pathname
    let body = {}
    if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
    else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'table', login: 'table', name: 'Table Browser', role: 'admin' } }
    else if (p === '/api/health/live') body = { alive: true }
    else if (p === '/api/system') body = { version: '2.0.0-test', hostname: 'browser-fixture', machineName: 'Table', agentCount: 1, onlineCount: 0, workspacePath: workspace.path }
    else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
    else if (p === '/api/workspaces') body = { workspaces: [workspace] }
    else if (p === '/api/workspaces/active') body = { workspace }
    else if (p === '/api/agents') body = { agents: [agent], total: 1, hasMore: false }
    else if (p === `/api/agents/${agent.id}`) body = agent
    else if (p === `/api/agents/${agent.id}/activity`) body = { recentFiles: [], recentMessages: [], skills: [], liveConfig: { model: agent.model, workspace: agent.workspacePath, agentDir: agent.workspacePath } }
    else if (p === `/api/agents/${agent.id}/config`) body = { identity: '# Table Probe', soul: '', tools: '', runtime: 'openclaw', model: agent.model }
    else if (p === `/api/agents/${agent.id}/identity`) body = { metadata: { model: agent.model, runtime: 'openclaw' }, liveConfig: { model: agent.model } }
    else if (p === `/api/agents/${agent.id}/gateway` || p === `/api/agents/${agent.id}/chat/readiness`) body = { available: true }
    else if (p === `/api/agents/${agent.id}/chat/archives`) body = { archives: [] }
    else if (p === `/api/agents/${agent.id}/chat/messages`) body = { messages }
    else if (p.endsWith('/turns/active')) body = { turns: [] }
    else if (p.includes('/models')) body = { models: [agent.model], modelsByProvider: { openai: { name: 'OpenAI', models: [agent.model] } } }
    else if (p === '/api/runtime/catalog' || p === '/api/integrations/runtimes') body = { runtimes: [{ id: 'openclaw', label: 'OpenClaw', enabled: true, models: [agent.model] }] }
    else if (p === '/api/plugins') body = { plugins: [] }
    else if (p === '/api/docs') body = { docs: [] }
    else if (p === '/api/communities') body = { communities: [] }
    else if (p === '/api/groups') body = { groups: [] }
    else if (p === '/api/workflows') body = { workflows: [] }
    else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
    else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
    else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
    else if (p.endsWith('/status')) body = { agents: [agent] }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { page, context, errors }
}

async function openChat(page, mode) {
  await page.addInitScript(([id, value]) => localStorage.setItem(`agent-chat-mode-${id}`, value), [agent.id, mode])
  await page.goto(`${base}/agents`)
  await page.getByText('Additional agents (1)', { exact: false }).click()
  await page.getByText(agent.name, { exact: true }).click()
  await page.getByRole('button', { name: 'Chat with agent', exact: true }).click()
  await page.getByRole('button', { name: 'Close chat', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Event transport', exact: true }).waitFor()
}

// Geometry of the wide table, its scroll box, the bubble, the message viewport, the dialog and its controls.
const measure = page => page.evaluate(() => {
  const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } }
  const tables = [...document.querySelectorAll('table')]
  const wide = tables.find(table => table.textContent.includes('Event transport'))
  const short = tables.find(table => table.textContent.includes('us-west'))
  const scrollBox = wide.parentElement
  const bubble = wide.closest('[class*="max-w-[80%]"]')
  let viewport = bubble.parentElement
  while (viewport && getComputedStyle(viewport).overflowY !== 'auto') viewport = viewport.parentElement
  const close = document.querySelector('button[aria-label="Close chat"]')
  const composer = document.querySelector('textarea')
  const pre = bubble.querySelector('pre')
  const before = scrollBox.scrollLeft
  scrollBox.scrollLeft = 160
  const scrolled = scrollBox.scrollLeft - before
  scrollBox.scrollLeft = before
  return {
    innerWidth, innerHeight, pageScrollWidth: document.documentElement.scrollWidth,
    scrollBoxOverflowX: getComputedStyle(scrollBox).overflowX, scrollBox: rect(scrollBox),
    scrollBoxScrollWidth: scrollBox.scrollWidth, scrollBoxClientWidth: scrollBox.clientWidth, scrolled,
    shortBox: { scrollWidth: short.parentElement.scrollWidth, clientWidth: short.parentElement.clientWidth },
    bubble: rect(bubble), viewport: rect(viewport), viewportScrollWidth: viewport.scrollWidth, viewportClientWidth: viewport.clientWidth,
    close: rect(close), composer: rect(composer), preOverflowX: pre ? getComputedStyle(pre).overflowX : null,
  }
})

function assertContained(m, label) {
  const edge = 1
  assert.match(m.scrollBoxOverflowX, /auto|scroll/, `${label}: the wide table sits in its own horizontal scroll box`)
  assert(m.scrollBoxScrollWidth > m.scrollBoxClientWidth, `${label}: the wide table is wider than its box, so it must scroll`)
  assert(m.scrolled > 0, `${label}: the table box scrolls horizontally`)
  assert(m.scrollBox.left >= m.bubble.left - edge && m.scrollBox.right <= m.bubble.right + edge, `${label}: table box ${JSON.stringify(m.scrollBox)} stays inside bubble ${JSON.stringify(m.bubble)}`)
  assert(m.bubble.right <= m.viewport.right + edge, `${label}: bubble ${m.bubble.right} stays inside the message viewport ${m.viewport.right}`)
  assert(m.viewportScrollWidth <= m.viewportClientWidth + edge, `${label}: message viewport has no horizontal overflow (${m.viewportScrollWidth} > ${m.viewportClientWidth})`)
  assert(m.pageScrollWidth <= m.innerWidth + edge, `${label}: page has no horizontal overflow (${m.pageScrollWidth} > ${m.innerWidth})`)
  assert(m.close.right <= m.innerWidth + edge && m.close.top >= -edge, `${label}: header Close button stays on screen`)
  assert(m.composer.left >= -edge && m.composer.right <= m.innerWidth + edge && m.composer.bottom <= m.innerHeight + edge, `${label}: composer stays on screen ${JSON.stringify(m.composer)}`)
  assert(m.shortBox.scrollWidth <= m.shortBox.clientWidth + edge, `${label}: a short table fits without scrolling`)
  assert.match(m.preOverflowX, /auto|scroll/, `${label}: code blocks keep their own horizontal scrolling`)
}

const cases = [
  { label: 'desktop modal', viewport: { width: 1440, height: 1000 }, mode: 'modal' },
  { label: 'desktop side panel', viewport: { width: 1440, height: 1000 }, mode: 'slide' },
  { label: 'mobile modal', viewport: { width: 390, height: 844 }, mode: 'modal' },
  { label: 'mobile side panel', viewport: { width: 390, height: 844 }, mode: 'slide' },
]
try {
  for (const { label, viewport, mode } of cases) {
    const { page, context, errors } = await newPage(viewport)
    try {
      await openChat(page, mode)
      const m = await measure(page)
      await page.screenshot({ path: path.join(artifactDir, `${label.replace(/\s+/g, '-')}.png`) })
      assertContained(m, label)
      assert.deepEqual(errors, [], `${label}: no page errors`)
      console.log(`PASS ${label}: table box ${Math.round(m.scrollBox.width)}px scrolls ${m.scrollBoxScrollWidth}px inside bubble; viewport and page do not overflow`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
