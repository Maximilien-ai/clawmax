// Real Details panel and editor, synthetic API only: no private agent data or live mutations.
// Agent Details offers Edit Agent Config itself. The editor opens above the open panel, which keeps
// its pin, scroll position and contents; Save shows the new model in place, Cancel keeps the old one.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-agent-details-edit-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const todos = Array.from({ length: 40 }, (_, i) => `- [ ] Follow up on listing review ${i + 1}`).join('\n')

async function openPage(width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  page.setDefaultTimeout(15000)
  const state = { savedModel: 'openai/gpt-5.4-mini', modelWrites: [], configWrites: 0, errors: [] }
  page.on('pageerror', error => state.errors.push(error.message))
  await page.addInitScript(() => {
    window.EventSource = class { close() {} }
    for (let i = 1; i <= 10; i++) localStorage.setItem(`clawmax-workspace-tour:disable:v${i}`, 'dismissed')
  })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const p = new URL(request.url()).pathname
    let json = {}
    if (request.method() === 'PUT') state.configWrites++
    if (p === '/api/agents/atlas/model' && request.method() === 'PATCH') { state.savedModel = request.postDataJSON().model; state.modelWrites.push(state.savedModel); json = { ok: true } }
    else if (p === '/api/agents/atlas/activity') json = { recentFiles: [], todos, identity: '# Atlas\nReal-estate advisor.', skills: [], liveConfig: { model: state.savedModel, workspace: '/fixture/AGENTS/atlas', agentDir: '/fixture/agent' } }
    else if (p === '/api/auth/config') json = { authDisabled: true }
    else if (p === '/api/auth/me') json = { authenticated: false }
    else if (p === '/api/workspaces') json = { workspaces: [] }
    else if (p === '/api/plugins') json = { plugins: [] }
    else if (p === '/api/system') json = { version: 'fixture', agentCount: 1, onlineCount: 0 }
    else if (p === '/api/agents') json = { total: 1, agents: [{ id: 'atlas', name: 'Atlas', status: 'offline', workspacePath: '/fixture/AGENTS/atlas', tags: [], groups: [], communities: [], skills: [] }] }
    else if (p === '/api/agents/atlas/config') json = { identity: '- **Name:** atlas', soul: '# Soul\nKeep existing instructions.', tools: '' }
    else if (p === '/api/agents/atlas/identity') json = { metadata: {}, liveConfig: { model: state.savedModel } }
    else if (p === '/api/agents/models/discover') json = { models: ['openai/gpt-5.4-mini', 'openai/gpt-5.5'], modelsByProvider: { openai: { name: 'OpenAI', models: ['openai/gpt-5.4-mini', 'openai/gpt-5.5'] } } }
    else if (p === '/api/agents/validate-config') json = { valid: true, errors: [], warnings: [] }
    await route.fulfill({ json })
  })
  // After the catch-all so it takes precedence: the app mounts only once the API reports live.
  await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
  await page.goto(`${base}/agents`)
  return { page, state }
}

