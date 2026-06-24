import assert from 'assert'
import {
  buildServerManagedWorkspaceEntries,
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

test('listServerManagedIntegrationSecretKeys sorts and deduplicates repeated saved keys', () => {
  const keys = listServerManagedIntegrationSecretKeys(
    [
      { slug: 'resend', fields: [{ key: 'apiKey', secret: true, storage: 'server' }] },
      { slug: 'resend', fields: [{ key: 'apiKey', secret: true, storage: 'server' }] },
      { slug: 'github', fields: [{ key: 'token', secret: true, storage: 'server' }] },
    ],
    {
      resend: { apiKey: true },
      github: { token: true },
    },
  )

  assert.deepStrictEqual(keys, ['GITHUB_TOKEN', 'RESEND_API_KEY'])
})

test('listServerManagedIntegrationSecretKeys ignores browser-managed and non-secret fields', () => {
  const keys = listServerManagedIntegrationSecretKeys(
    [
      {
        slug: 'senso',
        fields: [
          { key: 'apiKey', secret: true, storage: 'browser' },
          { key: 'baseUrl', storage: 'server' },
        ],
      },
    ],
    {
      senso: { apiKey: true, baseUrl: true },
    },
  )

  assert.deepStrictEqual(keys, [])
})

test('buildServerManagedWorkspaceEntries falls back to masked preview when preview text is blank', () => {
  const entries = buildServerManagedWorkspaceEntries(
    [
      {
        slug: 'resend',
        fields: [{ key: 'apiKey', secret: true, storage: 'server' }],
      },
    ],
    {
      resend: { apiKey: { present: true, preview: '' } },
    },
  )

  assert.deepStrictEqual(entries, { RESEND_API_KEY: '••••' })
})

test('buildServerManagedWorkspaceEntries ignores absent summaries and unsaved entries', () => {
  const entries = buildServerManagedWorkspaceEntries(
    [
      {
        slug: 'github',
        fields: [{ key: 'token', secret: true, storage: 'server' }],
      },
      {
        slug: 'resend',
        fields: [{ key: 'apiKey', secret: true, storage: 'server' }],
      },
    ],
    {
      github: { token: { present: false, preview: 'ghp_••••' } },
    },
  )

  assert.deepStrictEqual(entries, {})
})

console.log('keysSecretsInventoryEdges.test.ts: ok')
