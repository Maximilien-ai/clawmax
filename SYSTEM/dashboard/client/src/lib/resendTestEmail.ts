export type ResendTestUser = {
  email?: string | null
  login?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveResendTestRecipientEmail(user: ResendTestUser | null | undefined): string {
  const email = clean(user?.email)
  if (EMAIL_RE.test(email)) return email

  const login = clean(user?.login)
  if (EMAIL_RE.test(login)) return login

  return ''
}
