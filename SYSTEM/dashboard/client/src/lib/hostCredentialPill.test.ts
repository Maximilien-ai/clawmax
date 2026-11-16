import assert from 'assert'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, '../components/HostCredentialPill.tsx'), 'utf8')
assert(source.includes('config?.hostAuthBridgeReady === true'), 'Bridge must be explicitly approved before the button can launch it')
assert(source.includes('disabled={!bridgeReady}'), 'Unapproved bridge must leave the sign-in button disabled')
assert(source.includes('hostAdapters[credentialName'), 'Only trusted adapters may supply the host sign-in URL')
assert(!source.includes('fetch('), 'Dashboard must not proxy host credential status or tokens through its API')
console.log('hostCredentialPill.test.ts: passed')
