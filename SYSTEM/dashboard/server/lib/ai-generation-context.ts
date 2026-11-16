import { AsyncLocalStorage } from 'async_hooks'
import type { RequestHandler } from 'express'
import type { ProviderKeys } from './dashboard-env'

// Always enter a distinct container, including an empty scope. ALS may optimize
// run(undefined) inside another empty scope, allowing enterWith to alter its parent.
const keys = new AsyncLocalStorage<{ value?: ProviderKeys }>()
export function getRequestByokKeys(): ProviderKeys | undefined { return keys.getStore()?.value }
export function setRequestByokKeys(value: ProviderKeys | undefined): void {
  const snapshot = value ? { ...value } : undefined
  const scope = keys.getStore()
  if (scope) scope.value = snapshot
  else keys.enterWith({ value: snapshot })
}
export function withRequestByokKeys<T>(value: ProviderKeys | undefined, work: () => T): T {
  return keys.run({ value: value ? { ...value } : undefined }, work)
}
// Every HTTP request starts empty, including keep-alive requests and requests with no BYOK.
export const aiGenerationRequestContext: RequestHandler = (_req, _res, next) => withRequestByokKeys(undefined, next)
