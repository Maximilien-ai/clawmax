// Uses a disposable workspace on the local dev instance; never target a shared instance.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5178'
const stamp = Date.now()
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    const workspaceData = await (await page.request.get(`${base}/api/workspaces`)).json()
    await page.addInitScript(ids => {
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
      for (const id of ids) localStorage.setItem(`clawmax-onboarding-auto-opened:${id}`, 'true')
    }, ['default', ...(workspaceData.workspaces || []).map(workspace => workspace.id)])
    const name = `acceptance/create-${stamp}-${width}.md`
    const created = await page.request.post(`${base}/api/docs/create`, { data: { path: `ORG/${name}`, content: 'ORIGINAL_CREATE_SENTINEL' } })
    assert.equal(created.status(), 201)
    await page.goto(`${base}/docs`)
    const welcome = page.getByRole('heading', { name: 'Get this workspace running', exact: true })
    await welcome.waitFor({ timeout: 3000 }).catch(error => { if (error.name !== 'TimeoutError') throw error })
    if (await welcome.isVisible()) await welcome.locator('..').locator('..').getByRole('button', { name: '✕', exact: true }).click()
    if (width < 640) await page.getByRole('main').getByRole('button', { name: 'Documents', exact: true }).click()
    await page.getByRole('button', { name: '+ New', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Create New Document' })
    const nameInput = dialog.getByPlaceholder('example.md or subdirectory/example.md')
    const content = dialog.locator('textarea')
    await nameInput.fill(name)
    await content.fill('NEW_CREATE_SENTINEL')
    await dialog.getByRole('button', { name: 'Create Document', exact: true }).click()
    await dialog.getByRole('alert').filter({ hasText: 'already exists' }).waitFor()
    assert.equal(await nameInput.inputValue(), name)
    assert.equal(await content.inputValue(), 'NEW_CREATE_SENTINEL')
    const original = await page.request.get(`${base}/api/docs/content`, { params: { path: `ORG/${name}` } })
    assert.equal((await original.json()).content, 'ORIGINAL_CREATE_SENTINEL')
    assert.equal(await dialog.evaluate(el => el.getBoundingClientRect().height <= window.innerHeight), true)
    await page.screenshot({ path: `/private/tmp/clawmax-doc-create-conflict-${width}.png` })

    await nameInput.fill(name.replace('.md', '-new.md'))
    await page.route('**/api/docs/create', route => route.fulfill({ status: 500, json: { error: 'Storage temporarily unavailable' } }), { times: 1 })
    await dialog.getByRole('button', { name: 'Create Document', exact: true }).click()
    await dialog.getByRole('alert').filter({ hasText: 'Storage temporarily unavailable' }).waitFor()
    assert.equal(await content.inputValue(), 'NEW_CREATE_SENTINEL')
    await dialog.getByRole('button', { name: 'Create Document', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const fresh = await page.request.get(`${base}/api/docs/content`, { params: { path: `ORG/${name.replace('.md', '-new.md')}` } })
    assert.equal((await fresh.json()).content, 'NEW_CREATE_SENTINEL')
    await page.close()
    console.log(`PASS ${width}px: conflict preserves original and draft; storage error retains draft; renamed retry succeeds`)
  }
} finally {
  await browser.close()
}
