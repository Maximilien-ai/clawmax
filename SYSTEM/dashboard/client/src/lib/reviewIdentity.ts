export interface ReviewIdentity {
  name: string
  email: string
}

interface ReviewIdentityUser {
  login?: string | null
  name?: string | null
  email?: string | null
}

export const REVIEW_IDENTITY_STORAGE_KEY = 'clawmax-reviewer-identity'

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveReviewIdentity(
  user: ReviewIdentityUser | null | undefined,
  stored: Partial<ReviewIdentity> | null | undefined,
): ReviewIdentity {
  return {
    name: clean(user?.name) || clean(user?.login) || clean(stored?.name),
    email: clean(user?.email) || clean(stored?.email),
  }
}

export function readStoredReviewIdentity(storage: Pick<Storage, 'getItem'>): ReviewIdentity {
  try {
    const parsed = JSON.parse(storage.getItem(REVIEW_IDENTITY_STORAGE_KEY) || '{}')
    return { name: clean(parsed?.name), email: clean(parsed?.email) }
  } catch {
    return { name: '', email: '' }
  }
}

export function storeReviewIdentity(
  storage: Pick<Storage, 'setItem'>,
  identity: ReviewIdentity,
): void {
  storage.setItem(REVIEW_IDENTITY_STORAGE_KEY, JSON.stringify({
    name: clean(identity.name),
    email: clean(identity.email),
  }))
}
