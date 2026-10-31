import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
 for (const width of [1440,390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto(`${process.env.TEST_FRONTEND_URL || 'http://localhost:5197'}/test-fixtures/workflow-kickoff.html`)
  const kickoff = page.getByText('Kickoff Personal Operations', { exact: true }).last()
  await kickoff.waitFor()
  const names = ['Kickoff Personal Operations','Build Playbooks','Assemble Cadence','Finalize Personal Operations']
  const boxes = await Promise.all(names.map(name => page.getByText(name,{exact:true}).last().boundingBox()))
  for(let i=1;i<boxes.length;i++) assert(boxes[i].y > boxes[i-1].y + boxes[i-1].height, `${names[i]} follows ${names[i-1]} top to bottom`)
  await page.screenshot({path:`/private/tmp/rc97-kickoff-${width}.png`,fullPage:true})
  await page.close()
  console.log(`PASS ${width}px kickoff-first graph`)
 }
} finally { await browser.close() }
