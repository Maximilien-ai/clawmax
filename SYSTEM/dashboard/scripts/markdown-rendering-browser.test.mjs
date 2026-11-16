// Production chat/document components with synthetic Markdown and intercepted APIs.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dashboard = process.env.TEST_DASHBOARD_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5192'
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-markdown-rendering'
const fixture = fs.mkdtempSync(path.join(dashboard, 'client/.markdown-rendering-'))
const code = '{\n  "status": "ready",\n  "long": "' + 'retained-'.repeat(24) + '"\n}'
const markdown = '# Synthetic release report\n\n| Item | Result | Evidence |\n| --- | --- | --- |\n| Chat | **Passed** | Saved history |\n\n- [x] Verified\n- [ ] Pending\n\n~~Superseded~~\n\n[Report file](workspace-file:ORG/report.md) and [Safe web](https://example.com/report).\n\n[Unsafe](javascript:alert%281%29)\n\n<script>window.__injected = true</script>\n\n```json\n' + code + '\n```'
fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(path.join(fixture, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client'; import '../src/index.css';
import {AuthProvider} from '../src/contexts/AuthContext'; import {ToastProvider} from '../src/components/Toast';
import AgentChatPanel from '../src/components/AgentChatPanel'; import {MarkdownDocumentViewer} from '../src/components/MarkdownDocumentViewer';
const params=new URLSearchParams(location.search); document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><main className="min-h-screen bg-white p-4 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
{params.get('surface')==='chat'?<AgentChatPanel agentId="markdown-fixture" agentName="Markdown rendering fixture" agentStatus="online" agentGeneration="fixture-v1" onClose={()=>{}} onNavigateToDoc={value=>{window.__openedDocument=value}}/>:<MarkdownDocumentViewer source={${JSON.stringify(markdown)}} path="ORG/report.md" onDownloadMarkdown={()=>{}}/>}
</main></ToastProvider></AuthProvider>);
`)
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], colorScheme: theme })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://**', route => route.abort())
    await page.route('**/api/**', async route => {
      const p = new URL(route.request().url()).pathname
      assert(route.request().method() === 'GET' || (route.request().method() === 'POST' && p === '/api/agents/markdown-fixture/chat/readiness'), 'Only intercepted readiness may POST; chat and workspace mutations are forbidden')
      let body = {}
      if (p === '/api/auth/config') body = { authDisabled: true, deploymentKind: 'local', enabledRuntimes: ['openclaw'] }
      else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture' } }
      else if (p.endsWith('/chat/messages')) body = { messages: [{ id: 'answer', role: 'assistant', content: markdown, timestamp: 1 }] }
      else if (p.endsWith('/chat/archives')) body = { archives: [] }
      else if (p.endsWith('/turns/active')) body = { turns: [] }
      else if (p.endsWith('/gateway') || p.endsWith('/chat/readiness')) body = { available: true }
      else if (p === '/api/docs') body = { entries: [{ path: 'ORG/report.md', section: 'ORG', kind: 'markdown' }] }
      else if (p === '/api/groups') body = { groups: [] }
      else if (p === '/api/communities') body = { communities: [] }
      await route.fulfill({ json: body })
    })
    for (const surface of ['document', 'chat']) {
      await page.goto(`${base}/${path.basename(fixture)}/index.html?surface=${surface}&theme=${theme}`)
      await page.getByRole('heading', { name: 'Synthetic release report', exact: true }).waitFor()
      assert.equal(await page.evaluate(() => document.compatMode), 'CSS1Compat')
      assert.equal(await page.getByRole('table').count(), 1)
      assert.equal(await page.locator('input[type="checkbox"][disabled]').count(), 2)
      assert.equal(await page.locator('a[href^="javascript:"]').count(), 0)
      assert.equal(await page.evaluate(() => window.__injected), undefined)
      assert.equal(await page.getByRole('link', { name: 'Safe web', exact: true }).getAttribute('href'), 'https://example.com/report')
      if (surface === 'chat') {
        assert.equal(await page.getByText('History could not be loaded', { exact: true }).count(), 0)
        const file = page.getByRole('button', { name: 'Report file', exact: true })
        await file.click()
        assert.equal(await page.evaluate(() => window.__openedDocument), 'ORG/report.md')
        const copy = page.getByRole('button', { name: 'Copy json code', exact: true })
        await copy.click()
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code)
        await page.getByText('Copied', { exact: true }).waitFor()
        await copy.scrollIntoViewIfNeeded()
      } else {
        assert.equal(await page.getByRole('link', { name: 'Report file', exact: true }).getAttribute('href'), '')
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      assert.equal(overflow, false, `${surface} ${theme} ${width}: no page-wide horizontal overflow`)
      await page.screenshot({ path: path.join(artifacts, `${surface}-${theme}-${width}.png`), fullPage: false, animations: 'disabled' })
      if (surface === 'document') {
        await page.getByRole('button', { name: 'Markdown', exact: true }).click()
        assert.equal(await page.locator('pre').textContent(), markdown)
        await page.getByRole('button', { name: 'Preview', exact: true }).click()
        await page.getByRole('heading', { name: 'Synthetic release report', exact: true }).waitFor()
      }
      assert.deepEqual(errors, [])
      console.log(`PASS ${surface} ${theme} ${width}: formatting, safe links, source integrity and responsive rendering`)
    }
    await context.close()
  }
} finally {
  await browser?.close()
  fs.rmSync(fixture, { recursive: true, force: true })
}
