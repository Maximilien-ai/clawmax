// Read-only synthetic UI regression; never starts an Agent or Workflow.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const id = 'tr-1234567890abcdef-workflow-123456789abc'
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    let status = 'completed'
    const workflow = () => ({ id, name: 'Daily Site Health', status, enabled: false, schedule: '0 8 * * *', executionMode: 'automated', description: 'Daily brief', targeting: { agents: [], groups: [], communities: [], tags: [] }, content: 'Produce a brief', participantCount: 2, lastRun: '2026-09-26T05:00:00Z' })
    const execution = () => ({ id: 'saved-run', workflowId: id, startedAt: '2026-09-26T05:00:00Z', status, triggerType: 'manual', participants: [], logs: [], brief: { title: 'Daily Site Health — Brief', content: '## Findings\nSynthetic report saved for this run.', artifactPath: 'ORG/reports/daily-site-health/latest-brief.md' } })
    await page.addInitScript(() => { window.EventSource = class { close() {} }; for (let v=1;v<=10;v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`, 'dismissed') })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}
      if (path === '/api/auth/config') json = { authDisabled: true, hostAuthBridgeReady: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 0 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/metering') json = { byAgent: [] }
      else if (path === '/api/workflows') json = { workflows: [workflow()] }
      else if (path === `/api/workflows/${id}`) json = workflow()
      else if (path === `/api/workflows/${id}/executions`) json = { executions: [execution()] }
      else if (path === `/api/workflows/${id}/executions/saved-run`) json = execution()
      else if (/agents|notifications|groups|communities/.test(path)) json = []
      await route.fulfill({ json })
    })
    for (status of ['completed', 'failed']) {
      await page.goto(`${base}/workflows`)
      const label = page.locator('span').filter({ hasText: /^Daily Site Health$/ })
      await label.waitFor()
      assert.match(await label.getAttribute('class'), status === 'completed' ? /text-emerald/ : /text-red/)
      await page.reload()
      await label.waitFor()
      assert.match(await label.getAttribute('class'), status === 'completed' ? /text-emerald/ : /text-red/)
      if (status === 'completed') {
        await label.click()
        await page.getByRole('button', { name: /completed.*9\/25\/2026|completed.*9\/26\/2026/ }).click()
        await page.getByRole('heading', { name: 'Daily Site Health — Brief', exact: true }).waitFor()
        await page.getByText('Synthetic report saved for this run.', { exact: true }).waitFor()
        await page.screenshot({ path: `/private/tmp/workflow-brief-${width}.png` })
      }
    }
    console.log(`PASS ${width}px: durable completed/failed colors and saved brief`)
    await page.close()
  }
} finally { await browser.close() }
