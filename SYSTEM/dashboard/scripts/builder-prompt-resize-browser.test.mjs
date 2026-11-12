// Uses an isolated dev API for read-only context; synthetic browser history, no model calls.
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5180'
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-builder-resize'
fs.mkdirSync(artifacts, { recursive: true })
const { workspace } = await (await fetch(`${base}/api/workspaces/active`, { signal: AbortSignal.timeout(10000) })).json()
assert(workspace?.id, 'Select an isolated acceptance workspace first')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(20000)
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('dark-mode', String(theme === 'dark'))
      for (let v = 1; v <= 10; v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed')

    }, { theme })
    let questionRequests = 0
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/ai-builder/question') { questionRequests++; return route.fulfill({ json: { answer: 'Synthetic acceptance response: describe the audience and desired deliverable.' } }) }
      if (route.request().method() !== 'GET') { return route.fulfill({ status: 403, json: { error: 'Read-only resize test' } }) }
      return route.continue()
    })
    await page.goto(`${base}/builder`)
    const input = page.locator('#builder-prompt-input')
    await input.waitFor()
    await page.getByText(workspace.name, { exact: true }).first().waitFor()
    await page.waitForLoadState('networkidle')
    await input.fill('/question What should the launch plan include?')
    await page.getByRole('button', { name: 'Ask Builder', exact: true }).click()
    await page.getByText('Synthetic acceptance response: describe the audience and desired deliverable.', { exact: true }).waitFor()
    const initialHeight = await input.evaluate(el => el.getBoundingClientRect().height)
    assert.equal(initialHeight, 192, 'Keep the existing expanded default')
    const draft = 'Audience: founders. Return a markdown launch plan.\n'.repeat(40)
    await input.fill(draft)
    const drag = async delta => {
      await input.scrollIntoViewIfNeeded()
      const box = await input.boundingBox()
      await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4 + delta, { steps: 12 })
      await page.mouse.up()
      return input.evaluate(el => el.getBoundingClientRect().height)
    }
    const shorter = await drag(-70)
    assert(shorter < initialHeight - 40 && shorter >= 88, 'Native drag must shrink the expanded prompt')
    const taller = await drag(130)
    assert(taller > initialHeight + 20, 'Native drag must grow the prompt')
    assert.equal(await input.inputValue(), draft, 'Resizing preserves the draft')
    assert(await input.evaluate(el => el.scrollHeight > el.clientHeight), 'Long drafts scroll within the resized input')
    assert(await input.evaluate(el => el.getBoundingClientRect().width <= window.innerWidth), 'Vertical resizing must not overflow horizontally')
    await page.getByRole('button', { name: 'Shrink builder prompt', exact: true }).click()
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), 88, 'Preset resets a manually dragged height')
    assert(await drag(100) > 150, 'The reduced preset must still allow manual growth')
    const expand = page.getByRole('button', { name: 'Expand builder prompt', exact: true })
    await expand.focus(); await page.keyboard.press('Enter')
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), 192, 'Keyboard preset restores the default')
    assert.equal(await input.inputValue(), draft)
    await drag(100)
    for (const name of ['Open Editor', 'Recommend Next Step']) {
      const action = page.getByRole('button', { name, exact: true })
      await action.scrollIntoViewIfNeeded()
      assert(await action.evaluate(el => {
        const box = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      }), `${name} must remain reachable after resizing`)
    }
    assert.equal(questionRequests, 1, 'Only the synthetic setup question should run; all non-GET API calls are intercepted')
    await input.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${artifacts}/${theme}-${width}.png`, fullPage: true })
    await page.close()
    console.log(`PASS Builder resize ${theme} ${width}: default, drag shorter/taller, presets, draft, scrolling and actions`)
  }
} finally { await browser.close() }
