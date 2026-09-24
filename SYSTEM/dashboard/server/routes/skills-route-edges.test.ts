import assert from 'assert'
import { EventEmitter } from 'events'

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

async function withModuleOverrides<T>(modulePath: string, overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  const mod = require(modulePath)
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
  await test('interactive setup sessions preserve bounded progress, input and terminal failures', async () => {
    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn
    const children: any[] = []
    childProcess.spawn = () => {
      const child: any = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.inputs = []
      child.stdin = { write: (value: string) => child.inputs.push(value) }
      child.kills = 0
      child.kill = () => { child.kills++ }
      children.push(child)
      return child
    }
    try {
      await withSkillsOverrides({ getSkillById: () => ({ name: 'fixture', setupRequirements: { actionId: 'himalaya-account-configure' } }) }, async () => {
        const router = require('./skills').default
        const call = async (method: string, route: string, params: any = {}, body: any = {}) => {
          const handler = router.stack.find((entry: any) => entry.route?.path === route && entry.route.methods[method]).route.stack[0].handle
          const res = makeRes()
          await handler(makeReq({ params, body }), res)
          return res
        }
        for (const [method, route] of [['get', '/setup-session/:sessionId'], ['post', '/setup-session/:sessionId/input'], ['post', '/setup-session/:sessionId/close']]) {
          assert.strictEqual((await call(method, route, { sessionId: 'missing' })).statusCode, 404)
        }
        assert.strictEqual((await call('post', '/:skillId/setup-session/start', { skillId: 'fixture' })).statusCode, 500)
        assert.strictEqual(children.length, 0, 'Missing setup inputs must not launch a process')
        for (const outcome of ['success', 'failure', 'error', 'stop']) {
          const start = await call('post', '/:skillId/setup-session/start', { skillId: 'fixture' }, { inputs: { accountName: 'fixture', configPath: outcome === 'success' ? '/fixture/config' : '' } })
          assert.strictEqual(start.statusCode, 200)
          const params = { sessionId: start.jsonBody.sessionId }
          const child: any = children[children.length - 1]
          assert.strictEqual((await call('post', '/setup-session/:sessionId/input', params, { input: ' ' })).statusCode, 400)
          assert.strictEqual((await call('post', '/setup-session/:sessionId/input', params, { input: 'fixture answer' })).statusCode, 200)
          assert.deepStrictEqual(child.inputs, ['fixture answer\n'])
          for (let i = 0; i < 405; i++) child.stdout.emit('data', `line ${i}`)
          child.stderr.emit('data', 'diagnostic')
          let status = (await call('get', '/setup-session/:sessionId', params)).jsonBody
          assert.strictEqual(status.status, 'running')
          assert.strictEqual(status.logs.length, 400)
          if (outcome === 'stop') {
            await call('post', '/setup-session/:sessionId/close', params)
            await call('post', '/setup-session/:sessionId/close', params)
            assert.strictEqual(child.kills, 1, 'Closing a settled session must not kill twice')
          } else {
            if (outcome === 'error') child.emit('error', new Error('Synthetic spawn failure'))
            child.emit('close', outcome === 'success' ? 0 : 1)
          }
          status = (await call('get', '/setup-session/:sessionId', params)).jsonBody
          assert.strictEqual(status.status, outcome === 'success' ? 'completed' : 'failed')
          assert.strictEqual(typeof status.endedAt, 'number')
          if (outcome === 'error') assert.strictEqual(status.error, 'Synthetic spawn failure')
          assert.strictEqual((await call('post', '/setup-session/:sessionId/input', params, { input: 'too late' })).statusCode, 400)
          assert.deepStrictEqual(child.inputs, ['fixture answer\n'])
        }
      })
    } finally { childProcess.spawn = originalSpawn }
  })

  await test('read and validation failures return stable errors without exposing internals', async () => {
    for (const [method, route, dependency, body, error] of [
      ['get', '/', 'listAvailableSkills', {}, 'Failed to load skills'],
      ['get', '/:skillId', 'getSkillById', {}, 'Failed to load skill'],
      ['get', '/:skillId/content', 'getSkillContent', {}, 'Failed to load skill content'],
      ['get', '/agent/:agentId', 'getAgentSkills', {}, 'Failed to load agent skills'],
      ['post', '/validate', 'validateSkills', { skills: [] }, 'Failed to validate skills'],
      ['post', '/bulk-assign', 'validateSkills', { agentIds: ['a'], addSkills: ['x'] }, 'Failed to bulk assign skills'],
    ] as const) {
      await withSkillsOverrides({ [dependency]: () => { throw new Error('synthetic internal failure') } }, async () => {
        const res = makeRes()
        await getRouteHandler(method, route)(makeReq({ params: { skillId: 'x', agentId: 'a' }, body }), res)
        assert.strictEqual(res.statusCode, 500)
        assert.deepStrictEqual(res.jsonBody, { error })
      })
    }
  })

  await test('invalid edits and assignments never call mutation helpers', async () => {
    await withSkillsOverrides({
      updateSkillContent: () => { throw new Error('Mutation must not execute') },
      setAgentSkills: () => { throw new Error('Mutation must not execute') },
      createCustomSkill: () => { throw new Error('Mutation must not execute') },
    }, async () => {
      for (const [method, route, body, error] of [
        ['put', '/:skillId/content', {}, 'content must be a string'],
        ['put', '/:skillId/content', { content: 'x', name: 3 }, 'name must be a string when provided'],
        ['put', '/:skillId/content', { content: 'x', description: false }, 'description must be a string when provided'],
        ['put', '/:skillId/content', { content: 'x', tags: 'bad' }, 'tags must be an array when provided'],
        ['put', '/agent/:agentId', { skills: 'bad' }, 'Skills must be an array'],
        ['post', '/validate', {}, 'Skills must be an array'],
        ['post', '/bulk-assign', { agentIds: [] }, 'agentIds must be a non-empty array'],
        ['post', '/bulk-assign', { agentIds: ['a'] }, 'Provide addSkills and/or removeSkills'],
        ['post', '/', { name: 'x', description: 'x' }, 'Missing required fields: name, description, content'],
        ['post', '/generate', { description: ' ' }, 'description is required'],
      ] as const) {
        const res = makeRes()
        await getRouteHandler(method, route)(makeReq({ params: { skillId: 'x', agentId: 'a' }, body }), res)
        assert.strictEqual(res.statusCode, 400, route)
        assert.strictEqual(res.jsonBody.error, error)
      }
    })
  })

  await test('content edit errors preserve not-found, permission and validation status codes', async () => {
    for (const [message, status] of [['read-only skill', 403], ['skill not found', 404], ['name already exists', 400], ['name must contain only letters', 400], ['name required', 400], ['disk unavailable', 500], ['', 500]] as const) {
      await withSkillsOverrides({ updateSkillContent: () => { throw new Error(message) } }, async () => {
        const res = makeRes()
        await getRouteHandler('put', '/:skillId/content')(makeReq({ params: { skillId: 'x' }, body: { content: 'x' } }), res)
        assert.strictEqual(res.statusCode, status)
        assert.strictEqual(res.jsonBody.error, message || 'Failed to update skill content')
      })
    }
  })

  await test('skill content and creation return exact helper results', async () => {
    await withSkillsOverrides({
      getSkillContent: () => null,
      createCustomSkill: (input: any) => ({ id: 'fixture', ...input }),
      updateSkillContent: (id: string, content: string, metadata: any) => ({ id, content, ...metadata }),
    }, async () => {
      let res = makeRes()
      await getRouteHandler('get', '/:skillId/content')(makeReq({ params: { skillId: 'absent' } }), res)
      assert.strictEqual(res.statusCode, 404)
      res = makeRes()
      await getRouteHandler('post', '/')(makeReq({ body: { name: 'fixture', description: 'Fixture', content: '# Fixture' } }), res)
      assert.strictEqual(res.jsonBody.skill.content, '# Fixture')
      for (const tags of [undefined, ['testing']]) {
        res = makeRes()
        await getRouteHandler('put', '/:skillId/content')(makeReq({ params: { skillId: 'fixture' }, body: { content: '# Updated', tags } }), res)
        assert.strictEqual(res.jsonBody.ok, true)
        assert.deepStrictEqual(res.jsonBody.tags, tags)
      }
    })
  })

  await test('setup refuses absent skills and unsupported commands without launching processes', async () => {
    for (const route of ['/:skillId/install-requirements', '/:skillId/complete-setup']) {
      for (const exists of [false, true]) {
        await withSkillsOverrides({ getSkillById: () => exists ? { name: 'fixture' } : null, getSkillRequirementInstallCommands: () => [], getSkillSetupCommands: () => [] }, async () => {
          const res = makeRes()
          await getRouteHandler('post', route)(makeReq({ params: { skillId: 'fixture' } }), res)
          assert.strictEqual(res.statusCode, exists ? 400 : 404)
        })
      }
      for (const detail of ['', 'synthetic setup diagnostic']) {
        await withSkillsOverrides({ getSkillById: () => { throw { message: '', stderr: detail } } }, async () => {
          const res = makeRes()
          await getRouteHandler('post', route)(makeReq({ params: { skillId: 'fixture' } }), res)
          assert.strictEqual(res.statusCode, 500)
          assert.strictEqual(res.jsonBody.detail, detail || undefined)
          assert.match(res.jsonBody.error, /^Failed to/)
        })
      }
    }
  })

  await test('bulk assignment keeps successful results when another agent fails', async () => {
    const writes: string[] = []
    await withSkillsOverrides({
      getAgentSkills: () => ['legacy', 'remove'],
      validateSkillChanges: () => ({ invalidAdded: [], invalidPreserved: ['legacy'] }),
      setAgentSkills: (id: string, skills: string[]) => {
        if (id === 'missing') throw new Error('Agent not found')
        assert.deepStrictEqual(skills, ['legacy'])
        writes.push(id)
      },
    }, async () => {
      const res = makeRes()
      await getRouteHandler('post', '/bulk-assign')(makeReq({ body: { agentIds: ['ok', 'missing'], removeSkills: ['remove'] } }), res)
      assert.strictEqual(res.jsonBody.updated, 1)
      assert.strictEqual(res.jsonBody.total, 2)
      assert.deepStrictEqual(writes, ['ok'])
      assert.match(res.jsonBody.results[0].warnings[0], /legacy/)
      assert.strictEqual(res.jsonBody.results[1].error, 'Agent not found')
    })
  })
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

  await test('AI skill generation clears request credentials on success and every failure class', async () => {
    const aiPath = require.resolve('../lib/ai-generator')
    const keyTransitions: any[] = []
    for (const [message, expectedStatus, expectedMessage] of [
      ['', 200, undefined],
      ['No API key configured', 400, 'AI generation needs a configured'],
      ['developer API key required', 400, 'developer API key required'],
      ['subscription or app credentials are unsupported', 400, 'subscription or app credentials are unsupported'],
      ['does not look like an API key', 400, 'does not look like an API key'],
      ['Synthetic provider failure', 500, 'Synthetic provider failure'],
    ] as const) {
      await withModuleOverrides(require.resolve('../lib/github-auth'), {
        getAuthenticatedSession: () => null,
      }, () => withModuleOverrides(require.resolve('../lib/opik'), {
        traceAgentChat: () => undefined,
      }, () => withModuleOverrides(aiPath, {
        setRequestByokKeys: (keys: any) => keyTransitions.push(keys),
        generateSkillFromNL: async (description: string, draft: any) => {
          assert.strictEqual(description, 'Create a safe skill')
          assert.deepStrictEqual(draft, { name: 'draft' })
          if (message) throw new Error(message)
          return { name: 'fixture-skill', content: '# Fixture' }
        },
      }, async () => {
        const res = makeRes()
        await getRouteHandler('post', '/generate')(makeReq({ body: {
          description: '  Create a safe skill  ',
          currentDraft: { name: 'draft' },
          byokKeys: { openai: 'test-key' },
        } }), res)
        assert.strictEqual(res.statusCode, expectedStatus)
        if (message) assert.match(res.jsonBody.error, new RegExp(expectedMessage!))
        else assert.strictEqual(res.jsonBody.skill.name, 'fixture-skill')
      })))
    }
    assert.strictEqual(keyTransitions.length, 12)
    for (let index = 0; index < keyTransitions.length; index += 2) {
      assert.deepStrictEqual(keyTransitions[index], { openai: 'test-key' })
      assert.strictEqual(keyTransitions[index + 1], undefined)
    }
  })

  await test('partner install status exposes a keyed result for every curated installer', async () => {
    const res = makeRes()
    await getRouteHandler('get', '/partner-install/status')(makeReq(), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.jsonBody.ok, true)
    assert.strictEqual(typeof res.jsonBody.statuses, 'object')
    assert(Object.values(res.jsonBody.statuses).every((status: any) => typeof status.installed === 'boolean'))
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
