import assert from 'node:assert/strict'
import { buildWhatsAppPairingDoneError } from './whatsAppPairing'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

test('buildWhatsAppPairingDoneError ignores done status after a linked event', () => {
  assert.equal(buildWhatsAppPairingDoneError('exit code 0', true), null)
})

test('buildWhatsAppPairingDoneError ignores ok status even before linked UI state flushes', () => {
  assert.equal(buildWhatsAppPairingDoneError('ok', false), null)
})

test('buildWhatsAppPairingDoneError returns a friendly failure when pairing ended unsuccessfully', () => {
  assert.equal(buildWhatsAppPairingDoneError('exit code 1', false), 'Pairing ended: exit code 1')
})
