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
assert(source.includes('Encrypted saving is locked'), 'unconfigured encrypted saving should have an explicit locked state')
assert(source.includes('Copy setup steps'), 'operators should be able to copy concise setup instructions')
assert(source.includes("disabled={!status.configured || busy}"), 'secret fields should be disabled until the operator key is configured')
assert(source.includes('Set operator key first'), 'disabled save action should explain its prerequisite')
assert(source.includes('clawmax-secret-test</code> is the packaged test skill'), 'test setup should distinguish the skill ID from the secret key')
assert(source.includes('CLAWMAX_TEST_SECRET</code> is the encrypted key'), 'test setup should name the encrypted sentinel key')
assert(source.includes("detail: { page: 'skills' }"), 'test setup should link directly to Skills')
assert(source.includes('!selectedSkillAssigned'), 'authorization should be blocked until the selected skill is assigned')

console.log('SkillSecretBrokerPanel.test.ts: 16 assertions passed')
