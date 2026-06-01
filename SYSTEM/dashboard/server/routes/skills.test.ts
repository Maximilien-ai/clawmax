/**
 * Skills routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/skills.test.ts
 */

import assert from 'assert'
import childProcess from 'child_process'
import { getSkillById, getSkillRequirementInstallCommands, listAvailableSkills } from '../lib/skills'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

type ExecFileCallback = (error: NodeJS.ErrnoException | null, stdout?: string, stderr?: string) => void
type ExecFileMock = (file: string, args: string[], options: any, callback: ExecFileCallback) => void

const originalExecFile = childProcess.execFile
let execFileMock: ExecFileMock = (_file, _args, _options, callback) => callback(null, '', '')

;(childProcess as any).execFile = ((file: string, args: string[], options: any, callback?: ExecFileCallback) => {
  const cb = typeof options === 'function' ? options : callback
  const opts = typeof options === 'function' ? {} : options
  if (!cb) throw new Error('Missing execFile callback')
  return execFileMock(file, args, opts, cb)
}) as typeof childProcess.execFile

const router = require('./skills').default

function restoreExecFile() {
  ;(childProcess as any).execFile = originalExecFile
}

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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
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

async function run() {
  console.log(`\n${YELLOW}=== Skills Routes Test Suite ===${RESET}\n`)

  await test('install-requirements returns 404 for unknown skills', async () => {
    const handler = getRouteHandler('post', '/:skillId/install-requirements')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: 'missing-skill' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected unknown skill to return HTTP 404')
    assert(/not found/i.test(res.jsonBody?.error || ''), 'Expected missing skill guidance')
  })

  await test('install-requirements returns 400 when a skill has no dashboard-installable requirements', async () => {
    const skillWithoutInstaller = listAvailableSkills().find((skill) => {
      if (!skill.id) return false
      const resolved = getSkillById(skill.id)
      return !!resolved && getSkillRequirementInstallCommands(resolved).length === 0
    })
    assert(skillWithoutInstaller, 'Expected at least one skill without dashboard-installable requirements')

    const handler = getRouteHandler('post', '/:skillId/install-requirements')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: skillWithoutInstaller.id } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected skills without installers to return HTTP 400')
    assert(/no dashboard-installable requirements yet/i.test(res.jsonBody?.error || ''), 'Expected no-installer guidance')
  })

  await test('install-requirements executes dashboard install commands for supported skills', async () => {
    const skillWithInstaller = listAvailableSkills().find((skill) => getSkillRequirementInstallCommands(skill).length > 0)
    assert(skillWithInstaller, 'Expected at least one skill with dashboard-installable requirements')
    const expectedCommands = getSkillRequirementInstallCommands(skillWithInstaller)
    const calls: Array<{ file: string; args: string[] }> = []

    execFileMock = (file, args, _options, callback) => {
      calls.push({ file, args })
      callback(null, 'installed', '')
    }

    const handler = getRouteHandler('post', '/:skillId/install-requirements')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: skillWithInstaller.id } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected installable skill to return HTTP 200')
    assert.strictEqual(calls.length, expectedCommands.length, 'Expected every install command to be executed')
    assert.strictEqual(res.jsonBody?.commands?.length, expectedCommands.length, 'Expected displayed commands to match executed commands')
  })

  await test('complete-setup returns actionable input errors for gog when required fields are missing', async () => {
    const handler = getRouteHandler('post', '/:skillId/complete-setup')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: 'gog' }, body: { inputs: { accountEmail: 'user@example.com' } } }), res)

    assert.strictEqual(res.statusCode, 500, 'Expected missing gog setup inputs to return HTTP 500')
    assert(/client secret json path is required/i.test(res.jsonBody?.error || ''), 'Expected missing client secret guidance')
  })

  await test('complete-setup executes gog guided setup commands with provided inputs', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    execFileMock = (file, args, _options, callback) => {
      calls.push({ file, args })
      callback(null, 'ok', '')
    }

    const handler = getRouteHandler('post', '/:skillId/complete-setup')
    const res = makeRes()
    await handler(makeReq({
      params: { skillId: 'gog' },
      body: {
        inputs: {
          clientSecretPath: '/tmp/client-secret.json',
          accountEmail: 'user@example.com',
        },
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected gog setup to return HTTP 200')
    assert.strictEqual(calls.length, 3, 'Expected gog setup to execute three commands')
    assert(calls.every((call) => call.file === 'gog'), 'Expected gog binary to be invoked for all commands')
    assert.strictEqual(res.jsonBody?.commands?.[2], 'gog auth list', 'Expected auth verification command to be surfaced')
  })

  await test('registry search returns actionable warning when Tessl CLI is unavailable', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      const err = new Error('tessl not found') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      callback(err, '', '')
    }

    const handler = getRouteHandler('get', '/registry/search')
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'tessl', q: 'review', limit: '6' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected search route to stay HTTP 200')
    assert.strictEqual(res.jsonBody?.provider, 'tessl', 'Expected tessl provider')
    assert(Array.isArray(res.jsonBody?.results) && res.jsonBody.results.length === 0, 'Expected no results')
    assert(/Tessl CLI not available/i.test(res.jsonBody?.warning || ''), 'Expected Tessl CLI warning')
  })

  await test('registry install surfaces Tessl security-review blocker guidance', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      const err = new Error('install blocked') as NodeJS.ErrnoException
      ;(err as any).stdout = 'Skipped odyssey4me/gmail due to security review.\n⚠ Use --dangerously-ignore-security to bypass.\n'
      ;(err as any).stderr = ''
      callback(err, (err as any).stdout, '')
    }

    const handler = getRouteHandler('post', '/registry/install')
    const res = makeRes()
    await handler(makeReq({ body: { provider: 'tessl', name: 'odyssey4me/gmail' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected blocker to return HTTP 400')
    assert(/security review/i.test(res.jsonBody?.error || ''), 'Expected security review guidance')
  })

  await test('registry install returns actionable guidance when ClawHub runtime prerequisites are missing', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      const err = new Error('npx not found') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      callback(err, '', '')
    }

    const handler = getRouteHandler('post', '/registry/install')
    const res = makeRes()
    await handler(makeReq({ body: { provider: 'clawhub', name: 'gog' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected unavailable prerequisite guidance to return HTTP 400')
    assert(/Node\.js and npx/i.test(res.jsonBody?.error || ''), 'Expected ClawHub prerequisite guidance')
    assert.strictEqual(res.jsonBody?.source, 'clawhub', 'Expected clawhub source in response')
  })

  await test('registry install returns actionable guidance when ClawHub package is not importable', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      callback(null, 'installed', '')
    }

    const handler = getRouteHandler('post', '/registry/install')
    const res = makeRes()
    await handler(makeReq({ body: { provider: 'clawhub', name: 'gog' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected unsupported ClawHub format to return HTTP 400')
    assert(/no importable OpenClaw skill files/i.test(res.jsonBody?.error || ''), 'Expected ClawHub format guidance')
    assert.strictEqual(res.jsonBody?.source, 'clawhub', 'Expected clawhub source in response')
  })

  await test('registry install rejects invalid skill name format before invoking any installer', async () => {
    let called = false
    execFileMock = (_file, _args, _options, callback) => {
      called = true
      callback(null, '', '')
    }

    const handler = getRouteHandler('post', '/registry/install')
    const res = makeRes()
    await handler(makeReq({ body: { provider: 'clawhub', name: 'bad skill name!' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid skill name to return HTTP 400')
    assert(/invalid skill name format/i.test(res.jsonBody?.error || ''), 'Expected invalid format guidance')
    assert.strictEqual(called, false, 'Expected installer command not to run for invalid names')
  })

  restoreExecFile()

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
  restoreExecFile()
  console.error(err)
  process.exit(1)
})
