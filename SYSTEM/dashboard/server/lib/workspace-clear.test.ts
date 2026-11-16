import assert from 'assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceClearService, CLEAR_RECEIPT, type ClearDependencies } from './workspace-clear'
import { assertWorkspaceRecovered } from './workspace-recovery-admission'

async function main() {
  let passed = 0
  const test = async (name: string, run: (fixture: ReturnType<typeof setup>) => unknown) => {
    const fixture = setup()
    try { await run(fixture); passed++; console.log(`✓ ${name}`) }
    finally { fs.rmSync(fixture.base, { recursive: true, force: true }) }
  }
  function setup() {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'personal-clear-')))
    const root = path.join(base, 'personal'), other = path.join(base, 'other')
    fs.mkdirSync(path.join(root, 'AGENTS', 'sample'), { recursive: true })
    fs.mkdirSync(other)
    fs.writeFileSync(path.join(root, 'AGENTS', 'sample', 'IDENTITY.md'), 'synthetic agent')
    for (const name of ['WORKFLOWS', 'ORG', 'SKILLS', 'TEMPLATES', 'SYSTEM', '.plugin-state']) {
      fs.mkdirSync(path.join(root, name)); fs.writeFileSync(path.join(root, name, 'fixture.txt'), 'synthetic content')
    }
    fs.writeFileSync(path.join(other, 'keep.txt'), 'untouched')
    const workspaces = [{ id: 'default', name: 'Personal', path: root, createdAt: 'now', lastAccessedAt: 'now' }, { id: 'other', name: 'Other', path: other, createdAt: 'now', lastAccessedAt: 'now' }]
    const deps: ClearDependencies = { workspaces: () => workspaces, protectedRoots: () => [base], inspectRuntime() {}, async prepareRuntime() {}, finishRuntime() {} }
    const service = new WorkspaceClearService(deps)
    const confirm = (token: string) => service.clear('owner', { token, confirmation: 'CLEAR PERSONAL', acknowledged: true })
    return { base, root, other, deps, service, confirm, workspaces }
  }
  await test('preview is non-destructive and includes all files without content', ({ service, root }) => {
    const preview = service.preview('owner')
    assert.equal(preview.agentCount, 1)
    assert.equal(Object.values(preview.counts).reduce((a, b) => a + b, 0), 7)
    assert(!JSON.stringify(preview).includes('synthetic'))
    assert(!fs.existsSync(path.join(root, CLEAR_RECEIPT)))
  })
  await test('both confirmation fields and actor binding are required', async ({ service, root }) => {
    const { token } = service.preview('owner')
    for (const body of [{ token }, { token, confirmation: 'CLEAR PERSONAL' }, { token, confirmation: 'Personal', acknowledged: true }]) await assert.rejects(service.clear('owner', body))
    await assert.rejects(service.clear('other-owner', { token, confirmation: 'CLEAR PERSONAL', acknowledged: true }))
    assert(fs.existsSync(path.join(root, 'AGENTS', 'sample')))
  })
  await test('clears content, retains identity, other workspace and restart receipt', async ({ service, confirm, root, other, workspaces, deps }) => {
    const before = JSON.stringify(workspaces)
    const inode = fs.statSync(root).ino
    const result = await confirm(service.preview('owner').token)
    assert(result.ok)
    assert.equal(fs.statSync(root).ino, inode)
    assert.equal(JSON.stringify(workspaces), before)
    assert.equal(fs.readFileSync(path.join(other, 'keep.txt'), 'utf8'), 'untouched')
    assert.deepEqual(fs.readdirSync(root).sort(), [CLEAR_RECEIPT, 'AGENTS', 'ORG', 'SYSTEM'].sort())
    assert(!fs.existsSync(path.join(root, 'AGENTS', 'sample')))
    assert.equal(new WorkspaceClearService(deps).receipt()?.state, 'complete')
    assert.doesNotThrow(() => assertWorkspaceRecovered(root))
  })
  await test('changed content invalidates old confirmation', async ({ service, confirm, root }) => {
    const preview = service.preview('owner')
    fs.writeFileSync(path.join(root, 'new.txt'), 'new')
    await assert.rejects(confirm(preview.token), /changed/)
    assert(!fs.existsSync(path.join(root, CLEAR_RECEIPT)))
  })
  await test('used confirmation cannot delete newly created content', async ({ service, confirm, root }) => {
    const { token } = service.preview('owner'); await confirm(token)
    fs.writeFileSync(path.join(root, 'new.txt'), 'new')
    await assert.rejects(confirm(token))
    assert(fs.existsSync(path.join(root, 'new.txt')))
  })
  await test('runtime refusal leaves files intact and durable failure fences new work', async ({ service, confirm, deps, root }) => {
    deps.prepareRuntime = async () => { throw new Error('synthetic runtime failure') }
    await assert.rejects(confirm(service.preview('owner').token), /did not finish/)
    assert(fs.existsSync(path.join(root, 'AGENTS', 'sample')))
    assert.equal(service.receipt()?.state, 'failed')
    assert.throws(() => assertWorkspaceRecovered(root))
    deps.prepareRuntime = async () => {}
    const restart = new WorkspaceClearService(deps)
    const preview = restart.preview('owner'); assert(preview.resume)
    await restart.clear('owner', { token: preview.token, confirmation: 'CLEAR PERSONAL', acknowledged: true })
    assert.equal(restart.receipt()?.state, 'complete')
  })
  await test('concurrent clear cannot dispatch twice', async ({ service, confirm, deps }) => {
    let release!: () => void, calls = 0
    deps.prepareRuntime = () => { calls++; return new Promise<void>(resolve => { release = resolve }) }
    const first = service.preview('owner'), second = service.preview('owner')
    const running = confirm(first.token)
    await assert.rejects(confirm(second.token), /already/)
    release(); await running; assert.equal(calls, 1)
  })
  await test('unsafe protected and overlapping roots refuse preview', ({ service, workspaces, root, deps }) => {
    deps.protectedRoots = () => [root]
    assert.throws(() => service.preview('owner'), /unsafe/)
    deps.protectedRoots = () => []
    workspaces[1].path = path.join(root, 'nested')
    assert.throws(() => service.preview('owner'), /overlapping/)
  })
  await test('symlinks and corrupt receipts fail closed', ({ service, root, other }) => {
    fs.symlinkSync(other, path.join(root, 'linked'))
    assert.throws(() => service.preview('owner'), /Linked/)
    fs.unlinkSync(path.join(root, 'linked'))
    fs.writeFileSync(path.join(root, CLEAR_RECEIPT), 'invalid')
    assert.throws(() => service.preview('owner'))
    assert.throws(() => assertWorkspaceRecovered(root))
  })
  await test('active runtime refusal happens before the destructive journal', ({ service, deps, root }) => {
    deps.inspectRuntime = () => { throw new Error('busy') }
    assert.throws(() => service.preview('owner'), /busy/)
    assert(!fs.existsSync(path.join(root, CLEAR_RECEIPT)))
  })
  console.log(`${passed} Personal workspace clear tests passed`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
