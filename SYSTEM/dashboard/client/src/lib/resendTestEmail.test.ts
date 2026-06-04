import assert from 'assert'
import { resolveResendTestRecipientEmail } from './resendTestEmail'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('resend test recipient prefers authenticated user email', () => {
  assert.equal(resolveResendTestRecipientEmail({
    email: ' user@example.com ',
    login: 'github-user',
  }), 'user@example.com')
})

test('resend test recipient falls back to OTP-style email login', () => {
  assert.equal(resolveResendTestRecipientEmail({
    email: null,
    login: 'otp-user@example.com',
  }), 'otp-user@example.com')
})

test('resend test recipient is empty when auth session has no email address', () => {
  assert.equal(resolveResendTestRecipientEmail({
    email: null,
    login: 'github-user',
  }), '')
})

console.log('resendTestEmail.test.ts: ok')