const detailsClose = page => page.getByRole('button', { name: 'Close details (Esc)', exact: true })
const detailsPanel = page => page.locator('aside').filter({ has: detailsClose(page) })
const editFromDetails = page => page.getByRole('button', { name: 'Edit agent config', exact: true })
const editor = page => page.getByRole('dialog', { name: 'Edit Agent Config' })
const headerModel = page => detailsPanel(page).locator('span.font-mono').filter({ hasText: /^openai\// }).first()
const bodyScroll = page => detailsPanel(page).evaluate(aside => [...aside.querySelectorAll('div')].find(div => getComputedStyle(div).overflowY === 'auto').scrollTop)

async function openDetails(page) {
  await page.getByText('Additional agents (1)', { exact: false }).click()
  await page.getByText('Atlas', { exact: true }).first().click()
  await detailsClose(page).waitFor()
  await page.getByText('Follow up on listing review 40').waitFor()
  assert.equal(await headerModel(page).innerText(), 'openai/gpt-5.4-mini')
}

async function scrollDetails(page, top) {
  await detailsPanel(page).evaluate((aside, value) => {
    const body = [...aside.querySelectorAll('div')].find(div => getComputedStyle(div).overflowY === 'auto')
    body.scrollTop = value
  }, top)
  const scrolled = await bodyScroll(page)
  assert(scrolled > 100, `Details body scrolls (scrollTop ${scrolled})`)
  return scrolled
}

async function openEditor(page) {
  await editFromDetails(page).click()
  await editor(page).locator('select').first().waitFor()
  assert(await detailsClose(page).isVisible(), 'Details stays open under the editor')
  assert(await editor(page).evaluate(dialog => dialog.contains(document.activeElement)), 'Focus moves into the editor')
}

try {
  // Desktop, pinned: outside clicks keep both open, Escape and Cancel close only the editor.
  {
    const { page, state } = await openPage(1440)
    await openDetails(page)
    const pin = page.getByRole('button', { name: 'Keep open', exact: true })
    await pin.click()
    assert.equal(await pin.getAttribute('aria-pressed'), 'true')
    const scrolled = await scrollDetails(page, 260)

    await openEditor(page)
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      assert(await editor(page).evaluate(dialog => dialog.contains(document.activeElement)), 'Tab stays inside the editor')
    }
    await page.mouse.click(8, 450)
    assert(await editor(page).isVisible(), 'A pinned editor ignores an outside click')
    await page.keyboard.press('Escape')
    await editor(page).waitFor({ state: 'hidden' })
    assert(await detailsClose(page).isVisible(), 'Escape closes only the editor')
    assert(await editFromDetails(page).evaluate(button => button === document.activeElement), 'Focus returns to the Details edit action')
    console.log('PASS 1440px: editor opens from Details above the pinned panel; focus contained; Escape closes only the editor')

    await openEditor(page)
    await editor(page).locator('select').first().selectOption('openai/gpt-5.5')
    await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await editor(page).waitFor({ state: 'hidden' })
    assert.deepEqual(state.modelWrites, [], 'Cancel saves nothing')
    assert.equal(await headerModel(page).innerText(), 'openai/gpt-5.4-mini')
    assert.equal(await bodyScroll(page), scrolled, 'Cancel keeps the Details scroll position')
    console.log('PASS 1440px: Cancel keeps the previous model and scroll position')

    await openEditor(page)
    await editor(page).locator('select').first().selectOption('openai/gpt-5.5')
    await editor(page).getByRole('button', { name: 'Save', exact: true }).click()
    await editor(page).waitFor({ state: 'hidden' })
    await detailsPanel(page).locator('span.font-mono').filter({ hasText: /^openai\/gpt-5\.5$/ }).first().waitFor()
    assert.deepEqual(state.modelWrites, ['openai/gpt-5.5'])
    assert(await detailsClose(page).isVisible(), 'Details stays open after Save')
    assert.equal(await page.getByText('Loading activity...').count(), 0)
    assert.equal(await bodyScroll(page), scrolled, 'Save refreshes Details in place, keeping its scroll position')
    await page.screenshot({ path: path.join(artifactDir, 'details-after-save-1440.png') })
    console.log('PASS 1440px: Save shows the new model in the open, pinned panel at the same scroll position')

    // The card Actions menu still opens the same editor.
    await page.keyboard.press('Escape')
    await detailsClose(page).waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'More actions', exact: true }).first().click()
    await page.getByRole('button').filter({ hasText: /^\s*Edit\s*$/ }).click()
    await editor(page).locator('select').first().waitFor()
    assert.equal(await editor(page).locator('select').first().inputValue(), 'openai/gpt-5.5')
    await editor(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.deepEqual(state.errors, [])
    console.log('PASS 1440px: the card Actions menu still opens Edit Agent Config')
    await page.close()
  }

  // Phone, not pinned: an outside click closes only the editor; Save still refreshes in place.
  {
    const { page, state } = await openPage(390)
    await openDetails(page)
    assert.equal(await page.getByRole('button', { name: 'Keep open', exact: true }).getAttribute('aria-pressed'), 'false')
    const scrolled = await scrollDetails(page, 300)
    await openEditor(page)
    await page.mouse.click(4, 4)
    await editor(page).waitFor({ state: 'hidden' })
    assert(await detailsClose(page).isVisible(), 'An outside click on the editor closes only the editor')
    await openEditor(page)
    const box = await editor(page).locator('select').first().boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 390, 'The model select fits the phone screen')
    await editor(page).locator('select').first().selectOption('openai/gpt-5.5')
    await editor(page).getByRole('button', { name: 'Save', exact: true }).click()
    await editor(page).waitFor({ state: 'hidden' })
    await detailsPanel(page).locator('span.font-mono').filter({ hasText: /^openai\/gpt-5\.5$/ }).first().waitFor()
    assert.equal(await bodyScroll(page), scrolled, 'Save keeps the Details scroll position on a phone')
    assert.deepEqual(state.errors, [])
    await page.screenshot({ path: path.join(artifactDir, 'details-after-save-390.png') })
    console.log('PASS 390px: unpinned editor closes on an outside click; Save refreshes the open panel in place')
    await page.close()
  }
} finally {
  await browser.close()
}
