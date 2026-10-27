// Synthetic API fixtures: no agents are changed and no menu action is invoked.
// The agent actions menu must open against its trigger, stay inside the viewport, scroll inside
// itself when taller than the room available, follow the trigger while the page scrolls, and
// close on Escape or an outside click.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'

const agents = Array.from({ length: 18 }, (_, index) => ({
  id: `fleet-${String(index + 1).padStart(2, '0')}`, name: `Fleet Agent ${index + 1}`, status: 'offline', runtime: 'openclaw',
  model: 'openai/gpt-5.4-mini', workspacePath: `/tmp/fleet/AGENTS/fleet-${index + 1}`, tags: ['fleet'], communities: [], groups: [], skills: [],
}))
const workspace = { id: 'menu-fixture', name: 'Menu Fixture', path: '/tmp/fleet', agentCount: agents.length, isActive: true, tags: [] }

// Each view's trigger and the label of the last action in its menu.
const VIEWS = [
  { mode: 'grid', deleteLabel: 'Delete agent' },
  { mode: 'list', deleteLabel: 'Delete agent' },
  { mode: 'table', deleteLabel: 'Delete' },
]
const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1024, height: 600 }, { width: 390, height: 740 }]

try {
  for (const viewport of VIEWPORTS) {
    for (const { mode, deleteLabel } of VIEWS) {
      const label = `${viewport.width}x${viewport.height} ${mode}`
      const page = await browser.newPage({ viewport })
      page.setDefaultTimeout(10000)
      await page.addInitScript((viewMode) => {
        window.EventSource = class { close() {} }
        for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
        localStorage.setItem('agents-view-mode', viewMode)
      }, mode)
      await page.route('**/api/**', async route => {
        const p = new URL(route.request().url()).pathname
        let body = {}
        if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
        else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture', name: 'Fixture', role: 'admin' } }
        else if (p === '/api/system') body = { version: 'fixture', agentCount: agents.length, onlineCount: 0, workspacePath: workspace.path }
        else if (p === '/api/workspaces') body = { workspaces: [workspace] }
        else if (p === '/api/workspaces/active') body = { workspace }
        else if (p === '/api/agents') body = { agents, total: agents.length, hasMore: false }
        else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
        else if (p === '/api/agents/turns/active') body = { turns: [] }
        else if (p.includes('/models')) body = { models: ['openai/gpt-5.4-mini'], modelsByProvider: { openai: { name: 'OpenAI', models: ['openai/gpt-5.4-mini'] } } }
        else if (p === '/api/runtime/catalog' || p === '/api/integrations/runtimes') body = { runtimes: [{ id: 'openclaw', label: 'OpenClaw', enabled: true, models: ['openai/gpt-5.4-mini'] }] }
        else if (p === '/api/docs') body = { docs: [] }
        else if (p.endsWith('/status')) body = { agents }
        else if (p === '/api/plugins') body = { plugins: [] }
        else if (p === '/api/groups') body = { groups: [] }
        else if (p === '/api/communities') body = { communities: [] }
        else if (p === '/api/workflows') body = { workflows: [] }
        else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
        else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
        else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      })
      // After the catch-all so it takes precedence: the app mounts only once the API reports live.
      await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
      await page.goto(`${base}/agents`)
      const triggers = page.getByTitle('More actions', { exact: true })
      await page.getByText('Fleet Agent 1', { exact: true }).first().waitFor()
      // Views paginate, so only the first page of agents is rendered.
      const count = await triggers.count()
      assert(count >= 10, `${label}: expected one trigger per rendered agent, found ${count}`)

      // Geometry of the open menu: the nearest bordered, shadowed container of its delete action.
      const measure = (trigger) => trigger.evaluate((button, text) => {
        const item = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim().endsWith(text) && candidate.getClientRects().length)
        const menu = item?.closest('.shadow-lg')
        if (!item || !menu) return null
        const r = (element) => { const { top, bottom, left, right } = element.getBoundingClientRect(); return { top, bottom, left, right } }
        return { menu: r(menu), trigger: r(button), scrollable: menu.scrollHeight > menu.clientHeight + 1, viewport: { width: innerWidth, height: innerHeight } }
      }, deleteLabel)
      const assertPlaced = (geometry, where) => {
        assert(geometry, `${label} ${where}: menu did not open`)
        const { menu, trigger, viewport: vp } = geometry
        assert(menu.top >= 0 && menu.bottom <= vp.height + 0.5, `${label} ${where}: menu runs off the viewport vertically ${JSON.stringify(menu)} in ${vp.height}`)
        assert(menu.left >= 0 && menu.right <= vp.width + 0.5, `${label} ${where}: menu runs off the viewport horizontally ${JSON.stringify(menu)} in ${vp.width}`)
        const gap = Math.min(Math.abs(menu.top - trigger.bottom), Math.abs(trigger.top - menu.bottom))
        assert(gap <= 12, `${label} ${where}: menu is detached from its trigger (gap ${gap}px) ${JSON.stringify(geometry)}`)
      }
      // The delete action must be reachable: scrolled into the menu's view, it is the element hit at its centre.
      const assertDeleteReachable = async (where) => {
        const deleteButton = page.getByRole('button', { name: new RegExp(`^(${deleteLabel} )?${deleteLabel}$`) })
        await deleteButton.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
        const hit = await deleteButton.evaluate((element) => {
          const { left, right, top, bottom } = element.getBoundingClientRect()
          const target = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
          return { inView: top >= 0 && bottom <= innerHeight, reachable: !!target && element.contains(target) }
        })
        assert(hit.inView && hit.reachable, `${label} ${where}: "${deleteLabel}" cannot be reached ${JSON.stringify(hit)}`)
      }

      for (const [where, index, block] of [['top', 0, 'start'], ['middle', Math.floor(count / 2), 'center'], ['bottom', count - 1, 'end']]) {
        const trigger = triggers.nth(index)
        await trigger.evaluate((element, position) => element.scrollIntoView({ block: position }), block)
        await trigger.click()
        assertPlaced(await measure(trigger), where)
        await assertDeleteReachable(where)

        // Scrolling the page while the menu is open keeps it attached to the trigger.
        await trigger.evaluate((element) => {
          let node = element.parentElement
          while (node && !(node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY))) node = node.parentElement
          ;(node || document.scrollingElement).scrollBy(0, 40)
        })
        await page.waitForFunction(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))))
        const afterScroll = await measure(trigger)
        if (afterScroll && afterScroll.trigger.bottom > 0 && afterScroll.trigger.top < afterScroll.viewport.height) assertPlaced(afterScroll, `${where} after scrolling`)

        if (mode !== 'table') {
          await page.getByRole('button', { name: /Maintain actions/ }).click()
          assertPlaced(await measure(trigger), `${where} Maintain view`)
          await assertDeleteReachable(`${where} Maintain view`)
        }

        await page.keyboard.press('Escape')
        assert.equal(await measure(trigger), null, `${label} ${where}: Escape closes the menu`)
        assert(await trigger.evaluate((element) => document.activeElement === element), `${label} ${where}: focus returns to the trigger after Escape`)
      }

      const first = triggers.first()
      await first.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await first.click()
      assert(await measure(first), `${label}: menu reopens`)
      await page.mouse.click(4, viewport.height - 4)
      assert.equal(await measure(first), null, `${label}: an outside click closes the menu`)
      console.log(`PASS ${label}: menu stays in the viewport, attached and scrollable at top, middle and bottom; Escape and outside click close it`)
      await page.close()
    }
  }
} finally { await browser.close() }
