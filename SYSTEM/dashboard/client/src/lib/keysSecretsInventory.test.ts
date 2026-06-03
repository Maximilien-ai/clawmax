import assert from 'assert'
import { listServerManagedIntegrationSecretKeys } from './keysSecretsInventory'

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

console.log('keysSecretsInventory.test.ts: ok')
