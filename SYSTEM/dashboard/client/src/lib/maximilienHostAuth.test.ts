import assert from 'assert'
import { maximilienHostAuthUrl, readMaximilienHostAuthMessage } from './maximilienHostAuth'

assert.equal(maximilienHostAuthUrl('onp-example'), 'http://127.0.0.1:3203/maximilien-auth?instanceKey=onp-example')
assert.equal(maximilienHostAuthUrl('../other'), null)
const opened = {} as Window
const status = { apiVersion: 'clawmax.host-auth/v1', kind: 'AuthStatus', instanceKey: 'onp-example', signedIn: true, reauthRequired: false, isOwner: true }
const event = (origin: string, source: Window | null, data: unknown) => ({ origin, source, data } as MessageEvent)
assert.deepEqual(readMaximilienHostAuthMessage(event('http://127.0.0.1:3203', opened, status), opened, 'onp-example'), status)
assert.equal(readMaximilienHostAuthMessage(event('http://evil.example', opened, status), opened, 'onp-example'), null)
assert.equal(readMaximilienHostAuthMessage(event('http://127.0.0.1:3203', {} as Window, status), opened, 'onp-example'), null)
assert.equal(readMaximilienHostAuthMessage(event('http://127.0.0.1:3203', opened, { ...status, instanceKey: 'another' }), opened, 'onp-example'), null)
assert.equal(readMaximilienHostAuthMessage(event('http://127.0.0.1:3203', opened, { ...status, token: 'must-not-pass' }), opened, 'onp-example'), null)
assert.equal(readMaximilienHostAuthMessage(event('http://127.0.0.1:3203', opened, { ...status, signedIn: false }), opened, 'onp-example'), null)
console.log('maximilienHostAuth.test.ts: passed')
