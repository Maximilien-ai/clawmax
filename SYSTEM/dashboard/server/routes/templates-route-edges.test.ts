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
  workspace?: Partial<typeof import('../lib/workspace')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['../lib/templates', overrides.templates],
    ['../lib/workflows', overrides.workflows],
    ['../lib/template-feedback', overrides.templateFeedback],
    ['../lib/workspace', overrides.workspace],
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
  method: 'get' | 'post' | 'put' | 'delete',
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
    headers: {},
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

  await test('template listing and lookup keep agent, organization, and workflow types distinct', async () => {
    const overrides = {
      templates: {
        listTemplates: () => [{ type: 'agent', slug: 'agent-one' }, { type: 'organization', slug: 'org-one' }],
        getTemplate: (type: string, slug: string) => type === 'agent' && slug === 'agent-one' ? { type, slug } : null,
      } as any,
      workflows: { listWorkflowTemplates: () => [{ id: 'workflow-one' }] } as any,
    }
    const list = getRouteHandler('get', '/', overrides)
    for (const [type, expected] of [['agent', 'agents'], ['organization', 'organizations'], ['workflow', 'workflows']] as const) {
      const res = makeRes()
      await list(makeReq({ query: { type } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.[expected]?.length, 1)
      assert.strictEqual(res.jsonBody?.total, 1)
    }
    let res = makeRes()
    await list(makeReq({ query: { type: 'invalid' } }), res)
    assert.strictEqual(res.statusCode, 400)
    const detail = getRouteHandler('get', '/:type/:slug', overrides)
    res = makeRes()
    await detail(makeReq({ params: { type: 'agents', slug: 'agent-one' } }), res)
    assert.strictEqual(res.jsonBody?.slug, 'agent-one')
    res = makeRes()
    await detail(makeReq({ params: { type: 'organizations', slug: 'missing' } }), res)
    assert.strictEqual(res.statusCode, 404)
    res = makeRes()
    await detail(makeReq({ params: { type: 'workflows', slug: 'workflow-one' } }), res)
    assert.strictEqual(res.statusCode, 400)
  })

  await test('template saves reject malformed inputs and preserve errors from the store', async () => {
    const overrides = { templates: {
      createAgentTemplateFromAgent: () => ({ ok: false, error: 'Agent unavailable' }),
      createOrganizationTemplate: () => ({ ok: false, error: 'Organization unavailable' }),
    } as any }
    const agent = getRouteHandler('post', '/agents/:agentId/save', overrides)
    for (const fixture of [
      { params: { agentId: 'agent-one' }, body: {}, status: 400 },
      { params: { agentId: 'BAD ID' }, body: { name: 'Agent' }, status: 400 },
      { params: { agentId: 'agent-one' }, body: { name: 'Agent' }, status: 500 },
    ]) {
      const res = makeRes()
      await agent(makeReq(fixture), res)
      assert.strictEqual(res.statusCode, fixture.status)
    }
    const organization = getRouteHandler('post', '/organizations/save', overrides)
    let res = makeRes()
    await organization(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400)
    res = makeRes()
    await organization(makeReq({ body: { name: 'Org' } }), res)
    assert.strictEqual(res.statusCode, 500)
  })

  await test('template update validates before saving and replaces only its previous slug', async () => {
    const savedDir = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'new-name')
    fs.mkdirSync(savedDir, { recursive: true })
    let removed = ''
    let saved = 0
    const overrides = { templates: {
      validateTemplate: () => ({ valid: true }),
      saveTemplate: () => { saved++; return { ok: true, path: savedDir } },
      getTemplate: () => null,
      deleteTemplate: (_type: string, slug: string) => { removed = slug; return { ok: true } },
      slugify: () => 'new-name',
    } as any }
    const handler = getRouteHandler('put', '/:type/:slug', overrides)
    for (const fixture of [
      { params: { type: 'workflows', slug: 'old' }, body: { type: 'agent', name: 'New Name' } },
      { params: { type: 'agents', slug: 'old' }, body: null },
      { params: { type: 'agents', slug: 'old' }, body: { type: 'organization', name: 'New Name' } },
    ]) {
      const res = makeRes()
      await handler(makeReq(fixture), res)
      assert.strictEqual(res.statusCode, 400)
    }
    assert.strictEqual(saved, 0, 'Invalid updates must not write files')
    const body = { type: 'agent', name: 'New Name', templateFiles: { identity: '# Identity', soul: '# Soul', tools: '' } }
    const res = makeRes()
    await handler(makeReq({ params: { type: 'agents', slug: 'old-name' }, body }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(saved, 1)
    assert.strictEqual(removed, 'old-name')
    assert.strictEqual(fs.readFileSync(path.join(savedDir, 'IDENTITY.md'), 'utf8'), '# Identity')
    assert.strictEqual(fs.readFileSync(path.join(savedDir, 'SOUL.md'), 'utf8'), '# Soul')
    assert.strictEqual(fs.readFileSync(path.join(savedDir, 'TOOLS.md'), 'utf8'), '')
    assert.strictEqual(res.jsonBody?.template?.name, 'New Name', 'Saved template should return even when reload is unavailable')
  })

  await test('template feedback rejects invalid targets and ratings before persistence', async () => {
    let writes = 0
    const handler = getRouteHandler('post', '/:type/:slug/feedback', {
      templates: { getTemplate: (type: string, slug: string) => type === 'agent' && slug === 'present' ? { type, slug, name: 'Present' } : null } as any,
      templateFeedback: { addTemplateFeedback: async () => { writes++; return { summary: {} } } } as any,
    })
    for (const fixture of [
      { params: { type: 'workflows', slug: 'present' }, body: { rating: 4 }, status: 400 },
      { params: { type: 'agents', slug: 'missing' }, body: { rating: 4 }, status: 404 },
      { params: { type: 'agents', slug: 'present' }, body: { rating: 'not-a-number' }, status: 400 },
      { params: { type: 'agents', slug: 'present' }, body: { rating: 0 }, status: 400 },
      { params: { type: 'agents', slug: 'present' }, body: { rating: 6 }, status: 400 },
    ]) {
      const res = makeRes()
      await handler(makeReq(fixture), res)
      assert.strictEqual(res.statusCode, fixture.status)
    }
    assert.strictEqual(writes, 0, 'Invalid feedback must not be stored')
  })

  await test('template feedback normalizes optional answers and reports storage failures', async () => {
    let saved: any
    const overrides = {
      templates: {
        getTemplate: () => ({ type: 'agent', name: 'Present', slug: 'present' }),
        buildTemplateFeedbackMetadata: () => ({ templateType: 'agent', templateId: 'agent:present', templateSource: 'workspace', templateTags: ['assistant'], templateInfo: {} }),
      } as any,
      templateFeedback: {
        getTemplateApplyCount: () => 3,
        addTemplateFeedback: async (feedback: any) => { saved = feedback; return { summary: { count: 1 } } },
      } as any,
    }
    let handler = getRouteHandler('post', '/:type/:slug/feedback', overrides)
    let res = makeRes()
    await handler(makeReq({ params: { type: 'agents', slug: 'present' }, body: {
      rating: '4', easyToUse: 'unknown', solvedUseCase: 'partly', customized: 'a-little', otherUseCases: '  reporting  ', suggestions: 42,
    } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(saved.rating, 4)
    assert.strictEqual(saved.easyToUse, '')
    assert.strictEqual(saved.solvedUseCase, 'partly')
    assert.strictEqual(saved.customized, 'a-little')
    assert.strictEqual(saved.otherUseCases, 'reporting')
    assert.strictEqual(saved.suggestions, '')
    assert.strictEqual(saved.applyCount, 3)

    handler = getRouteHandler('post', '/:type/:slug/feedback', {
      ...overrides,
      templateFeedback: { getTemplateApplyCount: () => 0, addTemplateFeedback: async () => { throw new Error('Feedback store unavailable') } } as any,
    })
    res = makeRes()
    await handler(makeReq({ params: { type: 'agents', slug: 'present' }, body: { rating: 5 } }), res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(res.jsonBody?.error, 'Feedback store unavailable')
  })

  await test('agent template file editor reads inherited files when the workspace copy is blank', async () => {
    const workspaceTemplates = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'agent-files')
    const systemTemplates = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'system-agent-files')
    const workspaceCopy = path.join(workspaceTemplates, 'copy')
    const systemBase = path.join(systemTemplates, 'base')
    fs.mkdirSync(workspaceCopy, { recursive: true })
    fs.mkdirSync(systemBase, { recursive: true })
    fs.writeFileSync(path.join(workspaceCopy, 'IDENTITY.md'), '  \n')
    fs.writeFileSync(path.join(workspaceCopy, 'TOOLS.md'), '# Workspace tools')
    fs.writeFileSync(path.join(systemBase, 'IDENTITY.md'), '# Base identity')
    fs.writeFileSync(path.join(systemBase, 'SOUL.md'), '# Base soul')
    fs.writeFileSync(path.join(systemBase, 'TOOLS.md'), '# Base tools')
    const handler = getRouteHandler('get', '/agents/:slug/files', { templates: {
      getTemplate: (_type: string, slug: string) => slug === 'copy' ? { source: 'workspace', name: 'Copy', metadata: { basedOnSlug: 'base', basedOnSource: 'system' } } : null,
      getAgentTemplatesDir: () => workspaceTemplates,
      getGlobalAgentTemplatesDir: () => systemTemplates,
    } as any })
    let res = makeRes()
    await handler(makeReq({ params: { slug: 'copy' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.jsonBody, { identity: '# Base identity', soul: '# Base soul', tools: '# Workspace tools' })
    res = makeRes()
    await handler(makeReq({ params: { slug: 'missing' } }), res)
    assert.strictEqual(res.statusCode, 404)
  })

  await test('legacy agent template copies infer their system source without changing files', async () => {
    const workspaceTemplates = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'legacy-agent-files')
    const systemTemplates = path.join(tmpWorkspace, 'TEMPLATES_OUT', 'legacy-system-files')
    const base = path.join(systemTemplates, 'shared-base')
    fs.mkdirSync(path.join(workspaceTemplates, 'legacy-copy'), { recursive: true })
    fs.mkdirSync(base, { recursive: true })
    fs.writeFileSync(path.join(base, 'IDENTITY.md'), '# Inherited identity')
    const handler = getRouteHandler('get', '/agents/:slug/files', { templates: {
      getTemplate: () => ({ source: 'workspace', name: 'Shared Base copy', agents: [{ id: 'shared-agent' }] }),
      listTemplates: () => [{ source: 'system', slug: 'shared-base', name: 'Shared Base', agents: [{ id: 'shared-agent' }] }],
      getAgentTemplatesDir: () => workspaceTemplates,
      getGlobalAgentTemplatesDir: () => systemTemplates,
    } as any })
    const res = makeRes()
    await handler(makeReq({ params: { slug: 'legacy-copy' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.jsonBody?.identity, '# Inherited identity')
    assert.strictEqual(fs.existsSync(path.join(workspaceTemplates, 'legacy-copy', 'IDENTITY.md')), false, 'Reading inherited files must not copy them')
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
    assert.strictEqual(res.headers['Content-Disposition'], 'attachment; filename="daily-sync.workflow.md"')
    assert(/name: Daily Sync/.test(String(res.jsonBody || '')), 'Expected workflow markdown body')
  })

  await test('template export markdown route uses the template name in the attachment filename', async () => {
    const handler = getRouteHandler('get', '/:type/:slug/export-md', {
      templates: {
        getTemplate: () => ({ slug: 'launch', name: 'Customer Launch Plan', type: 'agent' }),
        templateToMarkdown: () => '# Customer Launch Plan\n',
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({ params: { type: 'agents', slug: 'launch' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.headers['Content-Disposition'], 'attachment; filename="customer-launch-plan.template.md"')
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

  await test('organization conflict preview reports only matching agents, channels, and workflows', async () => {
    const template = {
      type: 'organization', name: 'Importable',
      agents: [
        { id: 'worker', groups: ['Team'], communities: ['Hub'] },
        { id: 'built-in', tags: ['built-in'] },
      ],
      parameters: [{ agentId: 'worker', default: 1 }],
      groups: [{ name: 'Team', community: 'Hub' }],
      communities: [{ name: 'Hub' }],
      workflows: [
        { id: 'new-name-id', name: 'Existing Name' },
        { id: 'existing-id', name: 'Different Name' },
        { id: 'dependent', name: 'Depends on External', dependsOn: ['external-id'] },
        { id: 'internal', name: 'Internal Dependency', dependsOn: ['dependent'] },
      ],
    }
    const handler = getRouteHandler('post', '/organizations/conflicts', {
      templates: { getTemplate: () => template } as any,
      workspace: {
        getWorkspacePath: () => tmpWorkspace,
        listAgents: () => [{ id: 'worker2' }, { id: 'built-in' }],
        parseGroups: () => ({ groups: [{ name: 'team' }], communities: [{ name: 'hub' }] }),
      } as any,
      workflows: { listWorkflows: () => [
        { id: 'existing-id', name: 'Existing Name' },
        { id: 'external-id', name: 'External' },
      ] } as any,
    })
    const res = makeRes()
    await handler(makeReq({ body: { templateSlug: 'importable', includeBuiltIn: false, agentCounts: { worker: 2 } } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.jsonBody?.agentConflicts, ['worker2'])
    assert.deepStrictEqual(res.jsonBody?.groupConflicts, ['Team'])
    assert.deepStrictEqual(res.jsonBody?.communityConflicts, ['Hub'])
    assert.deepStrictEqual(res.jsonBody?.workflowConflicts, ['Existing Name', 'Different Name', 'Depends on External'])
    assert(!res.jsonBody?.workflowConflicts.includes('Internal Dependency'), 'Internal dependency must not be mistaken for an external conflict')
  })

  await test('agent template import validates input and reports import failures without partial success', async () => {
    let calls = 0
    const handler = getRouteHandler('post', '/agents/import', {
      templates: { importAgentFromTemplate: async () => { calls++; return { ok: false, error: 'Registration failed' } } } as any,
      workspace: { listAgents: () => [] } as any,
    })
    let res = makeRes()
    await handler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400)
    assert.strictEqual(calls, 0, 'Missing slug must not start an import')
    res = makeRes()
    await handler(makeReq({ body: { templateSlug: 'agent-template', agentId: 'new-agent' } }), res)
    assert.strictEqual(res.statusCode, 400)
    assert.strictEqual(res.jsonBody?.error, 'Registration failed')
    assert.strictEqual(calls, 1)
  })

  await test('organization template import validates identity, capacity inputs, and final result', async () => {
    const template = { type: 'organization', name: 'Org', agents: [
      { id: 'built-in', tags: ['built-in'] }, { id: 'worker' },
    ], parameters: [{ agentId: 'worker', default: 2 }], workflows: [] }
    let options: any
    const handler = getRouteHandler('post', '/organizations/import', {
      templates: {
        getTemplate: (_type: string, slug: string) => slug === 'org' ? template : null,
        importOrganizationTemplate: async (_slug: string, incoming: any) => { options = incoming; return { ok: true, agentIds: ['worker1', 'worker2'] } },
      } as any,
      workspace: { listAgents: () => [] } as any,
      workflows: { listWorkflows: () => [] } as any,
    })
    let res = makeRes()
    await handler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400)
    res = makeRes()
    await handler(makeReq({ body: { templateSlug: 'missing' } }), res)
    assert.strictEqual(res.statusCode, 404)
    res = makeRes()
    await handler(makeReq({ body: { templateSlug: 'org', includeBuiltIn: false, agentCounts: { worker: 2 }, prefix: 'trial-' } }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.deepStrictEqual(res.jsonBody?.agentIds, ['worker1', 'worker2'])
    assert.strictEqual(options.includeBuiltIn, false)
    assert.strictEqual(options.prefix, 'trial-')
    assert.deepStrictEqual(options.agentCounts, { worker: 2 })
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
