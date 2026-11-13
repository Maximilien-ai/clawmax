// Production components and contexts; synthetic API only, no model calls or real workspace writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = fs.mkdtempSync(path.join(root, 'client', '.workflow-deletion-'))
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-workflow-deletion'
fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import Workflows from '../src/pages/Workflows'
import { AuthProvider } from '../src/contexts/AuthContext'
import { ToastProvider } from '../src/components/Toast'
import { WorkspaceProvider } from '../src/contexts/WorkspaceContext'
localStorage.setItem('workflows-view-mode','grid')
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark')
createRoot(document.getElementById('root')!).render(<AuthProvider><ToastProvider><WorkspaceProvider><div className="min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"><Workflows isActive /></div></WorkspaceProvider></ToastProvider></AuthProvider>)
`)
let browser
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:theme})
  const page=await context.newPage();page.setDefaultTimeout(15000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  let allowed=false,releaseDeleted
  const held=new Promise(resolve=>{releaseDeleted=resolve}),calls=[]
  const row=(id,name)=>({id,name,description:'Synthetic scheduler fixture',schedule:'0 9 * * *',scheduleHuman:'Daily at 09:00',enabled:false,timezone:'UTC',targeting:{agents:[],groups:[],communities:[],tags:[],teamIds:[]},participantCount:0,executionMode:'automated',status:'idle',content:'# Synthetic',created:'2026-11-11T00:00:00Z',modified:'2026-11-11T00:00:00Z'})
  const rows=new Map([['retained',row('retained','Retained schedule')],['deleted',row('deleted','Deleted schedule')]])
  await page.route('**/api/**',async route=>{
   const req=route.request(),p=new URL(req.url()).pathname;let body={}
   if(req.method()==='DELETE'){
    const id=p.split('/').at(-1);assert(['retained','deleted'].includes(id));calls.push(id)
    if(id==='retained'&&!allowed)return route.fulfill({status:503,json:{code:'workflow_legacy_cleanup_failed',error:'/private/runtime/token'}})
    if(id==='deleted')await held
    rows.delete(id);return route.fulfill({json:{message:'Workflow deleted successfully'}})
   }
   if(req.method()!=='GET')return route.fulfill({json:{}})
   if(p==='/api/auth/config')body={authDisabled:true,deploymentKind:'local',enabledRuntimes:['openclaw'],aiEnabled:true}
   else if(p==='/api/auth/me')body={authenticated:true,user:{id:'fixture',login:'fixture',role:'admin'}}
   else if(p==='/api/workspaces')body={workspaces:[{id:'fixture',name:'Scheduler fixtures',path:'/tmp/synthetic',tags:[]}]}
   else if(p==='/api/workspaces/active')body={workspace:{id:'fixture',name:'Scheduler fixtures',path:'/tmp/synthetic',tags:[]}}
   else if(p==='/api/workflows')body={workflows:[...rows.values()]}
   else if(p.endsWith('/pipeline-state'))body={paused:false}
   else if(p.includes('executions'))body={executions:[]}
   else if(p==='/api/agents')body={agents:[],hasMore:false,total:0}
   else if(p==='/api/groups')body={groups:[]}
   else if(p==='/api/communities')body={communities:[]}
   else if(p.includes('relationships'))body={relationships:[]}
   await route.fulfill({json:body})
  })
  await page.goto(`${base}/${path.basename(fixture)}/index.html?theme=${theme}`)
  const retained=page.getByText('Retained schedule',{exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]').filter({has:page.getByTitle('Actions',{exact:true})});await retained.waitFor()
  await retained.getByTitle('Actions',{exact:true}).click()
  await page.getByRole('button',{name:'Delete',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Delete workflows',exact:true})
  await dialog.locator('#confirm-name').fill('Retained schedule')
  await dialog.getByRole('button',{name:'Delete workflows',exact:true}).click()
  await page.getByText(/The workflow was kept because/).first().waitFor()
  assert.equal(await retained.count(),1);assert.equal(await dialog.count(),1)
  assert(!(await page.locator('body').innerText()).includes('/private/runtime/token'))
  const box=await dialog.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1)
  await page.getByRole('alert').first().evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)))
  const notice=await page.getByRole('alert').first().boundingBox();assert(notice&&notice.x>=0&&notice.x+notice.width<=width+1)
  await page.screenshot({path:path.join(artifacts,`${theme}-${width}-retained.png`),fullPage:true})
  await page.getByRole('button',{name:'Dismiss notification',exact:true}).click()
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByTitle('Select multiple workflows',{exact:true}).click()
  await page.getByRole('button',{name:'Select All',exact:true}).click()
  await page.getByRole('button',{name:'Delete',exact:true}).click()
  await dialog.locator('#confirm-name').fill('2 workflows')
  await dialog.getByRole('button',{name:'Delete workflows',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('[role="dialog"]')!==null)
  assert.equal(await page.getByText('Deleted schedule',{exact:true}).count(),1)
  releaseDeleted()
  await page.getByText('1 workflow selected',{exact:true}).waitFor()
  await page.getByText(/1 kept; 1 deleted/).waitFor()
  assert.equal(await page.getByText('Deleted schedule',{exact:true}).count(),0)
  await page.getByRole('alert').first().evaluate(node=>Promise.all(node.getAnimations().map(animation=>animation.finished)))
  await page.screenshot({path:path.join(artifacts,`${theme}-${width}-partial.png`),fullPage:true})
  allowed=true
  await page.getByRole('button',{name:'Delete',exact:true}).click()
  await dialog.locator('#confirm-name').fill('1 workflow')
  await dialog.getByRole('button',{name:'Delete workflows',exact:true}).click()
  await page.waitForFunction(()=>![...document.querySelectorAll('span')].some(n=>n.textContent==='Retained schedule'))
  assert.equal(await retained.count(),0)
  assert.equal(calls.filter(id=>id==='deleted').length,1);assert.equal(calls.filter(id=>id==='retained').length,3)
  assert.deepEqual(errors,[])
  console.log(`PASS workflow deletion ${theme} ${width}: retained error, settled partial result and retry`)
  await context.close()
 }
}finally{await browser?.close();fs.rmSync(fixture,{recursive:true,force:true})}
