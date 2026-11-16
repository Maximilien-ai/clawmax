// Frontend-only regression: all API calls are synthetic; no templates are applied.
// Category, type, source, rating and search filters must agree on one result set across the
// grid and list views, and the counts shown must describe that set.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const base = process.env.TEST_FRONTEND_URL || 'http://127.0.0.1:5186'

const agent = (name, slug, source, tags) => ({ name, slug, type: 'agent', source, version: '1.0', description: 'Synthetic filter test', tags, agents: [{ id: slug, role: name, model: 'openai/gpt-5.4-mini' }] })
const org = (name, slug, kind, source, extra) => ({ name, slug, type: 'organization', kind, source, version: '1.0', description: 'Synthetic filter test', agents: [{ id: `${slug}-lead`, role: 'Lead' }], groups: [], communities: [], workflows: [], tags: [], ...extra })
// Agent templates carry no `category` field; only their tags can place them in a category.
const agents = [
  agent('Budget Buddy', 'budget-buddy', 'system', ['Personal', 'finance']),
  agent('Pipeline Fixer', 'pipeline-fixer', 'workspace', ['technical', 'ci-cd']),
  agent('Event Host', 'event-host', 'system', ['event']),
  agent('Chief Executive', 'chief-executive', 'system', ['ceo', 'leadership']),
]
const organizations = [
  org('Home Helpers', 'home-helpers', 'team', 'workspace', { category: 'personal' }),
  org('Build Crew', 'build-crew', 'team', 'system', { category: 'Technical' }),
  org('Launch Company', 'launch-company', 'company', 'system', { category: 'business' }),
  org('Lab Company', 'lab-company', 'company', 'system', { tags: ['science'] }),
]
const ALL = [...agents, ...organizations].map((template) => template.name)

try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.addInitScript(() => {
      window.EventSource = class { close() {} }
      for (let version = 1; version <= 10; version++) localStorage.setItem(`clawmax-workspace-tour:disable:v${version}`, 'dismissed')
      localStorage.setItem('templates-view-mode', 'grid')
    })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json = {}
      if (path === '/api/auth/config') json = { authDisabled: true }
      else if (path === '/api/auth/me') json = { authenticated: false }
      else if (path === '/api/system') json = { version: 'fixture', agentCount: 0, onlineCount: 0 }
      else if (path === '/api/workspaces') json = { workspaces: [] }
      else if (path === '/api/plugins') json = { plugins: [] }
      else if (path === '/api/templates') json = { agents, organizations, workflows: [] }
      else if (path === '/api/templates/feedback/summary') json = { summaries: { 'agent:budget-buddy': { count: 2, avgRating: 4.5 }, 'organization:home-helpers': { count: 1, avgRating: 3 } } }
      else if (path.includes('/agents') || path.includes('/skills') || path.includes('/workflows') || path.includes('/notifications') || path.includes('/groups') || path.includes('/communities')) json = []
      await route.fulfill({ json })
    })
    // After the catch-all so it takes precedence: the app mounts only once the API reports live.
    await page.route('**/api/health/live', route => route.fulfill({ json: { alive: true } }))
    await page.goto(`${base}/templates`)
    const main = page.getByRole('main')
    await main.getByText('Budget Buddy', { exact: true }).first().waitFor()

    // Category buttons are also named by their icon's label ("Personal Personal").
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const button = (name) => main.getByRole('button', { name: new RegExp(`^(${escape(name)} )?${escape(name)}$`) })
    const tab = (label) => main.getByRole('button', { name: new RegExp(`^${label} \\d+(/\\d+)?$`) })
    const shown = async () => {
      const names = []
      for (const name of ALL) if (await main.getByText(name, { exact: true }).count()) names.push(name)
      return names
    }
    const setView = async (view) => {
      await main.locator(`button[title="${view === 'grid' ? 'Grid view' : 'List view'}"]`).click()
      // Only the list view renders a table.
      await main.locator('table').first().waitFor({ state: view === 'list' ? 'visible' : 'detached' })
    }
    // expect(label, names, { agents, teams, companies }) checks both views, the header and every count.
    // Type tabs count matches of every type, so the All tab is their sum even while one type is shown.
    const expect = async (label, names, counts) => {
      for (const view of ['grid', 'list']) {
        await setView(view)
        assert.deepEqual(await shown(), names, `${width}px ${label} (${view}): visible templates`)
      }
      await setView('grid')
      const total = names.length
      const filtered = total !== ALL.length || counts.filtered
      assert.match(await main.locator('h1 + p').innerText(), new RegExp(filtered ? `^${total} matching template` : `^${ALL.length} templates$`), `${width}px ${label}: header count`)
      assert.equal((await tab('All').innerText()).replace(/\s+/g, ' '), filtered ? `All ${counts.agents + counts.teams + counts.companies}/${ALL.length}` : `All ${ALL.length}`, `${width}px ${label}: All tab count`)
      for (const [kind, count, of] of [['Agents', counts.agents, 4], ['Teams', counts.teams, 2], ['Companies', counts.companies, 2]]) {
        assert.equal((await tab(kind).innerText()).replace(/\s+/g, ' '), filtered ? `${kind} ${count}/${of}` : `${kind} ${of}`, `${width}px ${label}: ${kind} tab count`)
      }
    }

    await expect('no filters', ALL, { agents: 4, teams: 2, companies: 2 })

    await button('Personal').click()
    await expect('Personal', ['Budget Buddy', 'Home Helpers'], { agents: 1, teams: 1, companies: 0 })

    await button('Technical').click()
    await expect('Technical (case-insensitive category, agent tag)', ['Pipeline Fixer', 'Build Crew'], { agents: 1, teams: 1, companies: 0 })

    await button('Events').click()
    await expect('Events (singular event tag)', ['Event Host'], { agents: 1, teams: 0, companies: 0 })

    await button('Business').click()
    await expect('Business (no guessed categories)', ['Launch Company'], { agents: 0, teams: 0, companies: 1 })

    await button('All').first().click()
    await expect('All categories', ALL, { agents: 4, teams: 2, companies: 2 })

    await button('Personal').click()
    await button('4★+').click()
    await expect('Personal + 4★+', ['Budget Buddy'], { agents: 1, teams: 0, companies: 0 })
    await button('All Ratings').click()
    await button('Yours').click()
    await expect('Personal + Yours', ['Home Helpers'], { agents: 0, teams: 1, companies: 0 })
    await button('All Templates').click()
    await tab('Agents').click()
    await expect('Personal + Agents type', ['Budget Buddy'], { agents: 1, teams: 1, companies: 0, filtered: true })
    await tab('All').click()
    await button('Technical').click()
    await main.getByRole('textbox').first().fill('pipeline')
    await expect('Technical + search', ['Pipeline Fixer'], { agents: 1, teams: 0, companies: 0 })

    await button('Reset filters').click()
    await expect('after Reset filters', ALL, { agents: 4, teams: 2, companies: 2 })
    assert.equal(await button('Reset filters').count(), 0, `${width}px: Reset filters hides once nothing is filtered`)
    console.log(`PASS ${width}px category, type, source, rating, search and reset filters agree in grid and list views`)
    await page.close()
  }
} finally { await browser.close() }
