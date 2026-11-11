import assert from 'node:assert/strict'
import fs from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const plugin = JSON.parse(fs.readFileSync(new URL('../../../PLUGINS/public/clawmax-review/clawmax-plugin.json', import.meta.url)))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 for (const width of [1440,390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }); page.setDefaultTimeout(15000)
  let submissions = [], posts = 0, fail = true, configured = true
  const item = { id:'rc95-p10',name:'P10 — Refresh details',description:'Check the model refresh.',kind:'review-note',enabled:true,tags:[],fields:{release:'2.0.0-test-rc95',area:'regression',reviewReason:'human-judgment',outcome:'passed',completed:true,notes:'Verified in synthetic browser',owner:'Tester',evidence:[],verifiedBy:[]},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString() }
  await page.addInitScript(() => { window.EventSource=class {close(){}}; for(let v=1;v<=10;v++) localStorage.setItem(`clawmax-workspace-tour:disable:v${v}`,'dismissed') })
  await page.route('**/api/**',async route => {
   const path = new URL(route.request().url()).pathname; let json={}
   if(path==='/api/health/live') json={alive:true}
   else if(path==='/api/auth/config') json={authDisabled:true}
   else if(path==='/api/auth/me') json={authenticated:false}
   else if(path==='/api/system') json={version:'fixture-rc95',platform:'fixture',agentCount:0}
   else if(path==='/api/workspaces') json={workspaces:[]}
   else if(path==='/api/plugins') json={plugins:[plugin]}
   else if(path.endsWith('/context')) json={context:{agents:[],workflows:[],groups:[],communities:[]}}
   else if(path.endsWith('/items')) json={items:[item]}
   else if(path.endsWith('/templates')) json={templates:[]}
   else if(path.endsWith('/review-submissions')) {
    if(route.request().method()==='POST') {
     posts++; const body=route.request().postDataJSON(); assert.equal(body.consent,true); assert.equal(body.recipient,'review@example.com'); assert(body.report.includes('Refresh details')); assert(body.report.includes('fixture-rc95')); assert(!body.report.includes('Recent Runtime Errors'))
     if(fail) {fail=false;await route.fulfill({status:503,json:{error:'Synthetic delivery unavailable'}});return}
     const submission={...body,status:'accepted',createdAt:new Date().toISOString()};submissions=[submission];json={submission}
    } else json={submissions,emailConfigured:configured,recipient:'review@example.com'}
   }
   await route.fulfill({json})
  })
  await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://localhost:5183'}/plugins/plugin-review-notes`)
  const openExport=async()=>{
   await page.getByRole('button',{name:/^Actions/}).click()
   await page.getByRole('button',{name:/Export \/ submit release review/}).click()
   await page.getByText('Reviewer name',{exact:true}).locator('..').getByRole('textbox').fill('Daniyar fixture')
  }
  await openExport()
  await page.getByRole('button',{name:'Prepare email',exact:true}).click();assert.equal(posts,0)
  await page.getByRole('button',{name:'Send report to review@example.com',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Synthetic delivery unavailable'}).waitFor()
  await page.getByRole('button',{name:'Send report to review@example.com',exact:true}).click()
  await page.getByText(/Accepted by email provider/).waitFor();assert.equal(posts,2)
  await page.screenshot({path:`/private/tmp/rc95-review-email-${width}.png`})
  await page.reload();await openExport();await page.getByText(/Accepted by email provider/).waitFor()
  await page.getByRole('button',{name:'Download submitted report',exact:true}).waitFor()
  configured = false
  await page.reload(); await openExport()
  await page.getByText(/Email is not configured/).waitFor()
  assert.equal(await page.getByRole('button',{name:'Prepare email',exact:true}).isDisabled(),true)
  console.log(`PASS ${width}px: explicit report preview/recipient consent, error retry, persisted delivery status and download`)
  await page.close()
 }
}finally{await browser.close()}
