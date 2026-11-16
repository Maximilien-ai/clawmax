// Start Vite first. Run with PLAYWRIGHT_MODULE pointing to an installed playwright entry.
// Synthetic API fixtures for an empty workspace, so the first-run tour opens; nothing is saved.
// Step 10's card must stay inside the viewport with Back and Finish reachable, scrolling its
// description when the viewport is shorter than the card. Steps 1-9 keep the original placement.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'

const workspace = { id: 'tour-fixture', name: 'Tour Fixture', path: '/tmp/tour-fixture', agentCount: 0, isActive: true, tags: [] }
const TARGETS = ['workspace-switcher', 'byok', 'notifications', 'nav-builder', 'nav-agents', 'nav-workflows', 'nav-communication', 'nav-skills', 'nav-templates', 'nav-docs']
// Browser zoom shrinks the CSS viewport by the zoom factor while device pixels scale up.
const CASES = [
  { width: 1440, height: 900, zoom: 1 },
  { width: 1024, height: 600, zoom: 1 },
  { width: 390, height: 740, zoom: 1 },
  { width: 375, height: 667, zoom: 1 },
  { width: 1440, height: 900, zoom: 1.25 },
  { width: 1440, height: 900, zoom: 1.5 },
  { width: 1024, height: 600, zoom: 2 },
]

// The placement steps 1-9 have always used, sized for a 280px card.
function originalPlacement(target, vw, vh) {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const width = 360
  const placeBelow = target.top < 150
  const left = placeBelow
    ? clamp(target.left, 24, vw - width - 24)
    : target.right < vw * 0.6 ? clamp(target.right + 20, 24, vw - width - 24) : clamp(target.left - width - 20, 24, vw - width - 24)
  const top = placeBelow ? clamp(target.bottom + 20, 24, vh - 280) : clamp(target.top - 8, 24, vh - 280)
  return { left, top, width }
}

try {
  for (const { width, height, zoom } of CASES) {
    const viewport = { width: Math.round(width / zoom), height: Math.round(height / zoom) }
    const label = `${width}x${height}@${zoom * 100}%`
    const context = await browser.newContext({ viewport, deviceScaleFactor: zoom })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.addInitScript(() => { window.EventSource = class { close() {} } })
    await page.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname
      let body = {}
      if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
      else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture', name: 'Fixture', role: 'admin' } }
      else if (p === '/api/system') body = { version: 'fixture', agentCount: 0, onlineCount: 0, workspacePath: workspace.path }
      else if (p === '/api/workspaces') body = { workspaces: [workspace] }
      else if (p === '/api/workspaces/active') body = { workspace }
      else if (p === '/api/agents') body = { agents: [], total: 0, hasMore: false }
      else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
      else if (p === '/api/agents/turns/active') body = { turns: [] }
      else if (p === '/api/templates') body = { agents: [], teams: [] }
      else if (p === '/api/plugins') body = { plugins: [] }
      else if (p === '/api/groups') body = { groups: [] }
      else if (p === '/api/communities') body = { communities: [] }
      else if (p === '/api/workflows') body = { workflows: [] }
      else if (p === '/api/skills') body = { skills: [] }
      else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
    await page.goto(`${base}/`)
    const card = page.locator('div.pointer-events-auto.absolute.z-10').filter({ hasText: 'Workspace Tour' })
    await card.waitFor()

    const measure = (target) => page.evaluate((selector) => {
      const el = [...document.querySelectorAll('div.pointer-events-auto.absolute.z-10')].find((node) => node.textContent.includes('Workspace Tour'))
      const box = (node) => { const { top, bottom, left, right, width } = node.getBoundingClientRect(); return { top, bottom, left, right, width } }
      const button = (text) => [...el.querySelectorAll('button')].find((node) => node.textContent.trim() === text)
      const description = el.querySelector('p')
      return {
        counter: el.querySelector('span').textContent.trim(),
        card: box(el), target: box(document.querySelector(selector)), maxHeight: el.style.maxHeight,
        back: box(button('Back')), forward: box(button('Finish') || button('Next')),
        description: { clientHeight: description.clientHeight, scrollHeight: description.scrollHeight, scrollTop: description.scrollTop },
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }
    }, `[data-tour="${target}"]`)

    for (let index = 0; index < TARGETS.length; index++) {
      await page.waitForTimeout(200)
      const geometry = await measure(TARGETS[index])
      assert.equal(geometry.counter, `${index + 1} / ${TARGETS.length}`, `${label}: wrong step shown`)
      assert(!geometry.horizontalOverflow, `${label} step ${index + 1}: page overflows horizontally`)
      if (index < TARGETS.length - 1) {
        // Steps 1-9: same rendered position as the original placement, and no height cap.
        const expected = originalPlacement(geometry.target, geometry.viewport.width, geometry.viewport.height)
        for (const key of ['left', 'top', 'width']) {
          assert(Math.abs(geometry.card[key] - expected[key]) < 1, `${label} step ${index + 1}: card ${key} ${geometry.card[key]} moved from ${expected[key]}`)
        }
        assert.equal(geometry.maxHeight, '', `${label} step ${index + 1}: card gained a height cap`)
        await card.getByRole('button', { name: 'Next', exact: true }).click()
        continue
      }
      // Step 10: the whole card, Back and Finish inside the viewport.
      const { card: box, back, forward, viewport: vp, description } = geometry
      assert(box.top >= 0 && box.bottom <= vp.height + 0.5, `${label} step 10: card ${box.top}-${box.bottom} runs past the ${vp.height}px viewport`)
      for (const [name, rect] of [['Back', back], ['Finish', forward]]) {
        assert(rect.top >= box.top && rect.bottom <= Math.min(box.bottom, vp.height) + 0.5, `${label} step 10: ${name} ${rect.top}-${rect.bottom} is outside the visible card`)
      }
      if (description.scrollHeight > description.clientHeight + 1) {
        // Too short for the card: the description scrolls while the buttons stay put.
        await card.locator('p').hover()
        await page.mouse.wheel(0, 400)
        await page.waitForTimeout(200)
        const scrolled = await measure(TARGETS[index])
        assert(scrolled.description.scrollTop > 0, `${label} step 10: description does not scroll`)
        assert.deepEqual(scrolled.forward, forward, `${label} step 10: Finish moved while the description scrolled`)
      }
    }
    await card.getByRole('button', { name: 'Finish', exact: true }).click()
    await card.waitFor({ state: 'detached' })
    const stored = await page.evaluate((key) => localStorage.getItem(key), `clawmax-workspace-tour:${workspace.path}:v1`)
    assert.equal(stored, 'completed', `${label}: Finish did not complete the tour`)
    await context.close()
  }
  console.log(`workspace-tour-final-step-browser.test.mjs: ${CASES.length} viewports passed`)
} finally {
  await browser.close()
}
