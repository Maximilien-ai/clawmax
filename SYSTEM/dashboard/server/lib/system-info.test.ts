import assert from 'assert'
import { buildSystemInfoPayload } from './system-info'

function run() {
  const payload = buildSystemInfoPayload({
    workspace: '/tmp/workspace',
    hostname: 'test-host',
    platform: 'linux',
    agents: [
      { status: 'online', paused: false },
      { status: 'offline', paused: false },
      { status: 'online', paused: true },
    ],
    version: '1.6.6',
    instanceLabel: 'On-Prem',
    gitBranch: 'main',
    deploymentKind: 'onprem',
    managedRuntime: true,
    ollamaEnabled: true,
    defaultOllamaBaseUrl: 'http://host.containers.internal:11434',
    defaultOpenAiCompatibleBaseUrl: 'http://host.containers.internal:1234/v1',
    maintenanceBanner: null,
    hostAgentStatus: null,
    runtimeIdentity: {
      instanceKey: 'instance-a',
      machineId: 'machine-1',
      machineName: 'machine-name',
    },
    orgName: 'Demo Org',
  })

  assert.strictEqual(payload.platform, 'linux')
  assert.strictEqual(payload.agentCount, 3)
  assert.strictEqual(payload.activeAgentCount, 2)
  assert.strictEqual(payload.pausedAgentCount, 1)
  assert.strictEqual(payload.onlineCount, 1)
  assert.strictEqual(payload.instanceLabel, 'On-Prem')
  assert.strictEqual(payload.deploymentKind, 'onprem')
  assert.strictEqual(payload.defaultOllamaBaseUrl, 'http://host.containers.internal:11434')
  assert.strictEqual(payload.orgName, 'Demo Org')

  console.log('system-info.test.ts: 9 tests passed')
}

run()
