import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'template-workspace',
    workspaces: [{
      id: 'template-workspace',
      name: 'Template Workspace',
      path: workspacePath,
      createdAt: '2026-06-01T00:00:00.000Z',
      lastAccessedAt: '2026-06-01T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function loadRouter(overrides: {
  templates?: Partial<typeof import('../lib/templates')>
  workflows?: Partial<typeof import('../lib/workflows')>
  templateFeedback?: Partial<typeof import('../lib/template-feedback')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['../lib/templates', overrides.templates],
    ['../lib/workflows', overrides.workflows],
    ['../lib/template-feedback', overrides.templateFeedback],
  ]

  for (const [modulePath, patch] of moduleOverrides) {
    const resolved = require.resolve(modulePath)
    delete require.cache[resolved]
    if (patch) Object.assign(require(resolved), patch)
  }

  const routePath = require.resolve('./templates')
  delete require.cache[routePath]
  return require(routePath).default
}

function getRouteHandler(
  method: 'get' | 'post',
  routePath: string,
  overrides: Parameters<typeof loadRouter>[0] = {},
) {
  const router = loadRouter(overrides)
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    send(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Template Route Edge Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-route-edges-home-'))
  const tmpWorkspace = path.join(tmpHome, 'workspaces', 'template-workspace')
  ensureWorkspaceScaffold(tmpWorkspace)
  writeWorkspaceRegistry(tmpHome, tmpWorkspace)
  fs.mkdirSync(path.join(tmpHome, '.openclaw', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { list: [] } }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = tmpWorkspace

  await test('template feedback summary route returns summarized template keys', async () => {
    const handler = getRouteHandler('get', '/feedback/summary', {
      templates: {
        listTemplates: (type?: string) => {
          if (type === 'agent') return [{ name: 'Agent Alpha', slug: 'agent-alpha', type: 'agent' }]
          if (type === 'organization') return [{ name: 'Org Beta', slug: 'org-beta', type: 'organization' }]
          return []
        },
      } as any,
      templateFeedback: {
        getAllTemplateFeedbackSummaries: async (templates: Array<{ templateType: string; templateSlug: string }>) => ({
          keys: templates.map((entry) => `${entry.templateType}:${entry.templateSlug}`),
        }),
      } as any,
    })
    const res = makeRes()
    await handler(makeReq(), res)
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.jsonBody?.summaries?.keys, ['agent:agent-alpha', 'organization:org-beta'])
  })

  await test('template feedback summary route surfaces loader failures as HTTP 500', async () => {
    const handler = getRouteHandler('get', '/feedback/summary', {
      templateFeedback: {
        getAllTemplateFeedbackSummaries: async () => {
          throw new Error('feedback store unavailable')
        },
      } as any,
    })
    const res = makeRes()
    await handler(makeReq(), res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(res.jsonBody?.error, 'feedback store unavailable')
  })

  await test('workflow export markdown route returns markdown payload and headers', async () => {
    const handler = getRouteHandler('get', '/workflows/:id/export-md', {
      workflows: {
        getWorkflow: (id: string) => ({ id, name: 'Daily Sync' }),
        workflowToMarkdown: (workflow: any) => `---\nid: ${workflow.id}\nname: ${workflow.name}\n---\nbody`,
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({ params: { id: 'daily-sync' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['Content-Type'], 'text/markdown')
    assert.strictEqual(res.headers['Content-Disposition'], 'attachment; filename="daily-sync.md"')
    assert(/name: Daily Sync/.test(String(res.jsonBody || '')), 'Expected workflow markdown body')
  })

  await test('template markdown import writes organization agent files on success', async () => {
    let savedTemplate: any = null
    let savedDir = ''
    const handler = getRouteHandler('post', '/import-md', {
      templates: {
        validateImportedTemplateMd: () => ({
          valid: true,
          warnings: ['import warning'],
          template: {
            type: 'organization',
            name: 'Imported Org',
            slug: 'imported-org',
            agents: [],
          },
          agentFiles: {
            'research-lead': {
              'IDENTITY.md': '# identity',
              'SOUL.md': '# soul',
            },
          },
        }),
        saveTemplate: (template: any) => {
          savedTemplate = template
          savedDir = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'imported-org')
          fs.mkdirSync(savedDir, { recursive: true })
          return { ok: true, path: savedDir }
        },
        slugify: () => 'imported-org',
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({ body: { content: '# TEMPLATE.md' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.jsonBody?.ok, true)
    assert.strictEqual(savedTemplate?.name, 'Imported Org')
    assert.deepStrictEqual(res.jsonBody?.warnings, ['import warning'])
    assert.strictEqual(fs.readFileSync(path.join(savedDir, 'agents', 'research-lead', 'IDENTITY.md'), 'utf-8'), '# identity')
    assert.strictEqual(fs.readFileSync(path.join(savedDir, 'agents', 'research-lead', 'SOUL.md'), 'utf-8'), '# soul')
  })

  await test('workflow markdown import route returns createWorkflow validation failures', async () => {
    const handler = getRouteHandler('post', '/workflows/import-md', {
      workflows: {
        parseWorkflowMd: () => ({ id: 'sync-1', name: 'Sync 1' }),
        createWorkflow: () => ({ success: false, error: 'Workflow already exists', errors: ['duplicate workflow id'] }),
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({ body: { content: '# WORKFLOW.md' } }), res)
    assert.strictEqual(res.statusCode, 400)
    assert.strictEqual(res.jsonBody?.error, 'Workflow already exists')
    assert.deepStrictEqual(res.jsonBody?.errors, ['duplicate workflow id'])
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  console.error(err)
  process.exit(1)
})
