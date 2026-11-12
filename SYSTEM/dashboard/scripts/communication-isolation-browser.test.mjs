// Production components and contexts; synthetic API only, no model calls or real workspace writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { textContrast } from './lib/browser-contrast.mjs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = fs.mkdtempSync(path.join(root, 'client', '.communication-isolation-'))
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-communication-isolation'
fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import GroupChatPanel from '../src/components/GroupChatPanel'
import Communication from '../src/pages/Communication'
import { AuthProvider } from '../src/contexts/AuthContext'
import { ToastProvider } from '../src/components/Toast'
import { WorkspaceProvider, useWorkspace } from '../src/contexts/WorkspaceContext'
const surface = new URLSearchParams(location.search).get('surface')
localStorage.setItem('communication-view-mode', 'list')
const channel = (type, name) => ({ type, name, description: 'Synthetic isolation probe', tags: [], channels: [], community: null, members: [{id:'analyst',name:'Analyst',status:'online'}] })
const channels = { Alpha: channel('group', 'alpha'), Beta: channel('group', 'beta'), Community: channel('community', 'alpha'), Recovery: channel('group', 'recovery') }
function Harness() {
 const [current, setCurrent] = useState('Alpha')
 const { activeWorkspace, switchWorkspace } = useWorkspace()
 return <div style={{height: '100vh'}} className="h-screen flex flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
  <nav className="flex flex-wrap gap-2 p-2">{Object.keys(channels).map(name => <button key={name} onClick={()=>setCurrent(name)}>{name}</button>)}<button onClick={()=>void switchWorkspace('workspace-b')}>Workspace B</button><span data-workspace>{activeWorkspace?.id}</span></nav>
  <div className="flex-1 min-h-0">{surface === 'page' ? <Communication isActive /> : <GroupChatPanel channel={channels[current]} onClose={()=>{}} mode="pane" />}</div>
 </div>
}
document.documentElement.classList.toggle('dark', new URLSearchParams(location.search).get('theme') === 'dark')
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><WorkspaceProvider><Harness /></WorkspaceProvider></ToastProvider></AuthProvider>)
`)
async function bounded(promise) {
 let timer
 try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Expected intercepted request did not arrive')), 12000) })]) }
 finally { clearTimeout(timer) }
}
let browser
try {
 browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
 for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 1000 }, colorScheme: theme })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let active = 'workspace-a', delayAlpha = false, releaseAlpha, alphaStarted
  let delayBeta = true, releaseBeta, betaStarted
  let delayWorkspace = true, releaseWorkspace, workspaceStarted
  let holdRecovery = false, releaseRecovery, recoveryStarted
  const recoveryGate = new Promise(resolve => { recoveryStarted = resolve })
  const alphaGate = new Promise(resolve => { alphaStarted = resolve })
  const betaGate = new Promise(resolve => { betaStarted = resolve })
  const workspaceGate = new Promise(resolve => { workspaceStarted = resolve })
  const workspaces = ['workspace-a', 'workspace-b'].map(id => ({ id, name: id, path: `/tmp/${id}`, tags: [], agentCount: 1 }))
  await page.route('**/api/**', async route => {
   const req = route.request(), p = new URL(req.url()).pathname
   let body = {}
   if (p === '/api/auth/config') body = { authDisabled: true, deploymentKind: 'local', enabledRuntimes: ['openclaw'], aiEnabled: true }
   else if (p === '/api/auth/me') body = { authenticated: true, user: { id: 'fixture', login: 'fixture', role: 'admin' } }
   else if (p === '/api/workspaces') body = { workspaces }
   else if (p === '/api/workspaces/active') body = { workspace: workspaces.find(w => w.id === active) }
   else if (p === '/api/workspaces/workspace-b/activate') { assert.equal(req.method(), 'PUT'); active = 'workspace-b'; body = { ok: true } }
   else if (p.endsWith('/messages') || p.endsWith('/archives')) {
    assert.equal(req.method(), 'GET', 'isolation audit must not send messages or alter archives')
    const requestWorkspace = req.headers()['x-clawmax-workspace']
    if (requestWorkspace !== active) return route.fulfill({ status: 409, json: { code: 'workspace_changed', error: 'Workspace changed. Reopen this chat in the active workspace.' } })
    if (p.includes('/recovery/')) {
     if (holdRecovery && p.endsWith('/messages')) {
      holdRecovery = false
      await new Promise(resolve => { releaseRecovery = resolve; recoveryStarted() })
     }
     return route.fulfill({ status: 409, json: { code: 'message_history_recovery_required', error: 'This channel’s older history needs recovery because it may contain messages from more than one channel. Existing messages are unchanged. Contact the workspace owner before sending or clearing messages.' } })
    }
    if (p.endsWith('/archives')) body = { archives: [] }
    else {
     let content = p.includes('/communities/') ? 'COMMUNITY_ONLY' : p.includes('/beta/') ? 'BETA_ONLY' : active === 'workspace-b' ? 'WORKSPACE_B_ONLY' : 'ALPHA_ONLY'
     body = { messages: [{ id: content, from: 'User', content, mentions: [], timestamp: 1720000000000 }] }
     if (p.includes('/groups/alpha/') && active === 'workspace-a' && delayAlpha) {
      delayAlpha = false
      await new Promise(resolve => { releaseAlpha = resolve; alphaStarted() })
     } else if (p.includes('/groups/beta/') && delayBeta) {
      delayBeta = false
      await new Promise(resolve => { releaseBeta = resolve; betaStarted() })
     } else if (active === 'workspace-b' && delayWorkspace) {
      delayWorkspace = false
      await new Promise(resolve => { releaseWorkspace = resolve; workspaceStarted() })
     }
    }
   } else if (p === '/api/groups') body = { groups: [{ name: 'alpha', displayName: 'Alpha channel', description: 'Synthetic alpha', tags: [], channels: [] }, { name: 'beta', displayName: 'Beta channel', description: 'Synthetic beta', tags: [], channels: [] }] }
   else if (p === '/api/communities') body = { communities: [{ name: 'alpha', displayName: 'Alpha council', description: 'Synthetic council', tags: [], channels: [] }] }
   else if (p === '/api/agents') body = { agents: [{ id: 'analyst', name: 'Analyst', status: 'online', tags: [], skills: [], groups: [{ name: 'alpha' }, { name: 'beta' }], communities: [{ name: 'alpha' }] }], total: 1, hasMore: false }
   else if (p === '/api/docs') body = { entries: [] }
   else if (p === '/api/workflows') body = { workflows: [] }
   else if (p === '/api/agents/turns/active') body = { turns: [] }
   else if (p === '/api/activity-export/status') body = { agentforge: { configured: false }, destinations: [] }
   else if (p.includes('/models')) body = { models: [] }
   await route.fulfill({ json: body })
  })
  try {
   await page.goto(`${base}/${path.basename(fixture)}/index.html?theme=${theme}`)
   await page.getByText('ALPHA_ONLY', { exact: true }).waitFor()
   const input = page.locator('textarea').first()
   await input.fill('DRAFT_ALPHA')
   delayAlpha = true
   await bounded(alphaGate) // Hold a real 3-second poll from the old channel.
   await page.getByRole('button', { name: 'Beta', exact: true }).click()
   await bounded(betaGate)
   assert.equal(await page.getByText('ALPHA_ONLY', { exact: true }).count(), 0, 'old history must disappear before new fetch finishes')
   assert.equal(await input.inputValue(), '', 'draft must not move to another channel')
   releaseBeta()
   await page.getByText('BETA_ONLY', { exact: true }).waitFor()
   const lateResponse = page.waitForResponse(response => response.url().includes('/groups/alpha/messages'))
   releaseAlpha()
   await lateResponse
   assert.equal(await page.getByText('ALPHA_ONLY', { exact: true }).count(), 0, 'late old response must not overwrite the current chat')
   await page.getByRole('button', { name: 'Alpha', exact: true }).click()
   await page.getByText('ALPHA_ONLY', { exact: true }).waitFor()
   await page.getByRole('button', { name: 'Community', exact: true }).click()
   await page.getByText('COMMUNITY_ONLY', { exact: true }).waitFor()
   assert.equal(await page.getByText('ALPHA_ONLY', { exact: true }).count(), 0, 'same-named community has a distinct cache and effect')
   await page.getByRole('button', { name: 'Alpha', exact: true }).click()
   await page.getByText('ALPHA_ONLY', { exact: true }).waitFor()
   await page.getByRole('button', { name: 'Workspace B', exact: true }).click()
   await bounded(workspaceGate)
   assert.equal(await page.getByText('ALPHA_ONLY', { exact: true }).count(), 0, 'another workspace must never show the old cached channel')
   releaseWorkspace()
   await page.getByText('WORKSPACE_B_ONLY', { exact: true }).waitFor()
   await page.screenshot({ path: path.join(artifacts, `isolated-${theme}-${width}.png`) })
   const recoveryResponse = page.waitForResponse(response => response.url().includes('/recovery/messages'))
   await page.getByRole('button', { name: 'Recovery', exact: true }).click()
   await recoveryResponse
   const recovery = page.getByRole('alert').filter({ hasText: 'older history needs recovery' })
   await recovery.waitFor()
   holdRecovery = true
   await bounded(recoveryGate)
   assert(await recovery.isVisible(), 'recovery notice stays visible while a retry is pending')
   releaseRecovery()
   assert.equal(await page.getByText('No messages yet. Start a conversation below.', { exact: true }).count(), 0, 'recovery is not presented as empty history')
   assert.equal(await page.locator('textarea').first().isDisabled(), true, 'recovery blocks sending into ambiguous history')
   assert.equal(await page.getByText('WORKSPACE_B_ONLY', { exact: true }).count(), 0)
   assert((await textContrast(recovery)).ratio >= 4.5, 'recovery text stays readable in both themes')
   assert(await recovery.evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'recovery message fits phone width')
   await page.screenshot({ path: path.join(artifacts, `recovery-${theme}-${width}.png`) })
   if (width > 500) {
    await page.goto(`${base}/${path.basename(fixture)}/index.html?surface=page&theme=${theme}`)
    await page.getByText('Alpha channel', { exact: true }).click()
    await page.getByText('WORKSPACE_B_ONLY', { exact: true }).waitFor()
    await page.getByRole('row').filter({ hasText: 'Beta channel' }).getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByText('BETA_ONLY', { exact: true }).waitFor()
    assert.equal(await page.getByText('WORKSPACE_B_ONLY', { exact: true }).count(), 0, 'real page Open switches chats without closing the pane or retaining old history')
    await page.getByText('Alpha channel', { exact: true }).click()
    await page.getByText('WORKSPACE_B_ONLY', { exact: true }).waitFor()
   }
   assert.deepEqual(errors, [])
   console.log(`PASS ${theme} ${width}px: delayed response, channel/type/workspace caches, drafts and visible legacy recovery`)
  } catch (error) {
   await page.screenshot({ path: path.join(artifacts, `failure-${theme}-${width}.png`) })
   console.log('Browser errors:', errors)
   console.log((await page.locator('body').ariaSnapshot()).slice(-4500))
   throw error
  } finally {
   releaseAlpha?.(); releaseBeta?.(); releaseWorkspace?.(); releaseRecovery?.()
   await context.close()
  }
 }
} finally { await browser?.close(); fs.rmSync(fixture, { recursive: true, force: true }) }
