// Production chat panel; synthetic API, accelerated polling, no model calls or real user data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5190'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = fs.mkdtempSync(path.join(root, 'client/.chat-lifecycle-'))
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-chat-lifecycle'
fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React from 'react';import {createRoot} from 'react-dom/client';import '../src/index.css';
import {AuthProvider} from '../src/contexts/AuthContext';import {ToastProvider} from '../src/components/Toast';import AgentChatPanel from '../src/components/AgentChatPanel';
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');window.__closed=0;
createRoot(document.getElementById('root')!).render(<ToastProvider><AuthProvider><AgentChatPanel agentId="lifecycle-probe" agentName="Conversation acceptance agent with a long name" agentStatus="online" agentGeneration="fixture-v1" onClose={()=>{window.__closed++}} /></AuthProvider></ToastProvider>);
`)
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const until = async predicate => { for (let i = 0; i < 150; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error('Timed out waiting for synthetic API barrier') }
try {
 for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
  const context = await browser.newContext({viewport:{width,height:width===390?844:1000}})
  const page = await context.newPage();page.setDefaultTimeout(12000)
  await page.addInitScript(() => {
   const original=window.setInterval.bind(window)
   window.setInterval=(callback,delay,...args)=>original(callback,delay===3000?80:delay===5000?100:delay,...args)
  })
  const saved=[{id:'saved-u',role:'user',content:'Saved question',timestamp:1},{id:'saved-a',role:'assistant',content:'Saved answer',timestamp:2}]
  let messages=[...saved],ended=[],historyError=false,active=false,holdNext=false,held,heldStatus=410,releaseHistory,clearHeld,releaseClear,failRestore=false,failDetail=false,posts=0,gets=0
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/api/**',async route=>{
   const p=new URL(route.request().url()).pathname,method=route.request().method()
   let body={}
   if(p==='/api/auth/config')body={authDisabled:true,deploymentKind:'local',enabledRuntimes:['openclaw']}
   else if(p==='/api/auth/me')body={authenticated:true,user:{id:'fixture',login:'fixture'}}
   else if(p.endsWith('/chat/messages')&&method==='GET'){
    gets++
    if(holdNext){holdNext=false;held=true;const snapshot=[...messages],status=heldStatus;await new Promise(resolve=>{releaseHistory=resolve});return route.fulfill({status,json:status===200?{messages:snapshot}:{error:'Superseded history response'}})}
    return route.fulfill({status:historyError?500:200,json:historyError?{error:'Synthetic history unavailable'}:{messages}})
   }else if(p.endsWith('/chat/messages')&&method==='DELETE'){
    clearHeld=true;await new Promise(resolve=>{releaseClear=resolve});ended=[{filename:'session:ended-1',timestamp:3,messageCount:saved.length,title:'Saved thread',kind:'conversation',resumable:true}];messages=[];body={ok:true,archived:true}
   }else if(p.endsWith('/reset-session')){ended=[{filename:'session:ended-1',timestamp:4,messageCount:saved.length,title:'Saved thread',kind:'conversation',resumable:true}];messages=[];body={ok:true}}
   else if(p.endsWith('/chat/archives'))body={archives:ended}
   else if(p.endsWith('/restore')){if(failRestore)return route.fulfill({status:409,json:{error:'Synthetic reply is still running'}});messages=[...saved];ended=[];body={ok:true,sessionId:'ended-1',messages}}
   else if(p.includes('/chat/archives/')){
    if(method==='DELETE'){ended=[];body={ok:true,removedFromHistory:true}}
    else{if(failDetail)return route.fulfill({status:500,json:{error:'Synthetic archive unavailable'}});body={messages:saved}}
   }else if(p.endsWith('/turns/active'))body={turns:active?[{turnId:'other-tab-turn',agentId:'lifecycle-probe',elapsedMs:100,idleMs:0}]:[]}
   else if(p.endsWith('/gateway')||p.endsWith('/chat/readiness'))body={available:true}
   else if(p.endsWith('/chat')&&method==='POST'){posts++;body={error:'No real execution in this fixture'}}
   else if(p==='/api/docs')body={docs:[]}
   else if(p==='/api/groups')body={groups:[]}
   else if(p==='/api/communities')body={communities:[]}
   await route.fulfill({json:body})
  })
  try{
   await page.goto(`${base}/${path.basename(fixture)}/index.html?theme=${theme}`)
   await page.getByText('Saved answer',{exact:true}).waitFor()
   const clear=page.locator('button[title="Clear messages"]'),reset=page.locator('button[title^="Start a new conversation"]'),input=page.getByRole('textbox',{name:'Message agent',exact:true})
   historyError=true;await page.getByText('Chat history could not be loaded',{exact:true}).waitFor();assert.equal(await page.getByText('Saved answer',{exact:true}).count(),1)
   historyError=false;await page.getByText('Chat history could not be loaded',{exact:true}).waitFor({state:'hidden'})
   holdNext=true;await until(()=>held);const heldGets=gets;await page.waitForTimeout(240);assert.equal(gets,heldGets,'Slow polls must not overlap')
   await clear.click();await page.getByRole('heading',{name:'Clear Chat?',exact:true}).waitFor()
   await page.screenshot({path:`${artifacts}/${theme}-${width}-clear.png`,animations:'disabled'})
   await page.getByRole('button',{name:'Clear & Archive',exact:true}).click();await until(()=>clearHeld)
   assert(await clear.isDisabled());assert(await reset.isDisabled())
   assert(await input.isDisabled());assert.equal(posts,0)
   releaseClear();await page.getByText('Start a conversation with Conversation acceptance agent with a long name',{exact:true}).waitFor()
   releaseHistory();await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.__closed),0,'An obsolete 410 cannot close the new conversation')
   assert.equal(await page.getByText('Superseded history response',{exact:false}).count(),0)
   await page.locator('button[title="View chat history"]').click();await page.getByText('Saved thread',{exact:true}).click()
   await page.getByRole('heading',{name:'Archived Chat',exact:true}).waitFor()
   assert(await page.locator('button[title="Download as text file"]').evaluate(el=>{const b=el.getBoundingClientRect();return b.x>=0&&b.right<=innerWidth&&b.y>=0&&b.bottom<=innerHeight}),'Archive actions must fit at phone width')
   const proceed=page.locator('button[title="Continue this conversation"]')
   failRestore=true;await proceed.click();await page.getByText('Synthetic reply is still running',{exact:true}).first().waitFor()
   assert.equal(await page.getByText('Saved answer',{exact:true}).count(),1,'Failed Continue retains the archived transcript')
   failRestore=false;await proceed.click();await page.getByRole('heading',{name:'Archived Chat',exact:true}).waitFor({state:'hidden'})
   await page.getByText('Saved answer',{exact:true}).waitFor();await page.waitForTimeout(250)
   assert.equal(await page.getByText('Saved answer',{exact:true}).count(),1,'Polling never duplicates the restored response')
   active=true;await page.waitForTimeout(180)
   assert(await reset.isDisabled());assert(await page.locator('button[title*="Wait for the reply"]').first().isDisabled())
   active=false;await reset.waitFor();await page.waitForTimeout(180)
   await reset.click();await page.getByText('Start a conversation with Conversation acceptance agent with a long name',{exact:true}).waitFor()
   await page.locator('button[title="View chat history"]').click()
   failDetail=true;await page.getByText('Saved thread',{exact:true}).click();await page.getByText('Could not load the chat from History: Synthetic archive unavailable',{exact:true}).first().waitFor()
   assert.equal(await page.getByRole('heading',{name:'Archived Chat',exact:true}).count(),0,'Failed detail cannot display a fake empty conversation')
   failDetail=false;await page.getByText('Saved thread',{exact:true}).click();await page.getByRole('heading',{name:'Archived Chat',exact:true}).waitFor()
   await page.locator('button[title="Delete archive"]').click();await page.getByRole('heading',{name:'Remove from History?',exact:true}).waitFor()
   await page.getByText('The stored transcript is kept; this removes only its History entry.',{exact:false}).waitFor()
   await page.screenshot({path:`${artifacts}/${theme}-${width}-history.png`,animations:'disabled'})
   assert.deepEqual(errors,[])
   console.log(`PASS chat lifecycle ${theme} ${width}: reconciliation, poll errors/staleness, action guards, Clear/Reset/Continue, History failures and removal wording`)
  }finally{if(releaseHistory)releaseHistory();if(releaseClear)releaseClear();await context.close()}
 }
}finally{await browser.close();fs.rmSync(fixture,{recursive:true,force:true})}
