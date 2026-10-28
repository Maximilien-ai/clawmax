// Synthetic API fixtures: no model calls, workspace mutations, or credential access.
// Races are made deterministic by holding fixture responses until the test releases them.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const artifactDir = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-agent-default-model-browser'
fs.mkdirSync(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.setDefaultTimeout(10000)

const SAVED = 'openai/gpt-5.4-mini'
const OTHER = 'openai/gpt-5.5'
const LISTED_WITH_SHOW_ALL = 'openai/gpt-5.5-pro'
const deferred = () => { let release; const promise = new Promise((resolve) => { release = resolve }); return { promise, release } }
const fixture = { preferred: SAVED, discoverFails: false, discoverHold: null, conservativeListHold: null, configHold: null, configFails: false, generateHold: null, generateFails: false, generateCalls: 0, validatedModel: null, enabledRuntimes: [] }
// One existing agent keeps the first-run onboarding dialog closed.
const agent = { id: 'existing-agent', name: 'Existing Agent', status: 'offline', workspacePath: '/tmp/default-model/AGENTS/existing-agent', tags: [], communities: [], groups: [], skills: [], model: SAVED, runtime: 'openclaw' }
const workspace = { id: 'default-model', name: 'Default model fixture', path: '/tmp/default-model', agentCount: 1, isActive: true, tags: [] }
const recommendation = { recommendedModel: OTHER, confidence: 'medium', summary: 'Synthetic model fit', disclaimer: 'Advisory fixture', candidates: [{ model: OTHER, score: 1, tier: 'balanced', reasons: ['Synthetic reason'], caveats: [] }] }
const errors = []
page.on('pageerror', (error) => errors.push(error.stack))
await page.route('**/api/**', async (route) => {
  const p = new URL(route.request().url()).pathname
  let status = 200
  let body = {}
  if (p === '/api/auth/config') {
    if (fixture.configHold) await fixture.configHold.promise
    if (fixture.configFails) status = 503
    body = { authDisabled: true, githubEnabled: false, deploymentKind: 'local', preferredModel: fixture.preferred, enabledRuntimes: fixture.enabledRuntimes, userKeyDefaults: { openai: true, anthropic: false } }
  } else if (p === '/api/agents/models/discover') {
    const showAll = route.request().postDataJSON()?.showAll === true
    if (fixture.discoverHold) await fixture.discoverHold.promise
    if (!showAll && fixture.conservativeListHold) await fixture.conservativeListHold.promise
    if (fixture.discoverFails) {
      status = 500
      body = { error: 'Failed to discover models' }
    // The saved default is not listed first: a <select> whose value matches no option shows its first
    // entry, which would mask an agent whose real model is something else.
    } else {
      const models = showAll ? [OTHER, SAVED, LISTED_WITH_SHOW_ALL] : [OTHER, SAVED]
      body = { models, modelsByProvider: { openai: { name: 'OpenAI', models } } }
    }
  } else if (p === '/api/agents/generate') {
    fixture.generateCalls++
    if (fixture.generateHold) await fixture.generateHold.promise
    if (fixture.generateFails) { status = 502; body = { error: 'OpenAI rejected the generation request (401). Run Check Key in BYOK.' } }
    else body = { identity: '# Lead Software Engineer\n\n**Name:** agent0', soul: 'Plan, review and ship.', tools: 'Repository and tests.', generatedBy: { label: 'OpenAI (BYOK)' }, suggestedName: 'lead-software-engineer', suggestedModel: OTHER, modelRecommendation: recommendation }
  } else if (p === '/api/agents/validate-provision') {
    fixture.validatedModel = route.request().postDataJSON()?.model ?? null
    body = { valid: true, errors: [], warnings: [] }
  } else if (p === '/api/agents/model-fit') body = recommendation
  else if (p === '/api/integrations/runtimes') body = { runtimes: [{ id: 'openclaw', label: 'OpenClaw', models: [] }, { id: 'claude', label: 'Claude Code', models: ['sonnet', 'opus'] }], enabledRuntimes: fixture.enabledRuntimes }
  else if (p === '/api/health/live') body = { alive: true }
  else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture', name: 'Fixture', role: 'admin' } }
  else if (p === '/api/system') body = { version: '2.0.0-test-fixture', hostname: 'browser-fixture', machineName: 'Fixture', agentCount: 1, onlineCount: 0, workspacePath: workspace.path }
  else if (p === '/api/workspaces') body = { workspaces: [workspace] }
  else if (p === '/api/workspaces/active') body = { workspace }
  else if (p === '/api/agents/next') body = { id: 'agent0', port: 18800 }
  else if (p === '/api/agents') body = { agents: [agent], total: 1, hasMore: false }
  else if (p === `/api/agents/${agent.id}`) body = agent
  else if (p === `/api/agents/${agent.id}/identity`) body = { metadata: { model: SAVED, runtime: 'openclaw' }, liveConfig: { model: SAVED } }
  else if (p === '/api/templates/agents') body = { templates: [] }
  else if (p === '/api/activity-export/status') body = { agentforge: { configured: false, connected: false }, destinations: [], queuedEvents: 0 }
  else if (p === '/api/agents/turns/active') body = { turns: [] }
  else if (p.includes('notifications')) body = { notifications: [], unreadCount: 0 }
  else if (p.includes('relationships')) body = { agents: {}, workflows: {}, groups: {}, communities: {} }
  else if (p.includes('metering')) body = { byAgent: [], byWorkflow: [], totals: {} }
  else if (p === '/api/plugins') body = { plugins: [] }
  else if (p === '/api/docs') body = { docs: [] }
  else if (p === '/api/communities') body = { communities: [] }
  else if (p === '/api/groups') body = { groups: [] }
  else if (p === '/api/workflows') body = { workflows: [] }
  else if (p.endsWith('/status')) body = { agents: [agent] }
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
})

const modelButton = () => wizard().getByRole('button', { name: 'models', exact: true })
const modelSelect = () => wizard().getByRole('listbox', { name: 'Matching models', exact: true })
const generateButton = () => page.locator('button').filter({ hasText: /^(Generate with AI|Loading model defaults\.\.\.|Generating\.\.\.)$/ }).first()
const wizard = () => page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Add Agent', level: 2 }) })
const next = () => wizard().getByRole('button', { name: 'Next', exact: true })
const describe = () => page.getByPlaceholder('e.g., A friendly project manager who helps track tasks and deadlines...')

async function reset(seedPreferred = SAVED) {
  await page.goto(`${base}/agents`)
  await page.evaluate((preferredModel) => {
    localStorage.setItem('clawmax-byok-preview', JSON.stringify(preferredModel ? { preferredModel } : {}))
  }, seedPreferred)
  await page.reload()
  await page.getByRole('button').filter({ hasText: /^Create\s*▾$/ }).waitFor()
}
async function openWizard(mode) {
  await page.getByRole('button').filter({ hasText: /^Create\s*▾$/ }).click()
  await page.getByRole('button').filter({ hasText: mode === 'ai' ? /^\s*Create with AI\s*$/ : /^\s*Create with Wizard\s*$/ }).click()
  await page.getByRole('heading', { name: 'Add Agent', level: 2 }).waitFor()
}
async function looksDisabled(locator) {
  return locator.evaluate((el) => { const s = getComputedStyle(el); return el.disabled && s.cursor === 'not-allowed' && s.backgroundColor !== 'rgb(2, 132, 199)' })
}
// Polls because the button animates its colours (transition-colors) after it becomes enabled.
async function looksEnabled(locator) {
  const handle = await locator.elementHandle()
  return page.waitForFunction((el) => { const s = getComputedStyle(el); return !el.disabled && s.cursor === 'pointer' && s.backgroundColor === 'rgb(2, 132, 199)' }, handle, { timeout: 3000 })
    .then(() => true, () => false)
}
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`) } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${name.replace(/\W+/g, '-')}.png`) })
    throw new Error(`${name}: ${error.message}`)
  }
}

