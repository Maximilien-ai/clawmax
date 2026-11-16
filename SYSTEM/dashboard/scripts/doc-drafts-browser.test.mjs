// Real document API in a disposable local-dev workspace. Never use a shared instance.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5178'
const stamp = Date.now()
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    // An extra Vite preview can share the isolated API's explicitly trusted UI origin.
    // The final run against the packaged local-dev URL does not set this override.
    if (process.env.TEST_API_ORIGIN) await page.route('**/api/docs/content', async route => {
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: process.env.TEST_API_ORIGIN } })
      await route.fulfill({ response })
    })
    await page.addInitScript(() => {
      localStorage.setItem('clawmax-system-nav-expanded', 'true')
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
    })
    const name = `draft-${stamp}-${width}`
    for (const suffix of ['a', 'b']) {
      const response = await page.request.post(`${base}/api/docs/create`, { data: { path: `ORG/${name}-${suffix}.md`, content: `ORIGINAL_${suffix}` } })
      assert.equal(response.status(), 201)
    }
    await page.goto(`${base}/docs`)
    const welcome = page.getByRole('heading', { name: 'Get this workspace running', exact: true })
    await welcome.waitFor({ timeout: 3000 }).catch(error => { if (error.name !== 'TimeoutError') throw error })
    if (await welcome.isVisible()) await welcome.locator('..').locator('..').getByRole('button', { name: '✕', exact: true }).click()
    const main = page.getByRole('main')
    const open = async suffix => {
      if (width < 640) await main.getByRole('button', { name: 'Documents', exact: true }).click()
      await main.getByRole('button', { name: `${name}-${suffix}.md`, exact: true }).click()
    }
    const editor = main.getByRole('textbox', { name: 'Document content', exact: true })
    await open('a')
    await main.getByRole('button', { name: 'Edit', exact: true }).click()
    await editor.fill('UNSAVED_A')
    await open('b')
    await main.getByRole('button', { name: 'Edit', exact: true }).click()
    await editor.fill('UNSAVED_B')
    await open('a')
    await editor.waitFor()
    assert.equal(await editor.inputValue(), 'UNSAVED_A')
    const savedA = await page.request.get(`${base}/api/docs/content`, { params: { path: `ORG/${name}-a.md` } })
    assert.equal((await savedA.json()).content, 'ORIGINAL_a')

    // App navigation keeps Documents mounted; use the real sidebar and come back.
    if (width < 640) await page.getByRole('button', { name: /open.*menu|toggle.*sidebar|open.*sidebar|toggle.*menu/i }).click()
    await page.getByRole('button', { name: 'Agents', exact: true }).first().click()
    if (width < 640) await page.getByRole('button', { name: /open.*menu|toggle.*sidebar|open.*sidebar|toggle.*menu/i }).click()
    await page.getByRole('button', { name: 'Documents', exact: true }).first().click()
    await editor.waitFor()
    assert.equal(await editor.inputValue(), 'UNSAVED_A')
    assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true)
    await page.screenshot({ path: `/private/tmp/clawmax-doc-drafts-${width}.png` })

    await page.route('**/api/docs/content', async route => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 500, json: { error: 'Save temporarily unavailable' } })
      return route.fallback()
    }, { times: 1 })
    await main.getByRole('button', { name: 'Save', exact: true }).click()
    await main.getByText('Save temporarily unavailable', { exact: true }).waitFor()
    assert.equal(await editor.inputValue(), 'UNSAVED_A')
    const retryResponse = page.waitForResponse(response => response.url().includes('/api/docs/content') && response.request().method() === 'POST')
    await main.getByRole('button', { name: 'Save', exact: true }).click()
    const retry = await retryResponse
    assert.equal(retry.status(), 200, await retry.text())
    await editor.waitFor({ state: 'hidden' })
    const finalA = await page.request.get(`${base}/api/docs/content`, { params: { path: `ORG/${name}-a.md` } })
    assert.equal((await finalA.json()).content, 'UNSAVED_A')
    const returnToB = page.waitForResponse(response => response.url().includes(encodeURIComponent(`ORG/${name}-b.md`)) && response.request().method() === 'GET')
    await open('b')
    const bResponse = await returnToB
    assert.equal(bResponse.status(), 200, await bResponse.text())
    await editor.waitFor({ timeout: 5000 }).catch(async error => {
      console.error((await main.innerText()).slice(-2000))
      throw error
    })
    assert.equal(await editor.inputValue(), 'UNSAVED_B')
    await main.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true)

    // A completed Save must not erase edits typed afterward or alter another file.
    await open('a')
    await main.getByRole('button', { name: 'Edit', exact: true }).click()
    await editor.fill('SUBMITTED_A')
    let releaseSave
    let signalStarted
    const saveGate = new Promise(resolve => { releaseSave = resolve })
    const started = new Promise(resolve => { signalStarted = resolve })
    await page.route('**/api/docs/content', async route => {
      if (route.request().method() !== 'POST') return route.fallback()
      signalStarted()
      await saveGate
      return route.fallback()
    }, { times: 1 })
    await main.getByRole('button', { name: 'Save', exact: true }).click()
    await started
    await editor.fill('NEWER_A')
    await open('b')
    const completedSave = page.waitForResponse(response => response.url().includes('/api/docs/content') && response.request().method() === 'POST')
    releaseSave()
    assert.equal((await completedSave).status(), 200)
    await main.getByText('ORIGINAL_b', { exact: true }).waitFor()
    await open('a')
    await editor.waitFor()
    assert.equal(await editor.inputValue(), 'NEWER_A')
    const submittedA = await page.request.get(`${base}/api/docs/content`, { params: { path: `ORG/${name}-a.md` } })
    assert.equal((await submittedA.json()).content, 'SUBMITTED_A')
    await main.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true)
    await page.close()
    console.log(`PASS ${width}px: independent drafts survive document/page navigation; failed Save retains draft; Save/Cancel clear only their own draft; late Save preserves newer edits and the other document; close warning clears when clean`)
  }
} finally {
  await browser.close()
}
