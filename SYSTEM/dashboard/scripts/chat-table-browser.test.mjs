const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
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
  else if (p === '/api/agents/rc94-probe/chat/messages') body = { messages: [{ id: 'rc94-reply', role: 'assistant', content: '| ' + Array(14).fill('LongColumnHeading').join(' | ') + ' |\n| ' + Array(14).fill('---').join(' | ') + ' |\n| ' + Array(14).fill('LongUnbrokenCellValue').join(' | ') + ' |\n\nExample JSON:\n```json\n{"error":"Connection error.","path":"/tmp/example.ts"}\n```\n\n```text\n+-------+\n| Agent |\n+-------+\n```', timestamp: 1720000000000 }] }
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
  if (Object.keys(body).length === 0) console.log('unmocked', p)
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
})
try {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {value:{writeText: async text => {window.__copied = text}}}))
  await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
  await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'}/agents`)
  await page.getByText('Additional agents (1)', {exact:false}).click()
  await page.getByText(agent.name, {exact:true}).click()
  assert(await page.getByRole('button', {name:'Keep open',exact:true}).isVisible())
  await page.getByRole('button', {name:'Chat with agent',exact:true}).click()
  const pin = page.getByRole('button', {name:'Keep open',exact:true}).last()
  assert(await pin.isVisible())
  await page.getByRole('button',{name:'Expand message box',exact:true}).click()
  assert.equal(await page.getByRole('textbox',{name:'Message agent'}).getAttribute('rows'),'4')
  await page.getByRole('button',{name:'Collapse message box',exact:true}).click()
  assert.equal(await page.getByRole('textbox',{name:'Message agent'}).getAttribute('rows'),'1')
  await page.getByRole('button',{name:'Switch to slide',exact:true}).click()
  await pin.click()
  assert.equal(await pin.getAttribute('aria-pressed'),'true')
  await page.mouse.click(20,400)
  assert(await page.getByRole('textbox',{name:'Message agent'}).isVisible())
  await pin.click()
  assert.equal(await pin.getAttribute('aria-pressed'),'false')
  await page.getByRole('button',{name:'Switch to modal',exact:true}).click()
  const code = page.getByRole('button', {name:'Copy json code',exact:true})
  await code.click()
  assert.equal(await page.evaluate(()=>window.__copied), '{"error":"Connection error.","path":"/tmp/example.ts"}')
  assert.equal(await page.getByText('Could not connect', {exact:false}).count(),0)
  const table = page.getByRole('region', {name:'Scrollable table'})
  await table.waitFor()
  assert(await table.evaluate(el=>el.scrollWidth > el.clientWidth))
  await page.screenshot({path:'/private/tmp/rc96-chat-desktop.png',animations:'disabled'})
  await page.setViewportSize({width:390,height:844})
  await page.locator('textarea').waitFor({state:'visible'})
  await page.screenshot({path:'/private/tmp/rc96-chat-mobile.png',animations:'disabled'})
  assert(await table.evaluate(el=>el.scrollWidth > el.clientWidth && el.getBoundingClientRect().right <= innerWidth))
  assert(await code.isVisible())
  assert(await page.getByRole('button',{name:'Expand message box',exact:true}).isVisible())
  assert(await page.getByRole('button',{name:'Keep open',exact:true}).last().isVisible())
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true)
  console.log('PASS details/chat pins, expanded-chat outside-click persistence, composer chevron expansion/collapse, fenced JSON Copy and desktop/mobile bounds',errors)
} catch(error) {
  console.log((await page.locator('body').ariaSnapshot()).slice(-8000))
  await page.screenshot({path:'/private/tmp/rc95-chat-error.png'})
  throw error
} finally {await browser.close()}
