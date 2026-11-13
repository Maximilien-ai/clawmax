// Production components and contexts; synthetic API only, no model calls or real workspace writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.TEST_FRONTEND_URL || 'http://localhost:5174'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixture = fs.mkdtempSync(path.join(root, 'client', '.prompt-readiness-'))
const artifacts = process.env.CLAWMAX_BROWSER_ARTIFACT_DIR || '/tmp/clawmax-prompt-readiness'
fs.mkdirSync(artifacts, { recursive: true })
fs.writeFileSync(path.join(fixture, 'index.html'), '<div id="root"></div><script type="module" src="./fixture.tsx"></script>')
fs.writeFileSync(path.join(fixture, 'fixture.tsx'), `
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import AIPromptEditorModal from '../src/components/AIPromptEditorModal'
const domain = new URLSearchParams(location.search).get('domain') || 'general'
document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark')
function Harness(){const [generated,setGenerated]=useState('');return <><output data-testid="generated">{generated}</output><AIPromptEditorModal isOpen title="AI Editor" initialValue="Hello" placeholder="Score probe" qualityDomain={domain} onClose={()=>{}} onSave={()=>{}} onSaveAndGenerate={value=>setGenerated(value)} /></>}
createRoot(document.getElementById('root')!).render(<Harness />)
`)
const rich='Create an agent role for the team to read input data and return a markdown report; it must never send without approval every day, verify success criteria, trigger the workflow step, use the tool skill plugin with a deliverable result, and explain when to use it.'
let browser
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true})
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},colorScheme:theme})
  const page=await context.newPage();page.setDefaultTimeout(12000)
  const errors=[];let apiCalls=0;page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/api/**',route=>{apiCalls++;return route.fulfill({json:{}})})
  for(const domain of ['general','agent','skill','template','workflow','plugin','builder']){
   await page.goto(`${base}/${path.basename(fixture)}/index.html?theme=${theme}&domain=${domain}`)
   const panel=page.getByTestId('prompt-quality-panel'),input=page.getByPlaceholder('Score probe',{exact:true})
   await panel.getByText('5/100',{exact:true}).waitFor()
   const generate=page.getByRole('button',{name:'Save & Generate',exact:true})
   assert.equal(await generate.isEnabled(),true,'A low readiness score must remain advisory')
   await generate.click()
   assert.equal(await page.getByTestId('generated').textContent(),'Hello')
   await input.fill('')
   await panel.getByText('0/100',{exact:true}).waitFor()
   assert.equal(await generate.isEnabled(),false,'Empty-draft validation stays independent of readiness')
   await input.fill(rich)
   await panel.getByText('100/100',{exact:true}).waitFor()
   assert.equal(await panel.getByText(/detail 15\/15$/).count(),1)
   assert.equal(await panel.getByText('105/100',{exact:true}).count(),0)
   const progress=panel.locator('[aria-label="Prompt readiness 100 out of 100"]')
   await progress.locator('> div').evaluate(el=>Promise.all(el.getAnimations().map(animation=>animation.finished)))
   const bounds=await progress.boundingBox(),bar=await progress.locator('> div').boundingBox()
   assert(bounds&&bar&&bar.width<=bounds.width+1&&bar.width>=bounds.width-1)
   await generate.scrollIntoViewIfNeeded();const box=await generate.boundingBox()
   assert(box&&box.x>=0&&box.x+box.width<=width+1)
   assert.equal(await generate.isEnabled(),true)
   if(domain==='agent')await page.screenshot({path:path.join(artifacts,`${theme}-${width}-agent.png`),fullPage:true})
  }
  assert.equal(apiCalls,0,'Readiness scoring and the local editor callback make no provider/API calls')
  assert.deepEqual(errors,[])
  console.log(`PASS prompt readiness ${theme} ${width}: all seven domains, live 0/5/100 scores, full-width ceiling, advisory generation`)
  await context.close()
 }
}finally{await browser?.close();fs.rmSync(fixture,{recursive:true,force:true})}
