import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(process.cwd(), 'client/src/components/SkillSecretBrokerPanel.tsx'), 'utf8')

assert(source.includes('CLAWMAX_SECRET_MASTER_KEY'), 'operator-key setup guidance should be visible')
assert(source.includes('Do not store a normal Google account password'), 'Google password safety guidance should be explicit')
assert(source.includes('Authorize Secret Access'), 'grant action should be present')
assert(source.includes('Test Access'), 'authorized access test action should be present')
assert(source.includes('Revoke'), 'grant revocation action should be present')
assert(source.includes('sm:grid-cols-'), 'forms should adapt to narrow/mobile layouts')
assert(source.includes("type=\"password\""), 'secret input should be visually protected')
assert(source.includes('window.confirm'), 'destructive encrypted-secret deletion should require confirmation')

console.log('SkillSecretBrokerPanel.test.ts: 8 assertions passed')