try {
  await check('direct AI creation keeps the saved default when model discovery fails, and offers a retry', async () => {
    await reset()
    fixture.discoverFails = true
    await openWizard('ai')
    await describe().fill('Lead Software Engineer')
    await page.getByText(`Agent model: ${SAVED}`, { exact: false }).waitFor()
    await page.getByText('Could not load the model list', { exact: false }).waitFor()
    assert.equal(await generateButton().isEnabled(), true, 'Generate must work with the saved default')
    assert.equal(await next().isEnabled(), true, 'Next must not be blocked by an unavailable list when the default is known')
    fixture.discoverFails = false
    await wizard().getByRole('button', { name: 'Retry', exact: true }).click()
    await page.getByText('Could not load the model list', { exact: false }).waitFor({ state: 'detached' })
    await page.getByText(`Agent model: ${SAVED}`, { exact: false }).waitFor()
    // Direct AI creation reaches review with the saved default, without visiting Identity.
    await next().click()
    await next().click()
    await wizard().getByRole('button', { name: 'Provision', exact: true }).waitFor()
    assert.equal(fixture.validatedModel, SAVED, 'Validation must receive the saved default')
    assert.equal(await wizard().getByText('Choose a model before provisioning', { exact: false }).count(), 0)
  })

  await check('while defaults load, Generate looks and is disabled and Next waits', async () => {
    await reset()
    fixture.discoverHold = deferred()
    await openWizard('ai')
    await describe().fill('Lead Software Engineer')
    const button = generateButton()
    assert.equal((await button.innerText()).trim(), 'Loading model defaults...')
    assert.equal(await looksDisabled(button), true, 'A disabled Generate button must not look clickable')
    assert.equal(await next().isDisabled(), true, 'Next must wait for the model instead of failing at review')
    fixture.discoverHold.release()
    fixture.discoverHold = null
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).waitFor()
    assert.equal(await looksEnabled(generateButton()), true, 'Generate must enable itself, and look enabled, once the default arrives')
    assert.equal(await next().isEnabled(), true)
  })

  await check('a default saved only on the server applies on first open even when its config answer is late', async () => {
    await reset(null)
    fixture.configHold = deferred()
    await openWizard('ai')
    await describe().fill('Lead Software Engineer')
    assert.equal((await generateButton().innerText()).trim(), 'Loading model defaults...')
    fixture.configHold.release()
    fixture.configHold = null
    await page.getByText(`Agent model: ${SAVED}`, { exact: false }).waitFor()
    assert.equal(await looksEnabled(generateButton()), true)
  })

  await check('when the saved default cannot load, no other model is picked silently and Retry recovers', async () => {
    await reset(null)
    fixture.configFails = true
    await openWizard('wizard')
    await wizard().getByText('Could not load the saved default model', { exact: false }).waitFor()
    assert.equal(await modelButton().getAttribute('data-model-value'), '', 'The first listed model must not stand in for an unknown saved default')
    assert.equal(await next().isDisabled(), true)
    fixture.configFails = false
    await wizard().getByRole('button', { name: 'Retry', exact: true }).click()
    await page.waitForFunction((saved) => [...document.querySelectorAll('button[data-model-value]')].some((s) => s.dataset.modelValue === saved), SAVED)
  })

  await check('an answer from a superseded model-list request does not replace the newer list', async () => {
    await reset()
    fixture.conservativeListHold = deferred()
    await openWizard('wizard')
    await page.getByLabel('Show all models').check()
    if (await modelButton().getAttribute('aria-expanded') !== 'true') await modelButton().click()
    await modelSelect().locator(`option[value="${LISTED_WITH_SHOW_ALL}"]`).waitFor({ state: 'attached' })
    fixture.conservativeListHold.release()
    fixture.conservativeListHold = null
    await page.waitForTimeout(500)
    assert.equal(await modelSelect().locator(`option[value="${LISTED_WITH_SHOW_ALL}"]`).count(), 1, 'The stale conservative list must not replace the Show all list')
  })

  await check('a manual model choice survives a late config answer and the Show all models reload', async () => {
    await reset()
    fixture.configHold = deferred()
    await openWizard('wizard')
    if (await modelButton().getAttribute('aria-expanded') !== 'true') await modelButton().click()
    await modelSelect().locator(`option[value="${OTHER}"]`).waitFor({ state: 'attached' })
    await page.getByPlaceholder('agent0').fill('my-agent')
    if (await modelButton().getAttribute('aria-expanded') !== 'true') await modelButton().click()
    await modelSelect().selectOption(OTHER)
    fixture.configHold.release()
    fixture.configHold = null
    await page.waitForTimeout(500)
    assert.equal(await modelButton().getAttribute('data-model-value'), OTHER, 'The late saved default must not replace the user choice')
    await page.getByLabel('Show all models').check()
    await page.waitForTimeout(500)
    assert.equal(await modelButton().getAttribute('data-model-value'), OTHER, 'Reloading the list must not replace the user choice')
    assert.equal(await page.getByPlaceholder('agent0').inputValue(), 'my-agent', 'Reloading the list must not reset the typed name')
  })

  await check('model search filters options without changing the saved selection', async () => {
    await reset()
    await openWizard('wizard')
    await modelButton().click()
    const search = wizard().getByRole('searchbox', { name: 'Search models', exact: true })
    await search.fill('no-matching-model')
    assert.equal(await modelButton().getAttribute('data-model-value'), SAVED)
    await page.getByText('No matching models', { exact: true }).waitFor()
    await search.fill('OpenAI')
    assert(await modelSelect().locator('option').count() > 1)
    await search.fill('')
  })

  await check('Generate sends one request, shows progress, reveals the result and keeps the saved model', async () => {
    await reset()
    await openWizard('ai')
    await describe().fill('Lead Software Engineer')
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).waitFor()
    const callsBefore = fixture.generateCalls
    fixture.generateHold = deferred()
    await generateButton().dblclick()
    await page.getByText('Generating agent files', { exact: false }).first().waitFor()
    assert.equal((await generateButton().innerText()).trim(), 'Generating...')
    fixture.generateHold.release()
    fixture.generateHold = null
    const banner = page.getByText('Files generated successfully', { exact: true })
    await banner.waitFor()
    assert.equal(fixture.generateCalls - callsBefore, 1, 'A double click must send exactly one generation request')
    await page.waitForTimeout(800)
    const inView = (locator) => locator.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const pane = el.closest('.overflow-y-auto').getBoundingClientRect()
      return box.top >= pane.top && box.bottom <= pane.bottom
    })
    assert.equal(await inView(banner), true, 'The success confirmation must be scrolled into view')
    assert.equal(await inView(page.locator('summary', { hasText: 'IDENTITY.md Preview' })), true, 'The previews must be discoverable')
    await page.getByText(`Agent model: ${SAVED}`, { exact: false }).waitFor()
    await wizard().getByRole('button', { name: 'Back', exact: true }).click()
    assert.equal(await modelButton().getAttribute('data-model-value'), SAVED, 'The AI suggestion must not replace the saved default')
    await page.screenshot({ path: path.join(artifactDir, 'generated.png') })
  })

  await check('a generation failure is shown and keeps the description', async () => {
    await reset()
    fixture.generateFails = true
    await openWizard('ai')
    await describe().fill('Lead Software Engineer')
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'OpenAI rejected the generation request' }).waitFor()
    assert.equal(await describe().inputValue(), 'Lead Software Engineer')
    assert.equal(await generateButton().isEnabled(), true, 'The user can retry after fixing the cause')
    fixture.generateFails = false
  })

  await check('with no resolvable model, step 2 explains it and links to the model selector', async () => {
    fixture.preferred = undefined
    fixture.discoverFails = true
    await reset(null)
    await openWizard('ai')
    const alert = page.getByRole('alert').filter({ hasText: 'No model is selected' })
    await alert.waitFor()
    assert.equal(await next().isDisabled(), true, 'An unresolved model must not reach a later step')
    assert.equal(await looksDisabled(generateButton()), true)
    await alert.getByRole('button', { name: 'Go to Identity' }).click()
    await modelButton().waitFor()
    fixture.preferred = SAVED
    fixture.discoverFails = false
  })

  await check('switching to a CLI runtime and back restores the provider model', async () => {
    fixture.enabledRuntimes = ['claude']
    await reset()
    await openWizard('wizard')
    await page.waitForFunction((saved) => [...document.querySelectorAll('button[data-model-value]')].some((s) => s.dataset.modelValue === saved), SAVED)
    const runtime = page.locator('select').first()
    await runtime.selectOption('claude')
    assert.equal(await modelButton().getAttribute('data-model-value'), 'sonnet')
    await runtime.selectOption('default')
    assert.equal(await modelButton().getAttribute('data-model-value'), SAVED, 'OpenClaw must not keep the CLI-only model id')
    fixture.enabledRuntimes = []
  })

  await check('BYOK model searches preserve defaults at desktop and mobile widths', async () => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await reset()
      await page.getByRole('button', { name: 'BYOK', exact: true }).click()
      const select = page.locator('#new-agent-default-model')
      await select.waitFor()
      const before = await select.getAttribute('data-model-value')
      await select.click()
      const search = page.getByRole('searchbox', { name: 'Search models', exact: true })
      await search.fill('no-such-model')
      assert.equal(await select.getAttribute('data-model-value'), before)
      await search.fill('OpenAI')
      assert(await page.getByRole('listbox', { name: 'Matching models' }).locator('optgroup').count() > 0)
      await search.press('Escape')
      await page.locator('#system-agent-default-model').click()
      await page.getByRole('searchbox', { name: 'Search system agent models', exact: true }).fill('mini')
      await select.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `/private/tmp/rc96-byok-search-${width}.png` })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    }
  })
  assert.deepEqual(errors, [])
} finally { await browser.close() }
