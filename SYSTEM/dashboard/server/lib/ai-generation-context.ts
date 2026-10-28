import { AsyncLocalStorage } from 'async_hooks'
import type { RequestHandler } from 'express'
import type { ProviderKeys } from './dashboard-env'

const keys = new AsyncLocalStorage<ProviderKeys | undefined>()
export function getRequestByokKeys(): ProviderKeys | undefined { return keys.getStore() }
export function setRequestByokKeys(value: ProviderKeys | undefined): void { keys.enterWith(value ? { ...value } : undefined) }
export function withRequestByokKeys<T>(value: ProviderKeys | undefined, work: () => T): T { return keys.run(value ? { ...value } : undefined, work) }
// Every HTTP request starts empty, including keep-alive requests and requests with no BYOK.
export const aiGenerationRequestContext: RequestHandler = (_req, _res, next) => withRequestByokKeys(undefined, next)
