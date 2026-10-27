import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 for (const surface of ['organizations', 'communication']) {
 for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }); page.setDefaultTimeout(15000)
  const stored = { groups: [], communities: [] }; let failGenerate = true, failSave = true, saves = 0
  await page.addInitScript(() => { window.EventSource = class { close() {} }; for (let v=1;v<=10;v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed') })
  await page.route('**/api/**', async route => {
   const path = new URL(route.request().url()).pathname; let json = {}
   if (path === '/api/health/live') json = { alive: true }
   else if (path === '/api/auth/config') json = { authDisabled: true }
   else if (path === '/api/auth/me') json = { authenticated: false }
   else if (path === '/api/system') json = { version: 'fixture', agentCount: 1 }
   else if (path === '/api/workspaces') json = { workspaces: [] }
   else if (path === '/api/plugins') json = { plugins: [] }
   else if (path === '/api/teams') json = { teams: [] }
   else if (path === '/api/workflows') json = { workflows: [] }
   else if (path === '/api/agents') json = { agents: [{ id: 'reviewer', name: 'Reviewer', status: 'online', communities: [], groups: [] }] }
   else if (path === '/api/channel-draft') {
    if (failGenerate) { failGenerate = false; await route.fulfill({ status: 400, json: { error: 'Synthetic generation unavailable' } }); return }
    const { kind } = route.request().postDataJSON(); json = { draft: { name: `AI ${kind}`, description: 'Review releases together', members: ['reviewer'], community: '' } }
   } else if (path === '/api/groups' || path === '/api/communities') {
    const key = path.slice(5)
    if (route.request().method() === 'POST') {
     saves++; if (failSave) { failSave = false; await route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } }); return }
     const draft = route.request().postDataJSON(); assert.deepEqual(draft.members, ['reviewer']); stored[key].push({ ...draft, tags: [] }); json = { ok: true }
    } else json = { [key]: stored[key] }
   }
   await route.fulfill({ json })
  })
  await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://localhost:5183'}/${surface}`)
  for (const kind of ['Community', 'Group']) {
   if (surface === 'communication') await page.getByTitle('Create communication channel', { exact: true }).click()
   await page.getByRole('button', { name: surface === 'organizations' ? `+ Create ${kind}` : new RegExp(`Create ${kind}`) }).first().click()
   const dialog = page.getByRole('dialog', { name: `Create ${kind}`, exact: true })
   await dialog.locator('#channel-ai-prompt').fill('Create a release review team with reviewer')
   await dialog.getByRole('button', { name: 'Generate draft', exact: true }).click()
   if (kind === 'Community') {
    await dialog.getByRole('alert').filter({ hasText: 'Synthetic generation unavailable' }).waitFor()
    assert.equal(await dialog.locator('#channel-ai-prompt').inputValue(), 'Create a release review team with reviewer')
    await dialog.getByRole('button', { name: 'Generate draft', exact: true }).click()
   }
   await page.waitForFunction(name => [...document.querySelectorAll('[role="dialog"] input')].some(input => input.value === name), `AI ${kind.toLowerCase()}`)
   assert.equal(saves, kind === 'Community' ? 0 : 2)
   assert.equal(await dialog.getByRole('checkbox', { name: 'reviewer', exact: true }).isChecked(), true)
   await dialog.screenshot({ path: `/private/tmp/rc95-ai-${surface}-${kind.toLowerCase()}-${width}.png` })
   assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
   await dialog.getByRole('button', { name: surface === 'organizations' ? 'Create' : `Create ${kind}`, exact: true }).click()
   if (kind === 'Community') {
    await dialog.getByRole('alert').filter({ hasText: 'Failed to create community' }).waitFor()
    await dialog.getByRole('button', { name: surface === 'organizations' ? 'Create' : `Create ${kind}`, exact: true }).click()
   }
   await dialog.waitFor({ state: 'hidden' }); await page.reload()
   if (surface === 'organizations') await page.getByText(kind === 'Community' ? 'Communities (1)' : 'Groups (1)', { exact: true }).click()
   await page.getByText(`AI ${kind.toLowerCase()}`, { exact: true }).first().waitFor()
  }
  console.log(`PASS ${surface} ${width}px: AI group/community generation, membership, error recovery, save and reload`); await page.close()
 }
} } finally { await browser.close() }
