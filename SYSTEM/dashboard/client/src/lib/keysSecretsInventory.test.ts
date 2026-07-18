import assert from 'assert'
import {
  buildServerManagedWorkspaceEntries,
  getSecretAvailabilityPresentation,
  listServerManagedIntegrationSecretKeys,
} from './keysSecretsInventory'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('listServerManagedIntegrationSecretKeys surfaces saved server-side partner secrets', () => {
  const keys = listServerManagedIntegrationSecretKeys(
    [
      {
        slug: 'resend',
        fields: [{ key: 'apiKey', secret: true, storage: 'server' }],
      },
      {
        slug: 'github',
        fields: [{ key: 'token', secret: true, storage: 'server' }],
      },
      {
        slug: 'senso',
        fields: [{ key: 'apiKey', secret: true, storage: 'browser' }],
      },
    ],
    {
      resend: { apiKey: true },
      github: { token: false },
      senso: { apiKey: true },
    }
  )

  assert.deepEqual(keys, ['RESEND_API_KEY'])
})

test('buildServerManagedWorkspaceEntries returns masked previews for saved server-side partner secrets', () => {
  const entries = buildServerManagedWorkspaceEntries(
    [
      {
        slug: 'resend',
        fields: [{ key: 'apiKey', secret: true, storage: 'server' }],
      },
    ],
    {
      resend: { apiKey: { present: true, preview: 're_t••••_123' } },
    }
  )

  assert.deepEqual(entries, { RESEND_API_KEY: 're_t••••_123' })
})

test('browser vault entries are explicitly unavailable to the agent runtime', () => {
  assert.deepEqual(getSecretAvailabilityPresentation(false), {
    sourceLabel: 'Browser-local',
    runtimeLabel: 'Not available to agent runtime from this vault',
    agentRuntimeAvailable: false,
  })
})

test('runtime-managed integration entries do not imply an agent skill grant', () => {
  assert.deepEqual(getSecretAvailabilityPresentation(true), {
    sourceLabel: 'Runtime-managed',
    runtimeLabel: 'Configured integration runtime only; agent skills require an explicit grant',
    agentRuntimeAvailable: false,
  })
})

console.log('keysSecretsInventory.test.ts: ok')
