import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { hostCredentialStatusKey, readHostCredentialConfirmation, saveHostCredentialConfirmation } from './hostCredentialStatus'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value) },
  removeItem: (key: string) => { values.delete(key) },
}

assert.equal(readHostCredentialConfirmation(storage, 'dev-a', 'MAXIMILIEN_ACCESS_TOKEN'), false)
saveHostCredentialConfirmation(storage, 'dev-a', 'MAXIMILIEN_ACCESS_TOKEN', true)
assert.equal(readHostCredentialConfirmation(storage, 'dev-a', 'MAXIMILIEN_ACCESS_TOKEN'), true)
assert.equal(readHostCredentialConfirmation(storage, 'dev-b', 'MAXIMILIEN_ACCESS_TOKEN'), false)
assert.equal(readHostCredentialConfirmation(storage, 'dev-a', 'OTHER_TOKEN'), false)
assert.equal(values.get(hostCredentialStatusKey('dev-a', 'MAXIMILIEN_ACCESS_TOKEN')!), 'previously-signed-in')
saveHostCredentialConfirmation(storage, 'dev-a', 'MAXIMILIEN_ACCESS_TOKEN', false)
assert.equal(readHostCredentialConfirmation(storage, 'dev-a', 'MAXIMILIEN_ACCESS_TOKEN'), false)
assert.equal(hostCredentialStatusKey('../bad', 'MAXIMILIEN_ACCESS_TOKEN'), null)

const source = fs.readFileSync(path.join(__dirname, '../components/HostCredentialPill.tsx'), 'utf8')
assert(source.includes('readHostCredentialConfirmation(window.localStorage, instanceKey, credentialName)'))
assert(source.includes('saveHostCredentialConfirmation(window.localStorage, instanceKey, credentialName, status.signedIn && !status.reauthRequired && status.isOwner)'))
assert(source.includes('previously signed in · rechecked on use'))
console.log('hostCredentialStatus.test.ts: passed')
