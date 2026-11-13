// Mount production dialogs with synthetic API data; no real workspace writes or provider requests.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { textContrast } from './lib/browser-contrast.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const dashboard = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = fs.mkdtempSync(path.join(dashboard, 'client', '.dialog-theme-'))
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-dialog-theme'
fs.mkdirSync(artifacts, { recursive: true })
// Exercise production class literals for the small popup controls without invoking their actions.
const ts = createRequire(import.meta.url)('typescript')
const hoverProbes = []
for (const relative of ['components/WorkspaceSwitcher.tsx', 'pages/Agents.tsx', 'pages/PluginWorkspacePage.tsx']) {
  const source = ts.createSourceFile(relative, fs.readFileSync(path.join(dashboard, 'client/src', relative), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer && ts.isStringLiteral(node.initializer)) {
      const classes = node.initializer.text
      if (/hover:bg-(?:sky|green|amber|red)-(?:50|100)\b/.test(classes) && /dark:text-(?:\w+)-(?:100|200|300)\b/.test(classes)) hoverProbes.push({ relative, classes })
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert(hoverProbes.some(probe => probe.relative === relative), `${relative}: production hover styles are covered`)
}

fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import SyncGroupsPanel from '../src/components/SyncGroupsPanel'
import CommunitiesManager from '../src/components/CommunitiesManager'
import DeleteAgentPanel from '../src/components/DeleteAgentPanel'
import SaveAsOrgTemplateModal from '../src/components/SaveAsOrgTemplateModal'
import WorkflowEditorDialog from '../src/components/WorkflowEditorDialog'
import { ConfirmDeleteDialog } from '../src/components/ConfirmDeleteDialog'
import DocHub from '../src/pages/DocHub'
const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
const noop = () => {}, done = async () => {}
const local = [{ name: 'Local orphan', description: 'A saved membership without a live session' }]
const hoverProbes = ${JSON.stringify(hoverProbes)}
const dialogs = {
 hover: <section className="p-6 space-y-4"><h2>Popup hover controls</h2>{hoverProbes.map((probe, index) => <button key={index} data-probe={index} className={probe.classes}>Popup action {index}</button>)}</section>,
 documents: <DocHub initialFile="ORG/fixture.md" />,
 sync: <SyncGroupsPanel agentId="fixture" agentName="Fixture Agent" localGroups={local} localCommunities={local} onClose={noop} onSynced={noop} />,
 memberships: <CommunitiesManager agentId="fixture" agentName="Fixture Agent" currentCommunities={[]} currentGroups={[]} onClose={noop} onSave={noop} />,
 delete: <DeleteAgentPanel agentId="fixture" onClose={noop} onDeleted={noop} />,
 confirm: <ConfirmDeleteDialog isOpen itemName="Fixture" itemType="workflow" warningMessage="Synthetic warning — nothing will be deleted" consequences={['One saved workflow']} onConfirm={noop} onCancel={noop} />,
 save: <SaveAsOrgTemplateModal agentCount={2} communityCount={1} groupCount={1} onClose={noop} onSuccess={noop} />,
 workflow: <WorkflowEditorDialog isOpen mode="create" onClose={noop} onSave={done} />,
}
createRoot(document.getElementById('root')!).render(<div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">{dialogs[params.get('dialog') || 'sync']}</div>)
`)
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
  for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const method = route.request().method()
      assert(method === 'GET' || (method === 'POST' && new URL(route.request().url()).pathname === '/api/docs/content'), 'only intercepted document validation may POST')
      const p = new URL(route.request().url()).pathname
      let body = {}
      if (p === '/api/docs/content' && method === 'POST') return route.fulfill({ status: 400, json: { error: 'Invalid document', validationErrors: [{ field: 'description', message: 'A required description is missing', value: '' }] } })
      if (p === '/api/docs') body = { entries: [{ path: 'ORG/fixture.md', section: 'ORG', kind: 'markdown' }] }
      else if (p === '/api/docs/content') body = { content: '# Fixture\nSynthetic document' }
      else if (p.endsWith('/wa-groups')) body = { groups: [{ name: 'Live group', key: 'g', description: 'Group description' }], communities: [{ name: 'Live community', key: 'c', description: 'Community description' }] }
      else if (p.endsWith('/impact')) body = { todoCount: 3, communityCount: 1, groupCount: 1, tags: ['built-in'] }
      else if (p === '/api/communities') body = { communities: [{ name: 'Live community', description: 'Community description' }] }
      else if (p === '/api/groups') body = { groups: [{ name: 'Live group', description: 'Group description' }] }
      else if (p === '/api/agents') body = { agents: [{ id: 'fixture', name: 'Fixture Agent', status: 'online' }] }
      else if (p === '/api/teams') body = { teams: [] }
      else if (p === '/api/workflows') body = { workflows: [] }
      await route.fulfill({ json: body })
    })
    for (const name of ['sync', 'memberships', 'delete', 'confirm', 'save', 'workflow', 'documents', 'hover']) {
      await page.goto(`${base}/${path.basename(fixture)}/index.html?dialog=${name}&theme=${theme}`)
      await page.getByRole('heading').first().waitFor()
      if (name === 'documents') {
        await page.getByRole('button', { name: 'Edit', exact: true }).click()
        await page.getByRole('textbox', { name: 'Document content' }).fill('Invalid synthetic document')
        await page.getByRole('button', { name: 'Save', exact: true }).click()
        const error = page.getByText('A required description is missing', { exact: true })
        await error.waitFor()
        assert((await textContrast(error)).ratio >= 4.5, `${theme} ${width}: validation message stays readable`)
      }
      await page.addStyleTag({ content: '* { transition: none !important; }' })
      if (name === 'hover') {
        for (const button of await page.locator('[data-probe]').all()) {
          await button.hover()
          const colors = await textContrast(button)
          if (theme === 'dark') assert(colors.ratio >= 4.5, `popup hover must retain dark-theme contrast: ${JSON.stringify(colors)}`)
        }
      }
      if (name === 'sync') {
        await page.getByText('Live community', { exact: true }).waitFor()
        // Both accent colors, orphaned selected/unselected rows and their descriptions.
        for (const label of ['Live community', 'Live group', 'Local orphan', 'Community description', 'Group description', 'A saved membership without a live session']) {
          for (const text of await page.getByText(label, { exact: true }).all()) {
            assert((await textContrast(text)).ratio >= 4.5, `${theme} ${width} ${name}: ${label} must be readable`)
          }
        }
        for (const row of await page.locator('label').filter({ hasText: 'Local orphan' }).all()) await row.click()
        for (const text of await page.getByText('Local orphan', { exact: true }).all()) assert((await textContrast(text)).ratio >= 4.5, `${theme} ${width}: selected orphan must be readable`)
        await page.screenshot({ path: path.join(artifacts, `${name}-${theme}-${width}.png`) })
      }
      // Catch the reported failure across all mounted dialogs: pale surfaces with pale text.
      const labels = page.locator('h2, p, label, button, span').filter({ visible: true })
      for (const text of await labels.all()) {
        if (!(await text.innerText()).trim()) continue
        const colors = await textContrast(text)
        const pale = rgb => rgb.every(channel => channel > 170)
        assert(!(pale(colors.background) && pale(colors.foreground) && colors.ratio < 3), `${name} ${theme} ${width}: light text on pale background: ${await text.innerText()}`)
      }
      if (name !== 'sync') await page.screenshot({ path: path.join(artifacts, `${name}-${theme}-${width}.png`) })
      assert.deepEqual(errors, [], `${name}: no browser errors`)
      console.log(`PASS ${name}: ${theme} ${width}px dialog contrast`)
    }
    await context.close()
  }
} finally {
  await browser?.close()
  fs.rmSync(fixture, { recursive: true, force: true })
}
