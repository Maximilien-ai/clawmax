// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
// Grid cards must let people inspect and change a community's or group's members, by mouse,
// keyboard and touch, without opening its chat; the saved membership survives a reload.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-communication-grid-members-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })

const community = { name: 'real-estate-council', displayName: 'Real Estate Council', description: 'Advisors who review listings', tags: ['advisory'], channels: [] }
const group = { name: 'pricing-desk', displayName: 'Pricing Desk', description: 'Pricing reviews', tags: [], channels: [], community: 'real-estate-council' }
const agentNames = { 'listing-analyst': 'Listing Analyst', 'mortgage-advisor': 'Mortgage Advisor', 'staging-designer': 'Staging Designer', 'tax-specialist': 'Tax Specialist' }
// Server-side membership: PATCH updates it and every later GET (including after reload) reflects it.
const memberships = { community: new Set(['listing-analyst', 'mortgage-advisor', 'staging-designer']), group: new Set(['listing-analyst']) }
const agents = () => Object.entries(agentNames).map(([id, name]) => ({
  id, name, status: id === 'tax-specialist' ? 'offline' : 'online', workspacePath: `/tmp/grid/AGENTS/${id}`, tags: [], skills: [], model: 'openai/gpt-5', runtime: 'openclaw',
  communities: memberships.community.has(id) ? [community] : [],
  groups: memberships.group.has(id) ? [group] : [],
}))
const workspace = { id: 'grid-browser', name: 'Grid Browser Workspace', path: '/tmp/grid', agentCount: 4, isActive: true, tags: [] }
const patches = []
const chatRequests = []

async function newPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options })
  await context.addInitScript(() => localStorage.setItem('communication-view-mode', 'grid'))
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.stack))
  await page.route('**/api/**', async route => {
    const request = route.request()
    const p = new URL(request.url()).pathname
    let body = {}
    if (request.method() === 'PATCH' && p.endsWith('/members')) {
      const kind = p.startsWith('/api/communities/') ? 'community' : 'group'
      const { members } = request.postDataJSON()
      patches.push({ kind, members })
      memberships[kind] = new Set(members)
      body = { success: true }
    } else if (/\/api\/(communities|groups)\/[^/]+\/messages/.test(p)) {
      chatRequests.push(p)
      body = { messages: [] }
    } else if (p === '/api/auth/config') body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
    else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'grid', login: 'grid', name: 'Grid Browser', role: 'admin' } }
    else if (p === '/api/health/live') body = { alive: true }
    else if (p === '/api/system') body = { version: '2.0.0-test', hostname: 'browser-fixture', machineName: 'Grid', agentCount: 4, onlineCount: 3, workspacePath: workspace.path }
    else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
    else if (p === '/api/workspaces') body = { workspaces: [workspace] }
    else if (p === '/api/workspaces/active') body = { workspace }
    else if (p === '/api/agents') body = { agents: agents(), total: 4, hasMore: false }
    else if (p === '/api/communities') body = { communities: [community] }
    else if (p === '/api/groups') body = { groups: [group] }
    else if (p === '/api/message-counts') body = {}
    else if (p === '/api/plugins') body = { plugins: [] }
    else if (p === '/api/docs') body = { docs: [] }
    else if (p === '/api/workflows') body = { workflows: [] }
    else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
    else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
    else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
    else if (p.endsWith('/status')) body = { agents: agents() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return { page, context, errors }
}

const membersButton = (page, name) => page.getByRole('button', { name: new RegExp(`^Members of ${name}`) })
const dialog = page => page.getByRole('dialog', { name: 'Manage Members' })
// Names and IDs of the agents currently checked as members in the open dialog.
const checkedMembers = page => dialog(page).locator('input[type="checkbox"]:checked').evaluateAll(boxes => boxes.map(box => box.closest('div[class*="rounded"]').textContent.trim()).sort())

