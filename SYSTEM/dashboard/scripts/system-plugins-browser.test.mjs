// Start Vite first. Run with PLAYWRIGHT_MODULE pointing to an installed playwright entry.
// All API traffic is intercepted; no operator settings or runtime plugins are modified.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.addInitScript(() => {
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
      localStorage.setItem('clawmax-system-nav-expanded', 'true')
    })
    let enabled = true, failLoad = false, failSave = false, writes = 0
    let runtimePlugins = [], runtimeReads = 0, runtimeWrites = 0, runtimeFail = false
    const entry = () => ({ id: 'example', slug: 'example', name: 'Example dashboard extension with a deliberately long display name', description: 'Synthetic dashboard extension for layout and persistence testing.', version: '1.0', visibility: 'public', enabled })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}, status = 200
      if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'test', agentCount: 0, onlineCount: 0 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins/settings') {
        if (route.request().method() === 'PUT') {
          writes++
          if (failSave) status = 500
          else enabled = route.request().postDataJSON().enabledPluginIds.includes('example')
        } else if (failLoad) status = 500
        json = { plugins: [entry()] }
      } else if (path === '/api/system/openclaw-plugins') {
        runtimeReads++
        if (runtimeFail) status = 500
        json = { plugins: runtimePlugins, history: [], canManage: true }
      } else if (path.startsWith('/api/system/openclaw-plugins/')) {
        runtimeWrites++
        assert.equal(route.request().postDataJSON().confirmRestartImpact, true)
        runtimePlugins[0].enabled = route.request().postDataJSON().enabled
        json = { changed: true }
      }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path.includes('/agents') || path.includes('/workflows') || path.includes('/notifications')) json = []
      await route.fulfill({ status, json })
    })
    await page.goto(`${base}/system/plugins#clawmax`)
    const save = page.getByRole('button', { name: 'Save', exact: true })
    await save.waitFor()
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('disabled')
    await page.getByText('No plugins match your search and status filter.', { exact: true }).waitFor()
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('enabled')
    assert.equal(await page.getByRole('checkbox').count(), 1)
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('all')
    await page.getByRole('checkbox').uncheck()
    await save.click()
    await page.getByRole('status').filter({ hasText: 'selection saved' }).waitFor()
    assert.equal(enabled, false)
    await page.reload()
    await page.getByRole('checkbox').waitFor()
    assert.equal(await page.getByRole('checkbox').isChecked(), false)
    failSave = true
    await save.click()
    await page.getByRole('alert').filter({ hasText: 'could not be saved' }).waitFor()
    await page.screenshot({ path: `/private/tmp/system-plugins-${width}-clawmax.png` })
    await page.getByRole('link', { name: 'OpenClaw Plugins', exact: true }).click()
    await page.getByText('No installed plugins reported by OpenClaw.').waitFor()
    await page.screenshot({ path: `/private/tmp/system-plugins-${width}-openclaw.png` })
    await page.goBack()
    await save.waitFor()
    assert.match(page.url(), /#clawmax$/)
    if (width === 1440) {
      await page.getByRole('link', { name: 'OpenClaw Plugins', exact: true }).click()
      await page.getByText('No installed plugins reported by OpenClaw.').waitFor()
      await page.getByRole('button', { name: 'Manage plugins', exact: true }).click()
      await save.waitFor()
      assert.match(page.url(), /\/system\/plugins#clawmax$/)
    }
    failLoad = true
    const priorWrites = writes
    await page.reload()
    await page.getByRole('alert').filter({ hasText: 'could not be loaded' }).waitFor()
    assert.equal(await save.isDisabled(), true)
    assert.equal(writes, priorWrites)
    await page.getByRole('link', { name: 'OpenClaw Plugins', exact: true }).click()
    await page.getByText('No installed plugins reported by OpenClaw.').waitFor()
    runtimePlugins = [
      { id: 'alpha', name: 'Alpha runtime', enabled: true, status: 'loaded', version: '1', origin: 'bundled' },
      { id: 'beta', name: 'Beta runtime', enabled: false, status: 'disabled', version: '1', origin: 'bundled' },
    ]
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    const alpha = page.getByRole('checkbox', { name: 'Enable Alpha runtime', exact: true })
    await alpha.waitFor()
    const cachedReads = runtimeReads
    await page.getByRole('link', { name: 'ClawMax Plugins and Extensions', exact: true }).click()
    await save.waitFor()
    await page.getByRole('link', { name: 'OpenClaw Plugins', exact: true }).click()
    await alpha.waitFor()
    assert.equal(runtimeReads, cachedReads, 'tab revisit must reuse inventory')
    if (width === 1440) {
      await page.getByRole('button', { name: 'Logs', exact: true }).click()
      await page.locator('aside').getByRole('button', { name: 'Plugins', exact: true }).click()
      await alpha.waitFor()
      assert.equal(runtimeReads, cachedReads, 'page revisit must reuse inventory')
    }
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('enabled')
    assert.equal(await page.getByRole('checkbox').count(), 1)
    await page.getByRole('searchbox', { name: 'Search plugins', exact: true }).fill('not present')
    await page.getByText('No plugins match your search and status filter.', { exact: true }).waitFor()
    await page.getByRole('searchbox', { name: 'Search plugins', exact: true }).fill('')
    await alpha.click()
    await page.getByRole('group', { name: 'Confirm plugin change' }).waitFor()
    assert.equal(runtimeWrites, 0, 'checkbox must not mutate before confirmation')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await alpha.isChecked(), true)
    await alpha.click()
    await page.getByRole('button', { name: 'Confirm change', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Configuration saved' }).waitFor()
    assert.equal(runtimeWrites, 1)
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('disabled')
    assert.equal(await page.getByRole('checkbox').count(), 2)
    assert.equal(await page.getByRole('button', { name: 'Install plugin', exact: true }).isDisabled(), true)
    await page.screenshot({ path: `/private/tmp/system-plugins-${width}-runtime-filters.png` })
    runtimeFail = true
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Could not load OpenClaw' }).waitFor()
    assert.equal(await alpha.isDisabled(), true)
    assert.equal(await page.getByRole('checkbox').count(), 2, 'failed refresh retains cached inventory')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.close()
    console.log(`PASS ${width}px: navigation/cache, shared filters, confirmation/cancel, save/persistence, stale/error states, disabled installation, overflow`)
  }
} finally { await browser.close() }
