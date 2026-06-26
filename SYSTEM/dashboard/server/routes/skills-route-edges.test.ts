import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const skillsModulePath = require.resolve('../lib/skills')

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
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

function getRouteHandler(method: 'get' | 'put' | 'post', routePath: string) {
  delete require.cache[require.resolve('./skills')]
  const router = require('./skills').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

async function withSkillsOverrides<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[skillsModulePath]
  const mod = require(skillsModulePath)
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, mod[key]]))
  Object.assign(mod, overrides)
  delete require.cache[require.resolve('./skills')]
  try {
    return await fn()
  } finally {
    Object.assign(mod, originals)
    delete require.cache[require.resolve('./skills')]
  }
}

console.log(`\n${YELLOW}=== Skills Route Edge Test Suite ===${RESET}\n`)

async function run() {
  await test('skill detail route returns 404 for unknown skills and 200 for known skills', async () => {
    let handler = getRouteHandler('get', '/:skillId')
    let res = makeRes()
    await handler(makeReq({ params: { skillId: 'missing-skill' } }), res)
    assert.strictEqual(res.statusCode, 404)
    assert(/not found/i.test(res.jsonBody?.error || ''))

    await withSkillsOverrides({
      getSkillById: (skillId: string) => skillId === 'demo-skill'
        ? { id: 'demo-skill', name: 'demo-skill', description: 'Coverage demo', source: 'workspace' }
        : null,
    }, async () => {
      handler = getRouteHandler('get', '/:skillId')
      res = makeRes()
      await handler(makeReq({ params: { skillId: 'demo-skill' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.id, 'demo-skill')
    })
  })

  await test('agent skill read route returns full skill objects alongside skill ids', async () => {
    await withSkillsOverrides({
      getAgentSkills: () => ['github', 'workspace-ls'],
      listAvailableSkills: () => [
        { id: 'github', name: 'github', description: 'GitHub skill' },
        { id: 'workspace-ls', name: 'workspace-ls', description: 'Workspace ls skill' },
      ],
    }, async () => {
      const handler = getRouteHandler('get', '/agent/:agentId')
      const res = makeRes()
      await handler(makeReq({ params: { agentId: 'briefing-writer' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody?.skillIds, ['github', 'workspace-ls'])
      assert.strictEqual((res.jsonBody?.skills || []).length, 2)
    })
  })

  await test('agent skill update succeeds and returns preserved-skill warnings when appropriate', async () => {
    const updates: Array<{ agentId: string; skills: string[] }> = []
    await withSkillsOverrides({
      getAgentSkills: () => ['legacy-skill'],
      validateSkillChanges: () => ({ invalidAdded: [], invalidPreserved: ['legacy-skill'] }),
      setAgentSkills: (agentId: string, skills: string[]) => {
        updates.push({ agentId, skills })
      },
    }, async () => {
      const handler = getRouteHandler('put', '/agent/:agentId')
      const res = makeRes()
      await handler(makeReq({
        params: { agentId: 'briefing-writer' },
        body: { skills: ['legacy-skill', 'github'] },
      }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.ok, true)
      assert.strictEqual(updates.length, 1)
      assert.deepStrictEqual(updates[0], {
        agentId: 'briefing-writer',
        skills: ['legacy-skill', 'github'],
      })
      assert((res.jsonBody?.warnings || [])[0]?.includes('legacy-skill'))
    })
  })

  await test('bulk assign succeeds across multiple agents and returns per-agent results', async () => {
    const updates: Array<{ agentId: string; skills: string[] }> = []
    await withSkillsOverrides({
      validateSkills: () => ({ valid: true, missing: [] }),
      getAgentSkills: (agentId: string) => agentId === 'agent-a' ? ['github'] : [],
      validateSkillChanges: () => ({ invalidPreserved: [] }),
      setAgentSkills: (agentId: string, skills: string[]) => {
        updates.push({ agentId, skills })
      },
    }, async () => {
      const handler = getRouteHandler('post', '/bulk-assign')
      const res = makeRes()
      await handler(makeReq({
        body: {
          agentIds: ['agent-a', 'agent-b'],
          addSkills: ['workspace-ls'],
          removeSkills: ['github'],
        },
      }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.ok, true)
      assert.strictEqual(res.jsonBody?.updated, 2)
      assert.strictEqual((res.jsonBody?.results || []).length, 2)
      assert.deepStrictEqual(updates, [
        { agentId: 'agent-a', skills: ['workspace-ls'] },
        { agentId: 'agent-b', skills: ['workspace-ls'] },
      ])
    })
  })

  await test('validate route returns successful validation payloads for existing skills', async () => {
    await withSkillsOverrides({
      validateSkills: (skills: string[]) => ({ valid: true, missing: [], skills }),
    }, async () => {
      const handler = getRouteHandler('post', '/validate')
      const res = makeRes()
      await handler(makeReq({ body: { skills: ['github', 'workspace-ls'] } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.valid, true)
      assert.deepStrictEqual(res.jsonBody?.missing, [])
    })
  })

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
  console.error(err)
  process.exit(1)
})
