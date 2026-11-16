// Disposable disabled/manual fixtures only; this test never starts a workflow.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5180'
const stamp = Date.now()
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    if (process.env.TEST_API_ORIGIN) await page.route('**/api/workflows/**', async route => {
      const response = await route.fetch({ headers: { ...route.request().headers(), origin: process.env.TEST_API_ORIGIN } })
      await route.fulfill({ response })
    })
    await page.addInitScript(() => {
      localStorage.setItem('workflows-view-mode', 'grid')
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
    })
    const fixtures = []
    for (const count of [0, 1, 3]) {
      const outputs = [
        { key: 'summary', label: 'Summary', type: 'markdown', help: 'Primary brief' },
        { key: 'details', label: 'Details', type: 'markdown', help: 'Keep detail' },
        { key: 'data', label: 'Data', type: 'json', help: 'Keep structured data' },
      ].slice(0, count)
      const name = `Flight preservation ${stamp} ${width} ${count}`
      const response = await page.request.post(`${base}/api/workflows`, { data: { name, description: 'Disposable preservation check', schedule: 'manual', enabled: false, executionMode: 'automated', content: '# Instructions\nDo not run.', targeting: { tags: ['preflight-acceptance'] }, outputDefinitions: outputs } })
      assert.equal(response.status(), 201, await response.text())
      fixtures.push({ name, id: (await response.json()).id, outputs })
    }
    await page.goto(`${base}/workflows`)
    const welcome = page.getByRole('heading', { name: 'Get this workspace running', exact: true })
    await welcome.waitFor({ timeout: 2000 }).catch(error => { if (error.name !== 'TimeoutError') throw error })
    if (await welcome.isVisible()) await welcome.locator('..').locator('..').getByRole('button', { name: '✕', exact: true }).click()
    const main = page.getByRole('main')
    const openEditor = async fixture => {
      await page.goto(`${base}/workflows`)
      await page.getByPlaceholder('Search workflows...').fill(fixture.name)
      await main.getByText(fixture.name, { exact: true }).first().click()
      await page.getByRole('button', { name: /^Edit(?: Workflow)?$/i }).click({ timeout: 5000 }).catch(async error => {
        console.error((await page.locator('body').innerText()).slice(-2500))
        throw error
      })
      const dialog = page.getByRole('dialog', { name: 'Edit Workflow', exact: true })
      await dialog.getByPlaceholder('e.g., Daily Standup Report').waitFor()
      await dialog.getByRole('button', { name: 'Save Changes', exact: true }).waitFor({ state: 'visible' })
      await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click({ trial: true })
      return dialog
    }
    for (const fixture of fixtures) {
      const dialog = await openEditor(fixture)
      await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      const saved = await (await page.request.get(`${base}/api/workflows/${fixture.id}`)).json()
      assert.deepEqual(saved.outputDefinitions || [], fixture.outputs)
      assert.equal(saved.enabled, false)
      assert.equal(saved.schedule, 'manual')
      assert.equal(saved.runCount, 0)
    }
    const multiple = fixtures[2]
    const dialog = await openEditor(multiple)
    await dialog.getByText('Additional outputs are preserved when you save.', { exact: false }).waitFor()
    await dialog.getByPlaceholder('Leadership brief').fill('Updated summary')
    await dialog.screenshot({ path: `/private/tmp/clawmax-workflow-outputs-${width}.png` })
    await page.route(`**/api/workflows/${multiple.id}`, async route => {
      if (route.request().method() === 'PUT') return route.fulfill({ status: 500, json: { error: 'Synthetic save failure', details: 'Synthetic save failure' } })
      return route.fallback()
    }, { times: 1 })
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await page.getByText('Synthetic save failure', { exact: false }).first().waitFor()
    assert.equal(await dialog.getByPlaceholder('Leadership brief').inputValue(), 'Updated summary')
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    const saved = await (await page.request.get(`${base}/api/workflows/${multiple.id}`)).json()
    assert.equal(saved.outputDefinitions[0].label, 'Updated summary')
    assert.deepEqual(saved.outputDefinitions.slice(1), multiple.outputs.slice(1))
    console.log(`PASS ${width}px: zero/one/multiple outputs survive unchanged Save; primary edit retains additional types/metadata; failed Save retains draft and retries; workflows stay disabled/manual`)
    await page.close()
  }
} finally {
  await browser.close()
}
