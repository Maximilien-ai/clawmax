// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
// Manage Members from a community or group card, by keyboard: Escape and Cancel close without saving,
// Escape never reaches the page's own Escape handlers, Tab stays in the dialog, focus returns to the
// card's members button, and Save still persists across a reload. Desktop and phone widths.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-communication-members-keyboard-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })

const community = { name: 'real-estate-council', displayName: 'Real Estate Council', description: 'Advisors who review listings', tags: [], channels: [] }
const group = { name: 'pricing-desk', displayName: 'Pricing Desk', description: 'Pricing reviews', tags: [], channels: [], community: 'real-estate-council' }
const agentNames = { 'listing-analyst': 'Listing Analyst', 'mortgage-advisor': 'Mortgage Advisor', 'tax-specialist': 'Tax Specialist' }
const workspace = { id: 'members-keyboard', name: 'Members Keyboard Workspace', path: '/tmp/members-keyboard', agentCount: 3, isActive: true, tags: [] }

async function newPage(viewport, options = {}) {
  // Server-side membership: PATCH updates it and every later GET (including after reload) reflects it.
  const state = { memberships: { community: new Set(['listing-analyst', 'mortgage-advisor']), group: new Set(['listing-analyst']) }, patches: [], errors: [] }
  const agents = () => Object.entries(agentNames).map(([id, name]) => ({
    id, name, status: 'online', workspacePath: `/tmp/members-keyboard/AGENTS/${id}`, tags: [], skills: [], model: 'openai/gpt-5.4-mini', runtime: 'openclaw',
    communities: state.memberships.community.has(id) ? [community] : [],
    groups: state.memberships.group.has(id) ? [group] : [],
  }))
  const context = await browser.newContext({ viewport, ...options })
  await context.addInitScript(() => {
    localStorage.setItem('communication-view-mode', 'grid')
    for (let v = 1; v <= 10; v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed')
    // Stands in for the page's document-level Escape handlers (popovers, menus, search).
    window.pageEscapes = 0
    document.addEventListener('keydown', event => { if (event.key === 'Escape') window.pageEscapes++ })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => state.errors.push(error.stack))
  await page.route('**/api/**', async route => {
    const request = route.request()
    const p = new URL(request.url()).pathname
    let body = {}
    if (request.method() === 'PATCH' && p.endsWith('/members')) {
      const kind = p.startsWith('/api/communities/') ? 'community' : 'group'
      const { members } = request.postDataJSON()
      state.patches.push({ kind, members })
      state.memberships[kind] = new Set(members)
      body = { success: true }
    } else if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
    else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'kb', login: 'kb', name: 'Keyboard', role: 'admin' } }
    else if (p === '/api/health/live') body = { alive: true }
    else if (p === '/api/system') body = { version: '2.0.0-test', hostname: 'browser-fixture', agentCount: 3, onlineCount: 3, workspacePath: workspace.path }
    else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
    else if (p === '/api/workspaces') body = { workspaces: [workspace] }
    else if (p === '/api/workspaces/active') body = { workspace }
    else if (p === '/api/agents') body = { agents: agents(), total: 3, hasMore: false }
    else if (p === '/api/communities') body = { communities: [community] }
    else if (p === '/api/groups') body = { groups: [group] }
    else if (p === '/api/plugins') body = { plugins: [] }
    else if (p === '/api/docs') body = { docs: [] }
    else if (p === '/api/workflows') body = { workflows: [] }
    else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
    else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
    else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
    else if (p.endsWith('/status')) body = { agents: agents() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { page, context, state }
}

const dialog = page => page.getByRole('dialog', { name: 'Manage Members' })
const checkedMembers = page => dialog(page).locator('input[type="checkbox"]:checked').evaluateAll(boxes => boxes.map(box => box.closest('div[class*="rounded"]').textContent.trim()).sort())
const isFocused = locator => locator.evaluate(element => element === document.activeElement)
const focusInDialog = page => dialog(page).evaluate(element => element.contains(document.activeElement))
async function openByKeyboard(page, trigger) {
  await trigger.focus()
  await page.keyboard.press('Enter')
  await dialog(page).waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('placeholder')), 'Search agents by name or ID...', 'Focus starts in the search box')
}

try {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const { page, context, state } = await newPage({ width, height }, width < 500 ? { hasTouch: true, isMobile: true } : {})
    await page.goto(`${base}/communication`)
    for (const [kind, channel, add] of [['community', community, 'Tax Specialist'], ['group', group, 'Mortgage Advisor']]) {
      const label = `${width}px ${kind}`
      const trigger = page.getByRole('button', { name: `View members of ${channel.displayName}`, exact: true })
      await trigger.waitFor()
      await openByKeyboard(page, trigger)
      const before = await checkedMembers(page)
      // Recorded before any save, so the Save check below does not compare the PATCH with itself.
      const addId = Object.keys(agentNames).find(id => agentNames[id] === add)
      const expected = [...state.memberships[kind], addId].sort()

      // Escape: a changed selection is discarded, nothing is saved, the page never sees the key.
      await dialog(page).getByText(add, { exact: true }).click()
      const escapesBefore = await page.evaluate(() => window.pageEscapes)
      await page.keyboard.press('Escape')
      await dialog(page).waitFor({ state: 'hidden' })
      assert.deepEqual(state.patches, [], `${label}: Escape saves nothing`)
      assert.equal(await page.evaluate(() => window.pageEscapes), escapesBefore, `${label}: Escape must not reach page-level handlers`)
      assert(await isFocused(trigger), `${label}: Escape returns focus to the members button`)
      assert.equal(await page.getByRole('dialog').count(), 0, `${label}: no other dialog opened or remains`)
      await page.getByRole('heading', { name: 'Communications' }).first().waitFor()

      // Tab and Shift-Tab wrap inside the dialog.
      await openByKeyboard(page, trigger)
      assert.deepEqual(await checkedMembers(page), before, `${label}: the discarded change is not shown again`)
      await page.keyboard.press('Shift+Tab')
      assert(await isFocused(dialog(page).getByRole('button', { name: 'Save', exact: true })), `${label}: Shift-Tab from the first control wraps to Save`)
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('placeholder')), 'Search agents by name or ID...', `${label}: Tab from Save wraps to the search box`)
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab')
        assert(await focusInDialog(page), `${label}: Tab ${i + 1} stays in the dialog`)
      }

      // Cancel: also discards and returns focus.
      await dialog(page).getByText(add, { exact: true }).click()
      await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
      await dialog(page).waitFor({ state: 'hidden' })
      assert.deepEqual(state.patches, [], `${label}: Cancel saves nothing`)
      assert(await isFocused(trigger), `${label}: Cancel returns focus to the members button`)

      // Search, select and Save persist; a reload shows the saved membership.
      await openByKeyboard(page, trigger)
      await page.keyboard.type(add.split(' ')[0].toLowerCase())
      await dialog(page).getByText(add, { exact: true }).click()
      await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
      await dialog(page).waitFor({ state: 'hidden' })
      assert.equal(state.patches.length, 1, `${label}: Save sends one update`)
      assert.deepEqual([...state.patches[0].members].sort(), expected, `${label}: Save keeps the existing members and adds the selected agent`)
      await page.reload()
      await trigger.waitFor()
      await openByKeyboard(page, trigger)
      assert.equal((await checkedMembers(page)).length, expected.length, `${label}: the saved membership survives a reload`)
      await page.keyboard.press('Escape')
      await dialog(page).waitFor({ state: 'hidden' })
      if (width === 390) {
        await trigger.tap()
        await dialog(page).waitFor()
        const box = await dialog(page).boundingBox()
        assert(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, `${label}: the dialog fits the phone screen ${JSON.stringify(box)}`)
        await page.keyboard.press('Escape')
        await dialog(page).waitFor({ state: 'hidden' })
      }
      state.patches.length = 0
      assert.deepEqual(state.errors, [])
      console.log(`PASS ${label}: Escape/Cancel discard without saving or reaching the page, Tab wraps, focus returns, Save persists`)
    }
    await page.screenshot({ path: path.join(artifactDir, `members-keyboard-${width}.png`) })
    await context.close()
  }
} finally {
  await browser.close()
}