try {
  // Desktop, mouse: the count opens the member list, not the chat; Cancel keeps membership.
  {
    const { page, context, errors } = await newPage({ width: 1440, height: 1000 })
    await page.goto(`${base}/communication`)
    const trigger = membersButton(page, 'Real Estate Council')
    await trigger.waitFor()
    assert.match(await trigger.innerText(), /^3 members\s*· 3 online$/)
    await trigger.click()
    await dialog(page).waitFor()
    assert.deepEqual(await checkedMembers(page), ['Listing Analyst(listing-analyst)', 'Mortgage Advisor(mortgage-advisor)', 'Staging Designer(staging-designer)'])
    assert.deepEqual(chatRequests, [], 'Inspecting members never opens the chat')
    await page.screenshot({ path: path.join(artifactDir, 'members-desktop.png') })
    await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog(page).waitFor({ state: 'hidden' })
    assert.deepEqual(patches, [], 'Cancel saves nothing')
    assert(await trigger.evaluate(element => element === document.activeElement), 'Cancel returns focus to the members button')
    console.log('PASS desktop: member count opens names and IDs without opening chat; Cancel saves nothing')

    // Keyboard: focus moves into the dialog, a member can be added and Save persists it.
    await trigger.focus()
    await page.keyboard.press('Enter')
    await dialog(page).waitFor()
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('placeholder')), 'Search agents by name or ID...')
    await page.keyboard.type('tax')
    await dialog(page).getByText('Tax Specialist', { exact: true }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await dialog(page).waitFor({ state: 'hidden' })
    assert.deepEqual(patches.at(-1), { kind: 'community', members: ['listing-analyst', 'mortgage-advisor', 'staging-designer', 'tax-specialist'] })
    await membersButton(page, 'Real Estate Council').filter({ hasText: '4 members' }).waitFor()
    console.log('PASS keyboard: Enter opens the dialog with focus inside; Save persists the change')

    // Escape closes without saving and returns focus.
    await trigger.focus()
    await page.keyboard.press('Enter')
    await dialog(page).waitFor()
    await page.keyboard.press('Escape')
    await dialog(page).waitFor({ state: 'hidden' })
    assert.equal(patches.length, 1, 'Escape saves nothing')
    assert(await trigger.evaluate(element => element === document.activeElement), 'Escape returns focus to the members button')

    // Reload: membership comes back from the server; tags, chat and delete controls are unchanged.
    await page.reload()
    await membersButton(page, 'Real Estate Council').filter({ hasText: '4 members' }).waitFor()
    await membersButton(page, 'Real Estate Council').click()
    assert.deepEqual(await checkedMembers(page), ['Listing Analyst(listing-analyst)', 'Mortgage Advisor(mortgage-advisor)', 'Staging Designer(staging-designer)', 'Tax Specialist(tax-specialist)'])
    await page.keyboard.press('Escape')
    const card = membersButton(page, 'Pricing Desk').locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    assert.match(await membersButton(page, 'Pricing Desk').innerText(), /^1 member\s*· 1 online$/)
    await Promise.all([
      page.waitForRequest(request => request.url().includes('/api/groups/pricing-desk/messages')),
      card.locator('button[title="Open chat"]').click(),
    ])
    console.log('PASS reload keeps the saved membership; Open chat still opens the chat')
    assert.deepEqual(errors, [])
    await context.close()
  }

  // Phone, touch: the members control is reachable and the dialog fits the screen.
  {
    const { page, context, errors } = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true })
    await page.goto(`${base}/communication`)
    const trigger = membersButton(page, 'Pricing Desk')
    await trigger.waitFor()
    await trigger.tap()
    await dialog(page).waitFor()
    assert.deepEqual(await checkedMembers(page), ['Listing Analyst(listing-analyst)'])
    const box = await dialog(page).boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, `dialog fits the phone screen ${JSON.stringify(box)}`)
    await page.screenshot({ path: path.join(artifactDir, 'members-mobile.png') })
    await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).tap()
    await dialog(page).waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [])
    console.log('PASS phone: tapping the member count opens a dialog that fits the screen')
    await context.close()
  }
} finally {
  await browser.close()
}
