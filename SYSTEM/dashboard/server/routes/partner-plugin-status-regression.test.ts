/**
 * Partner plugin status regression suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/partner-plugin-status-regression.test.ts
 */

import assert from 'assert'
import childProcess from 'child_process'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

type ExecFileCallback = (error: NodeJS.ErrnoException | null, stdout?: string, stderr?: string) => void
type ExecFileMock = (file: string, args: string[], options: any, callback: ExecFileCallback) => void

const originalExecFile = childProcess.execFile
let execFileMock: ExecFileMock = (_file, _args, _options, callback) => callback(null, JSON.stringify({ plugins: [] }), '')

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

function getRouteHandler(method: 'get', routePath: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
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

async function readPartnerPluginStatus() {
  const handler = getRouteHandler('get', '/partner-install/status')
  const res = makeRes()
  await handler({} as any, res)
  assert.strictEqual(res.statusCode, 200, 'Expected partner status route to return HTTP 200')
  return res.jsonBody?.statuses?.['cognee-openclaw']
}

function installedCogneePlugin(version: string, enabled = true) {
  return {
    id: 'cognee-openclaw',
    name: 'Memory (Cognee)',
    version,
    enabled,
    status: enabled ? 'loaded' : 'disabled',
    origin: 'global',
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Partner Plugin Status Regression Suite ===${RESET}\n`)

  await test('Cognee plugin status transitions installed to absent to reinstalled', async () => {
    const pluginSnapshots = [
      { plugins: [installedCogneePlugin('2026.5.21')] },
      { plugins: [] },
      { plugins: [installedCogneePlugin('2026.5.22')] },
    ]
    const calls: Array<{ file: string; args: string[] }> = []

    execFileMock = (file, args, _options, callback) => {
      calls.push({ file, args })
      const next = pluginSnapshots.shift()
      callback(null, JSON.stringify(next || { plugins: [] }), '')
    }

    const beforeUninstall = await readPartnerPluginStatus()
    assert.strictEqual(beforeUninstall.installed, true, 'Expected installed plugin before uninstall')
    assert.strictEqual(beforeUninstall.enabled, true, 'Expected enabled plugin before uninstall')
    assert.strictEqual(beforeUninstall.status, 'loaded', 'Expected loaded status before uninstall')
    assert.strictEqual(beforeUninstall.version, '2026.5.21', 'Expected first plugin version')

    const afterUninstall = await readPartnerPluginStatus()
    assert.strictEqual(afterUninstall.installed, false, 'Expected absent plugin after uninstall')
    assert.strictEqual(afterUninstall.enabled, false, 'Expected disabled UI state after uninstall')
    assert.strictEqual(afterUninstall.status, 'not-installed', 'Expected not-installed status after uninstall')

    const afterReinstall = await readPartnerPluginStatus()
    assert.strictEqual(afterReinstall.installed, true, 'Expected installed plugin after reinstall')
    assert.strictEqual(afterReinstall.enabled, true, 'Expected enabled plugin after reinstall')
    assert.strictEqual(afterReinstall.status, 'loaded', 'Expected loaded status after reinstall')
    assert.strictEqual(afterReinstall.version, '2026.5.22', 'Expected refreshed plugin version after reinstall')

    assert.strictEqual(calls.length, 3, 'Expected one OpenClaw plugin list call per status refresh')
    assert(calls.every((call) => call.file === 'openclaw'), 'Expected status checks to use OpenClaw CLI')
    assert(calls.every((call) => JSON.stringify(call.args) === JSON.stringify(['plugins', 'list', '--json'])), 'Expected status checks to request JSON plugin list')
  })

  await test('Cognee plugin status falls back to unknown when inspection fails', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      callback(new Error('openclaw unavailable') as NodeJS.ErrnoException, '', '')
    }

    const handler = getRouteHandler('get', '/partner-install/status')
    const res = makeRes()
    await handler({} as any, res)

    assert.strictEqual(res.statusCode, 500, 'Expected failed inspection to return HTTP 500')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.installed, false, 'Expected unknown fallback to disable installed state')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.enabled, false, 'Expected unknown fallback to disable enabled state')
    assert.strictEqual(res.jsonBody?.statuses?.['cognee-openclaw']?.status, 'unknown', 'Expected unknown fallback status')
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
