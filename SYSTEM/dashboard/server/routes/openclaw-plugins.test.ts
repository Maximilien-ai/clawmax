import assert from 'node:assert/strict'
import router from './openclaw-plugins'
import { openClawPlugins } from '../lib/openclaw-plugins'
const auth = require('../lib/github-auth')
const originalSession = auth.getAuthenticatedSession
const originalList = openClawPlugins.list
const originalHistory = openClawPlugins.history
const originalChange = openClawPlugins.change
const handler = (method: string, route: string) => router.stack.find((entry: any) => entry.route?.path === route && entry.route.methods[method])!.route.stack[0].handle
const response = () => ({ code: 200, body: null as any, status(code: number) { this.code = code; return this }, json(body: any) { this.body = body; return this } })
async function main() {
  let enterprise = false
  let changes = 0
  auth.getAuthenticatedSession = () => enterprise ? { enterprise: { workspaceId: 'other' } } : null
  openClawPlugins.list = async () => []
  openClawPlugins.history = () => []
  openClawPlugins.change = async () => { changes++; return { changed: true, restartRequired: true } }
  try {
    const req: any = { params: { id: 'example' }, body: { enabled: true, confirmRestartImpact: true }, get: (name: string) => name === 'host' ? 'localhost:3001' : 'http://localhost:3001' }
    let res = response()
    await handler('get', '/')(req, res, () => {})
    assert.equal(res.body.canManage, true)
    enterprise = true; res = response()
    await handler('put', '/:id')(req, res, () => {})
    assert.equal(res.code, 403); assert.equal(changes, 0)
    enterprise = false; res = response()
    await handler('put', '/:id')({ ...req, get: (name: string) => name === 'host' ? 'localhost:3001' : 'https://attacker.example' }, res, () => {})
    assert.equal(res.code, 403); assert.equal(changes, 0)
    res = response(); await handler('put', '/:id')(req, res, () => {})
    assert.equal(res.code, 200); assert.equal(changes, 1)
    assert(router.stack.every((entry: any) => !entry.route || ['/', '/:id'].includes(entry.route.path)))
    openClawPlugins.list = async () => { throw new Error('secret-do-not-leak') }
    res = response(); await handler('get', '/')(req, res, () => {})
    assert.equal(res.code, 503); assert(!JSON.stringify(res.body).includes('secret-do-not-leak'))
    console.log('OpenClaw plugin route tests passed')
  } finally {
    auth.getAuthenticatedSession = originalSession
    openClawPlugins.list = originalList; openClawPlugins.history = originalHistory; openClawPlugins.change = originalChange
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
