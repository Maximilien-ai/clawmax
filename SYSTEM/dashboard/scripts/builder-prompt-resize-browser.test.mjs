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
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme, hasTouch: width === 390 })
    page.setDefaultTimeout(30000)
    page.setDefaultNavigationTimeout(20000)
    await page.addInitScript(({ theme }) => {
      localStorage.setItem('dark-mode', String(theme === 'dark'))
      for (let v = 1; v <= 10; v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed')

    }, { theme })
    let questionRequests = 0
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname === '/api/ai-builder/question') { questionRequests++; return route.fulfill({ json: { answer: 'Synthetic acceptance response: describe the audience and desired deliverable.\n'.repeat(20) } }) }
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
    await page.getByText('Synthetic acceptance response: describe the audience and desired deliverable.', { exact: false }).first().waitFor()
    const initialHeight = await input.evaluate(el => el.getBoundingClientRect().height)
    assert.equal(initialHeight, 192, 'Keep the existing expanded default')
    const draft = 'Audience: founders. Return a markdown launch plan.\n'.repeat(40)
    await input.fill(draft)
    const dragTarget = async (target, handleName, delta) => {
      const handle = page.getByRole('button', { name: handleName, exact: true })
      await handle.scrollIntoViewIfNeeded()
      const box = await handle.boundingBox()
      assert(box && box.height === 12, 'The divider must use only 12px of vertical layout space')
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + delta, { steps: 12 })
      await page.mouse.up()
      return target.evaluate(el => el.getBoundingClientRect().height)
    }
    const drag = delta => dragTarget(input, 'Resize Builder prompt vertically', delta)
    const answer = page.locator('#builder-answer-content')
    const answerHandle = page.getByRole('button', { name: 'Resize Builder answer vertically', exact: true })
    await answerHandle.focus()
    for (let step = 0; step < 24; step++) await page.keyboard.press('ArrowUp')
    assert.equal(await answer.evaluate(el => el.getBoundingClientRect().height), 128, 'Answer minimum remains usable')
    assert(await answer.evaluate(el => el.scrollHeight > el.clientHeight), 'Long answers remain scrollable')
    const answerTaller = await dragTarget(answer, 'Resize Builder answer vertically', 90)
    assert(answerTaller > 180, 'Answer drag must grow independently')
    const answerShorter = await dragTarget(answer, 'Resize Builder answer vertically', -50)
    assert(answerShorter < answerTaller - 20, 'Answer drag must shrink independently')
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), initialHeight, 'Answer resizing must not resize the input')
    await answerHandle.focus(); await page.keyboard.press('Home')
    assert(await answer.evaluate(el => el.style.height === '' && el.style.flex === ''), 'Home restores the original answer layout')
    const shorter = await drag(-70)
    assert(shorter < initialHeight - 40 && shorter >= 88, 'Handle drag must shrink the expanded prompt')
    const taller = await drag(130)
    assert(taller > initialHeight + 20, 'Handle drag must grow the prompt')
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
    const handle = page.getByRole('button', { name: 'Resize Builder prompt vertically', exact: true })
    await handle.focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), 216)
    await page.keyboard.press('ArrowUp')
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), 192)
    await page.keyboard.press('Home')
    assert.equal(await input.evaluate(el => el.getBoundingClientRect().height), 192)
    if (width === 390) {
      await handle.scrollIntoViewIfNeeded()
      const box = await handle.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      assert(await input.evaluate(el => el.getBoundingClientRect().height) < 160, 'Touch dragging must shrink the prompt')
      await answerHandle.scrollIntoViewIfNeeded()
      const answerBox = await answerHandle.boundingBox(), ax = answerBox.x + answerBox.width / 2, ay = answerBox.y + answerBox.height / 2
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ax, y: ay }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ax, y: ay - 60 }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      assert(await answer.evaluate(el => Boolean(el.style.height)), 'Touch must resize the answer and cancel safely')
      await answerHandle.focus(); await page.keyboard.press('Home')
      await cdp.detach()
      await handle.focus(); await page.keyboard.press('Home')
    }
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
    console.log(`PASS Builder resize ${theme} ${width}: thin prompt/answer dividers, independent mouse/touch/keyboard resize, reset, draft, scrolling and actions`)
  }
} finally { await browser.close() }
