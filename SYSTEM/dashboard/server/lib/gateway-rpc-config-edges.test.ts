import fs from 'fs'
import os from 'os'
import path from 'path'
import { __test } from './gateway-rpc'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function withTempHome(fn: (homeDir: string) => void) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-gateway-rpc-'))
  const originalHome = process.env.HOME
  process.env.HOME = tmpHome
  try {
    fn(tmpHome)
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
}

console.log(`\n${YELLOW}=== Gateway RPC Config Edge Test Suite ===${RESET}\n`)

test('loadGatewayConfigFromDisk returns null when the OpenClaw config file is missing', () => {
  withTempHome(() => {
    const parsed = __test.loadGatewayConfigFromDisk()
    assert(parsed === null, 'Expected missing config file to return null')
  })
})

test('loadGatewayConfigFromDisk returns null for invalid JSON content', () => {
  withTempHome((homeDir) => {
    const configDir = path.join(homeDir, '.openclaw')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(path.join(configDir, 'openclaw.json'), '{ not-json', 'utf8')

    const parsed = __test.loadGatewayConfigFromDisk()
    assert(parsed === null, 'Expected invalid JSON to return null')
  })
})

test('loadGatewayConfigFromDisk parses a valid local gateway config from HOME', () => {
  withTempHome((homeDir) => {
    const configDir = path.join(homeDir, '.openclaw')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'openclaw.json'),
      JSON.stringify({
        gateway: {
          port: 19777,
          auth: { token: 'gateway-token' },
        },
      }),
      'utf8',
    )

    const parsed = __test.loadGatewayConfigFromDisk()
    assert(!!parsed, 'Expected config to parse from disk')
    assert(parsed?.port === 19777, `Expected port 19777, got ${parsed?.port}`)
    assert(parsed?.host === '127.0.0.1', `Expected localhost host, got ${parsed?.host}`)
    assert(parsed?.httpUrl === 'http://127.0.0.1:19777', `Expected default http url, got ${parsed?.httpUrl}`)
    assert(parsed?.wsUrl === 'ws://127.0.0.1:19777', `Expected default ws url, got ${parsed?.wsUrl}`)
    assert(parsed?.auth.token === 'gateway-token', `Expected gateway token, got ${parsed?.auth.token}`)
    assert(parsed?.auth.mode === 'token', `Expected default token mode, got ${parsed?.auth.mode}`)
  })
})

setTimeout(() => {
  console.log(`\nPassed: ${testsPassed}`)
  console.log(`Failed: ${testsFailed}`)

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed!${RESET}`)
    process.exit(0)
  }
}, 50)
