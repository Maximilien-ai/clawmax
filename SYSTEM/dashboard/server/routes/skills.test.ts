/**
 * Skills routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/skills.test.ts
 */

import assert from 'assert'
import childProcess from 'child_process'
import { EventEmitter } from 'events'
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
const originalSpawn = childProcess.spawn
const originalExecSync = childProcess.execSync
let execFileMock: ExecFileMock = (_file, _args, _options, callback) => callback(null, '', '')
let spawnMock: any = null

;(childProcess as any).execFile = ((file: string, args: string[], options: any, callback?: ExecFileCallback) => {
  const cb = typeof options === 'function' ? options : callback
  const opts = typeof options === 'function' ? {} : options
  if (!cb) throw new Error('Missing execFile callback')
  return execFileMock(file, args, opts, cb)
}) as typeof childProcess.execFile

;(childProcess as any).spawn = ((...args: any[]) => {
  if (spawnMock) return spawnMock(...args)
  return (originalSpawn as any)(...args)
}) as typeof childProcess.spawn

const router = require('./skills').default

function restoreExecFile() {
  ;(childProcess as any).execFile = originalExecFile
  ;(childProcess as any).spawn = originalSpawn
  ;(childProcess as any).execSync = originalExecSync
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

function getRouteHandler(method: 'get' | 'post' | 'put' | 'delete', routePath: string) {
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

  await test('create skill rejects missing required fields', async () => {
    const handler = getRouteHandler('post', '/')
    const res = makeRes()
    await handler(makeReq({ body: { name: 'Test Skill' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing required fields to return HTTP 400')
    assert(/missing required fields/i.test(res.jsonBody?.error || ''), 'Expected required-field guidance')
  })

  await test('create skill surfaces custom-skill validation errors', async () => {
    const createHandler = getRouteHandler('post', '/')
    const res = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'bad skill name!',
        description: 'Coverage-only custom skill',
        content: '# Coverage Skill\n\nTest content',
        tags: ['coverage'],
      },
    }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid custom skill create to return HTTP 400')
    assert(/must contain only/i.test(res.jsonBody?.error || ''), 'Expected custom skill validation guidance')
  })

  await test('generate skill rejects blank descriptions', async () => {
    const handler = getRouteHandler('post', '/generate')
    const res = makeRes()
    await handler(makeReq({ body: { description: '   ' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected blank description to return HTTP 400')
    assert(/description is required/i.test(res.jsonBody?.error || ''), 'Expected description guidance')
  })

  await test('list skills returns available skills', async () => {
    const handler = getRouteHandler('get', '/')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected listing skills to return HTTP 200')
    assert(Array.isArray(res.jsonBody?.skills), 'Expected skills array in response')
    assert(res.jsonBody.skills.length > 0, 'Expected at least one available skill')
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

  await test('partner-install runs the allowlisted Cognee OpenClaw plugin installer', async () => {
    const calls: Array<{ file: string; args: string[]; stdin: string }> = []
    spawnMock = (file: string, args: string[]) => {
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdin = {
        value: '',
        write(chunk: string) { this.value += chunk },
        end() {
          calls.push({ file, args, stdin: this.value })
          child.stdout.emit('data', 'installed cognee')
          child.stderr.emit('data', 'install note')
          setImmediate(() => child.emit('close', 0))
        },
      }
      child.kill = () => {}
      return child
    }

    const handler = getRouteHandler('post', '/partner-install')
    const res = makeRes()
    await handler(makeReq({ body: { commandId: 'cognee-openclaw' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected Cognee partner install to return HTTP 200')
    assert.deepStrictEqual(calls[0], {
      file: 'openclaw',
      args: ['plugins', 'install', '@cognee/cognee-openclaw@latest'],
      stdin: '',
    })
    assert.strictEqual(res.jsonBody?.command, 'openclaw plugins install @cognee/cognee-openclaw@latest', 'Expected command display in response')
    assert.strictEqual(res.jsonBody?.stdout, 'installed cognee', 'Expected installer stdout in response')
    assert.strictEqual(res.jsonBody?.stderr, 'install note', 'Expected installer stderr in response')
    spawnMock = null
  })

  await test('partner-uninstall runs the allowlisted Cognee OpenClaw plugin uninstaller', async () => {
    const calls: Array<{ file: string; args: string[]; stdin: string }> = []
    spawnMock = (file: string, args: string[]) => {
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdin = {
        value: '',
        write(chunk: string) { this.value += chunk },
        end() {
          calls.push({ file, args, stdin: this.value })
          child.stdout.emit('data', 'removed cognee')
          setImmediate(() => child.emit('close', 0))
        },
      }
      child.kill = () => {}
      return child
    }

    const handler = getRouteHandler('post', '/partner-uninstall')
    const res = makeRes()
    await handler(makeReq({ body: { commandId: 'cognee-openclaw' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected Cognee partner uninstall to return HTTP 200')
    assert.deepStrictEqual(calls[0], {
      file: 'openclaw',
      args: ['plugins', 'uninstall', 'cognee-openclaw', '--force'],
      stdin: 'y\n',
    })
    assert.strictEqual(res.jsonBody?.command, 'openclaw plugins uninstall cognee-openclaw --force', 'Expected command display in response')
    assert.strictEqual(res.jsonBody?.stdout, 'removed cognee', 'Expected uninstaller stdout in response')
    spawnMock = null
  })

  await test('partner-install status reports installed Cognee plugin state', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      callback(null, JSON.stringify({
        plugins: [{
          id: 'cognee-openclaw',
          name: 'Memory (Cognee)',
          version: '2026.5.21',
          enabled: true,
          status: 'loaded',
          origin: 'global',
        }],
      }), '')
    }

    const handler = getRouteHandler('get', '/partner-install/status')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected partner install status to return HTTP 200')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.installed, true, 'Expected Cognee plugin to be installed')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.enabled, true, 'Expected Cognee plugin to be enabled')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.status, 'loaded', 'Expected Cognee plugin loaded status')
  })

  await test('partner-install status reports absent Cognee plugin state', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      callback(null, JSON.stringify({ plugins: [] }), '')
    }

    const handler = getRouteHandler('get', '/partner-install/status')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected partner install status to return HTTP 200')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.installed, false, 'Expected Cognee plugin to be absent')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.status, 'not-installed', 'Expected not-installed status')
  })

  await test('partner-install status falls back to unknown statuses on inspection failure', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      callback(new Error('plugins list failed') as NodeJS.ErrnoException, '', '')
    }

    const handler = getRouteHandler('get', '/partner-install/status')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 500, 'Expected plugin status failure to return HTTP 500')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.status, 'unknown', 'Expected unknown fallback status')
  })

  await test('get skill content returns 404 for unknown skills', async () => {
    const handler = getRouteHandler('get', '/:skillId/content')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: 'missing-skill' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected unknown skill content lookup to return HTTP 404')
  })

  await test('get skill content returns SKILL.md content for existing skills', async () => {
    const knownSkill = listAvailableSkills().find((skill) => !!skill.id)
    assert(knownSkill?.id, 'Expected at least one existing skill')

    const handler = getRouteHandler('get', '/:skillId/content')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: knownSkill.id } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected skill content lookup to return HTTP 200')
    assert.strictEqual(typeof res.jsonBody?.content, 'string', 'Expected SKILL.md content')
  })

  await test('update skill content validates request body types before writing', async () => {
    const handler = getRouteHandler('put', '/:skillId/content')
    const res = makeRes()
    await handler(makeReq({
      params: { skillId: 'missing-skill' },
      body: { content: 123, name: [], description: {}, tags: 'coverage' },
    }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected invalid content type to return HTTP 400')
    assert(/content must be a string/i.test(res.jsonBody?.error || ''), 'Expected content type guidance')
  })

  await test('get skill details returns 404 for unknown skills', async () => {
    const handler = getRouteHandler('get', '/:skillId')
    const res = makeRes()
    await handler(makeReq({ params: { skillId: 'missing-skill' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected missing skill detail to return HTTP 404')
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

  await test('interactive Himalaya setup starts a constrained setup session and accepts input', async () => {
    const writes: string[] = []
    let killed = false
    spawnMock = (file: string, args: string[]) => {
      assert.strictEqual(file, 'script', 'Expected interactive setup to run in a constrained PTY wrapper')
      assert(args.some((entry) => String(entry).includes('himalaya') || entry === 'himalaya'), 'Expected himalaya command to be wrapped')

      const proc = new EventEmitter() as any
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.stdin = {
        write: (input: string) => {
          writes.push(input)
        },
      }
      proc.kill = () => {
        killed = true
      }
      return proc
    }

    const startHandler = getRouteHandler('post', '/:skillId/setup-session/start')
    const startRes = makeRes()
    await startHandler(makeReq({
      params: { skillId: 'himalaya' },
      body: { inputs: { accountName: 'work' } },
    }), startRes)

    assert.strictEqual(startRes.statusCode, 200, 'Expected Himalaya session start to return HTTP 200')
    assert(startRes.jsonBody?.sessionId, 'Expected interactive setup session id')
    assert(/himalaya account configure work/i.test(startRes.jsonBody?.command || ''), 'Expected rendered Himalaya setup command')

    const inputHandler = getRouteHandler('post', '/setup-session/:sessionId/input')
    const inputRes = makeRes()
    await inputHandler(makeReq({
      params: { sessionId: startRes.jsonBody.sessionId },
      body: { input: 'y' },
    }), inputRes)

    assert.strictEqual(inputRes.statusCode, 200, 'Expected session input to return HTTP 200')
    assert.strictEqual(writes[0], 'y\n', 'Expected one line of interactive input to be forwarded')

    const closeHandler = getRouteHandler('post', '/setup-session/:sessionId/close')
    const closeRes = makeRes()
    await closeHandler(makeReq({ params: { sessionId: startRes.jsonBody.sessionId } }), closeRes)
    assert.strictEqual(closeRes.statusCode, 200, 'Expected interactive session close to return HTTP 200')
    assert.strictEqual(killed, true, 'Expected interactive session close to stop the PTY process')
    spawnMock = null
  })

  await test('interactive setup session polling returns 404 for unknown sessions', async () => {
    const handler = getRouteHandler('get', '/setup-session/:sessionId')
    const res = makeRes()
    await handler(makeReq({ params: { sessionId: 'missing-session' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected missing setup session poll to return HTTP 404')
  })

  await test('interactive setup session input validates missing and completed sessions', async () => {
    const writes: string[] = []
    spawnMock = () => {
      const proc = new EventEmitter() as any
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.stdin = { write: (input: string) => { writes.push(input) } }
      proc.kill = () => {}
      return proc
    }

    const startHandler = getRouteHandler('post', '/:skillId/setup-session/start')
    const startRes = makeRes()
    await startHandler(makeReq({
      params: { skillId: 'himalaya' },
      body: { inputs: { accountName: 'coverage' } },
    }), startRes)
    assert.strictEqual(startRes.statusCode, 200, 'Expected setup session start to succeed')

    const inputHandler = getRouteHandler('post', '/setup-session/:sessionId/input')
    const blankRes = makeRes()
    await inputHandler(makeReq({
      params: { sessionId: startRes.jsonBody.sessionId },
      body: { input: '   ' },
    }), blankRes)
    assert.strictEqual(blankRes.statusCode, 400, 'Expected blank interactive input to return HTTP 400')

    const closeHandler = getRouteHandler('post', '/setup-session/:sessionId/close')
    const closeRes = makeRes()
    await closeHandler(makeReq({ params: { sessionId: startRes.jsonBody.sessionId } }), closeRes)
    assert.strictEqual(closeRes.statusCode, 200, 'Expected setup session close to succeed')

    const doneRes = makeRes()
    await inputHandler(makeReq({
      params: { sessionId: startRes.jsonBody.sessionId },
      body: { input: 'retry' },
    }), doneRes)
    assert.strictEqual(doneRes.statusCode, 400, 'Expected completed session input to return HTTP 400')
    assert.strictEqual(writes.length, 0, 'Expected no writes for invalid/closed inputs')
    spawnMock = null
  })

  await test('agent skill update rejects non-array skills payloads', async () => {
    const handler = getRouteHandler('put', '/agent/:agentId')
    const res = makeRes()
    await handler(makeReq({ params: { agentId: 'briefing-writer' }, body: { skills: 'github' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected non-array skill update to return HTTP 400')
    assert(/skills must be an array/i.test(res.jsonBody?.error || ''), 'Expected array validation guidance')
  })

  await test('bulk assign validates required agent and skill inputs', async () => {
    const handler = getRouteHandler('post', '/bulk-assign')

    const missingAgentsRes = makeRes()
    await handler(makeReq({ body: { addSkills: ['github'] } }), missingAgentsRes)
    assert.strictEqual(missingAgentsRes.statusCode, 400, 'Expected missing agent ids to return HTTP 400')

    const noOpsRes = makeRes()
    await handler(makeReq({ body: { agentIds: ['briefing-writer'] } }), noOpsRes)
    assert.strictEqual(noOpsRes.statusCode, 400, 'Expected empty add/remove request to return HTTP 400')

    const invalidSkillRes = makeRes()
    await handler(makeReq({ body: { agentIds: ['briefing-writer'], addSkills: ['not-a-real-skill'] } }), invalidSkillRes)
    assert.strictEqual(invalidSkillRes.statusCode, 400, 'Expected invalid add skill to return HTTP 400')
  })

  await test('validate rejects non-array skill payloads', async () => {
    const handler = getRouteHandler('post', '/validate')
    const res = makeRes()
    await handler(makeReq({ body: { skills: 'github' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected non-array validate payload to return HTTP 400')
  })

  await test('import rejects missing sourcePath and empty multi-skill directories', async () => {
    const handler = getRouteHandler('post', '/import')

    const missingPathRes = makeRes()
    await handler(makeReq({ body: {} }), missingPathRes)
    assert.strictEqual(missingPathRes.statusCode, 400, 'Expected missing sourcePath to return HTTP 400')

    const fs = require('fs')
    const os = require('os')
    const path = require('path')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-import-empty-'))
    fs.mkdirSync(path.join(root, 'skills'))

    try {
      const emptyRes = makeRes()
      await handler(makeReq({ body: { sourcePath: root } }), emptyRes)
      assert.strictEqual(emptyRes.statusCode, 400, 'Expected empty skills directory to return HTTP 400')
      assert(/no skills found/i.test(emptyRes.jsonBody?.error || ''), 'Expected empty-directory guidance')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  await test('import-github returns actionable per-skill errors when every repo skill fails', async () => {
    const tempRoots: string[] = []
    ;(childProcess as any).execSync = ((command: string) => {
      const match = command.match(/git clone --depth 1\s+\S+\s+(.+)$/)
      assert(match, `Expected clone command, got ${command}`)
      const tempDir = match[1]
      tempRoots.push(tempDir)
      const skillsRoot = `${tempDir}/skills`
      require('fs').mkdirSync(`${skillsRoot}/resend`, { recursive: true })
      require('fs').mkdirSync(`${skillsRoot}/resend-cli`, { recursive: true })
      require('fs').writeFileSync(`${skillsRoot}/resend/SKILL.md`, '# resend')
      require('fs').writeFileSync(`${skillsRoot}/resend-cli/SKILL.md`, '# resend-cli')
      return Buffer.from('')
    }) as typeof childProcess.execSync

    const skillsLib = require('../lib/skills')
    const originalImportWorkspaceSkill = skillsLib.importWorkspaceSkill
    skillsLib.importWorkspaceSkill = (skillPath: string) => ({
      success: false,
      skillId: require('path').basename(skillPath),
      error: 'Missing required metadata',
    })

    try {
      const handler = getRouteHandler('post', '/import-github')
      const res = makeRes()
      await handler(makeReq({
        body: { githubUrl: 'https://github.com/resend/resend-skills' },
      }), res)

      assert.strictEqual(res.statusCode, 400, 'Expected all-failed multi-skill import to return HTTP 400')
      assert(/Failed to import skills from GitHub/i.test(res.jsonBody?.error || ''), 'Expected summary prefix')
      assert(/resend: Missing required metadata/i.test(res.jsonBody?.error || ''), 'Expected resend failure reason')
      assert(/resend-cli: Missing required metadata/i.test(res.jsonBody?.error || ''), 'Expected resend-cli failure reason')
      assert.strictEqual(res.jsonBody?.imported, 0, 'Expected zero imported skills')
      assert.strictEqual(res.jsonBody?.total, 2, 'Expected two attempted skills')
    } finally {
      skillsLib.importWorkspaceSkill = originalImportWorkspaceSkill
      ;(childProcess as any).execSync = originalExecSync
      const fs = require('fs')
      for (const tempDir of tempRoots) {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  await test('import-github treats already-installed multi-skill repos as idempotent success', async () => {
    const tempRoots: string[] = []
    ;(childProcess as any).execSync = ((command: string) => {
      const match = command.match(/git clone --depth 1\s+\S+\s+(.+)$/)
      assert(match, `Expected clone command, got ${command}`)
      const tempDir = match[1]
      tempRoots.push(tempDir)
      const skillsRoot = `${tempDir}/skills`
      require('fs').mkdirSync(`${skillsRoot}/resend`, { recursive: true })
      require('fs').mkdirSync(`${skillsRoot}/resend-cli`, { recursive: true })
      require('fs').writeFileSync(`${skillsRoot}/resend/SKILL.md`, '# resend')
      require('fs').writeFileSync(`${skillsRoot}/resend-cli/SKILL.md`, '# resend-cli')
      return Buffer.from('')
    }) as typeof childProcess.execSync

    const skillsLib = require('../lib/skills')
    const originalImportWorkspaceSkill = skillsLib.importWorkspaceSkill
    skillsLib.importWorkspaceSkill = (skillPath: string) => ({
      success: false,
      skillId: require('path').basename(skillPath),
      error: `Skill '${require('path').basename(skillPath)}' already exists`,
    })

    try {
      const handler = getRouteHandler('post', '/import-github')
      const res = makeRes()
      await handler(makeReq({
        body: { githubUrl: 'https://github.com/resend/resend-skills' },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected already-installed multi-skill import to return HTTP 200')
      assert.strictEqual(res.jsonBody?.ok, true, 'Expected idempotent import to succeed')
      assert.strictEqual(res.jsonBody?.imported, 0, 'Expected zero new imports')
      assert.strictEqual(res.jsonBody?.existing, 2, 'Expected existing count to be reported')
      assert.strictEqual(res.jsonBody?.failed, 0, 'Expected no failed installs for already-present skills')
      assert(/already installed/i.test(res.jsonBody?.warning || ''), 'Expected already-installed warning')
      assert(Array.isArray(res.jsonBody?.skills) && res.jsonBody.skills.every((item: any) => item.ok), 'Expected normalized results to be marked ok')
    } finally {
      skillsLib.importWorkspaceSkill = originalImportWorkspaceSkill
      ;(childProcess as any).execSync = originalExecSync
      const fs = require('fs')
      for (const tempDir of tempRoots) {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  await test('import-github treats already-installed single skills as idempotent success', async () => {
    const tempRoots: string[] = []
    ;(childProcess as any).execSync = ((command: string) => {
      const match = command.match(/git clone --depth 1\s+\S+\s+(.+)$/)
      assert(match, `Expected clone command, got ${command}`)
      const tempDir = match[1]
      tempRoots.push(tempDir)
      require('fs').mkdirSync(tempDir, { recursive: true })
      require('fs').writeFileSync(`${tempDir}/SKILL.md`, '# single-skill')
      return Buffer.from('')
    }) as typeof childProcess.execSync

    const skillsLib = require('../lib/skills')
    const originalImportWorkspaceSkill = skillsLib.importWorkspaceSkill
    skillsLib.importWorkspaceSkill = () => ({
      success: false,
      skillId: 'single-skill',
      error: `Skill 'single-skill' already exists`,
    })

    try {
      const handler = getRouteHandler('post', '/import-github')
      const res = makeRes()
      await handler(makeReq({
        body: { githubUrl: 'https://github.com/example/single-skill' },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected already-installed single-skill import to return HTTP 200')
      assert.strictEqual(res.jsonBody?.ok, true, 'Expected idempotent single-skill import to succeed')
      assert.strictEqual(res.jsonBody?.skillId, 'single-skill', 'Expected single skill id to be preserved')
      assert.strictEqual(res.jsonBody?.imported, 0, 'Expected zero new imports')
      assert.strictEqual(res.jsonBody?.existing, 1, 'Expected one existing skill')
      assert(/already installed/i.test(res.jsonBody?.warning || ''), 'Expected already-installed warning')
    } finally {
      skillsLib.importWorkspaceSkill = originalImportWorkspaceSkill
      ;(childProcess as any).execSync = originalExecSync
      const fs = require('fs')
      for (const tempDir of tempRoots) {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
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

  await test('registry info validates skill names and provider support', async () => {
    const handler = getRouteHandler('get', '/registry/info/:name')

    const invalidNameRes = makeRes()
    await handler(makeReq({ params: { name: 'bad skill name!' }, query: { provider: 'shipables' } }), invalidNameRes)
    assert.strictEqual(invalidNameRes.statusCode, 400, 'Expected invalid skill name to return HTTP 400')

    const unsupportedProviderRes = makeRes()
    await handler(makeReq({ params: { name: 'gog' }, query: { provider: 'clawhub' } }), unsupportedProviderRes)
    assert.strictEqual(unsupportedProviderRes.statusCode, 400, 'Expected unsupported provider to return HTTP 400')
    assert(/not yet available/i.test(unsupportedProviderRes.jsonBody?.error || ''), 'Expected unsupported-provider guidance')
  })

  await test('partner installer routes validate unknown command ids', async () => {
    const installHandler = getRouteHandler('post', '/partner-install')
    const uninstallHandler = getRouteHandler('post', '/partner-uninstall')

    const installRes = makeRes()
    await installHandler(makeReq({ body: { commandId: 'missing-partner' } }), installRes)
    assert.strictEqual(installRes.statusCode, 400, 'Expected unknown partner install command to return HTTP 400')

    const uninstallRes = makeRes()
    await uninstallHandler(makeReq({ body: { commandId: 'missing-partner' } }), uninstallRes)
    assert.strictEqual(uninstallRes.statusCode, 400, 'Expected unknown partner uninstall command to return HTTP 400')
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
