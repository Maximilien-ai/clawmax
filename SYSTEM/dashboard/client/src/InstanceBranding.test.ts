import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { getInstanceDocumentTitle, normalizeInstanceLabel, usesCloudInstanceAccent } from './lib/instanceBranding'

assert.strictEqual(normalizeInstanceLabel(' Enterprise · Synthetic Tenant 01 '), 'Enterprise · Synthetic Tenant 01')
assert.strictEqual(normalizeInstanceLabel(undefined), '')
assert.strictEqual(getInstanceDocumentTitle('Enterprise · Synthetic Tenant 01'), 'ClawMax · Enterprise · Synthetic Tenant 01')
assert.strictEqual(getInstanceDocumentTitle('  '), 'ClawMax')
assert.strictEqual(usesCloudInstanceAccent('cloud'), true)
assert.strictEqual(usesCloudInstanceAccent('local'), false)

const loginSource = fs.readFileSync(path.join(__dirname, 'pages', 'Login.tsx'), 'utf8')
assert(loginSource.includes("{instanceLabel || 'ClawMax.ai Owner Console'}"), 'Login must visibly render the instance label with a generic fallback')
assert(!loginSource.includes('dangerouslySetInnerHTML'), 'Login must rely on escaped React text rendering for the untrusted label')

const appSource = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf8')
assert(appSource.includes('`Owner Dashboard · ${system.instanceLabel}`'), 'Authenticated header must retain the instance label')

const serverSource = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'index.ts'), 'utf8')
assert(serverSource.includes('instanceLabel: getDashboardInstanceLabel(rawEnv)'), 'Public auth config must expose the normalized instance label')
assert(serverSource.includes('insecureLocalCookies: !shouldUseSecureAuthCookies(_req)'), 'Public auth config must disclose the local HTTP cookie exception')

console.log('InstanceBranding.test.ts: 11 assertions passed')
