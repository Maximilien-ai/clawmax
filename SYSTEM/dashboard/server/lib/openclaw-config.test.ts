import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== OpenClaw Config Helper Test Suite ===${RESET}\n`)

test('writeDashboardManagedOpenClawConfig preserves latest gateway fields from disk', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-openclaw-config-'))
  const configPath = path.join(tempDir, 'openclaw.json')

  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      auth: { token: 'stable-auth' },
      remote: { token: 'stable-remote' },
      tailscale: { enabled: true, hostname: 'stable-host' },
    },
    agents: {
      list: [
        { id: 'alpha', workspace: '/workspace/alpha', skills: ['github'] },
      ],
    },
  }, null, 2), 'utf-8')

  const staleConfig = {
    gateway: {
      auth: { token: 'stale-auth' },
      remote: { token: 'stale-remote' },
      tailscale: { enabled: false, hostname: 'stale-host' },
    },
    agents: {
      list: [
        { id: 'alpha', workspace: '/workspace/alpha', skills: ['slack'] },
      ],
    },
  }

  writeDashboardManagedOpenClawConfig(configPath, staleConfig, 'openclaw-config-test')

  const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  assert(saved.gateway.auth.token === 'stable-auth', 'Expected gateway auth token preserved from latest on-disk config')
  assert(saved.gateway.remote.token === 'stable-remote', 'Expected gateway remote token preserved from latest on-disk config')
  assert(saved.gateway.tailscale.hostname === 'stable-host', 'Expected gateway tailscale config preserved from latest on-disk config')
  assert(Array.isArray(saved.agents.list) && saved.agents.list[0].skills.includes('slack'), 'Expected non-gateway config changes to be written')
  assert(saved.meta?.lastTouchedVersion === 'dashboard-0.1.0', 'Expected dashboard metadata stamping')
})

console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
console.log(`${RED}Failed: ${testsFailed}${RESET}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
}

console.log(`\n${GREEN}All tests passed! ✓${RESET}`)
