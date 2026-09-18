import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WorkspaceManager } from './workspace-manager'
import { getWorkspacePath } from './workspace'
import { assertWorkspaceRecovered } from './workspace-recovery-admission'
import { recoverTemplatesBeforeStartup } from './template-startup-recovery'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-quarantine-'))
  const previous = process.env.CLAWMAX_TEST_WORKSPACE
  try {
    const healthy = path.join(root, 'healthy')
    const blocked = path.join(root, 'blocked')
    for (const workspace of [healthy, blocked]) fs.mkdirSync(path.join(workspace, '.clawmax'), { recursive: true })
    const registryFile = path.join(root, 'registry.json')
    fs.writeFileSync(registryFile, JSON.stringify({ version: '1.0', activeWorkspaceId: 'healthy', workspaces: [
      { id: 'healthy', name: 'Healthy', path: healthy, createdAt: '', lastAccessedAt: '' },
      { id: 'blocked', name: 'Blocked', path: blocked, createdAt: '', lastAccessedAt: '' },
    ] }))
    const manager = new WorkspaceManager(registryFile)
    const original = fs.readFileSync(registryFile, 'utf8')
    const unavailable = { async snapshot(): Promise<never> { throw new Error('Unavailable') }, async patch(): Promise<never> { throw new Error('Unexpected mutation') } }
    for (const journal of ['template-transaction.json', 'template-gateway-transaction.json']) {
      const file = path.join(blocked, '.clawmax', journal)
      fs.writeFileSync(file, '{invalid')
      const result = await recoverTemplatesBeforeStartup([
        { id: 'blocked', path: blocked }, { id: 'healthy', path: healthy },
      ], unavailable, path.join(root, 'runtime'), { isolateFailures: true })
      assert.deepEqual(result.blockedWorkspaceIds, ['blocked'])
      assertWorkspaceRecovered(healthy)
      assert.throws(() => assertWorkspaceRecovered(blocked), /Workspace recovery/)
      assert.equal(manager.getWorkspace('healthy')?.path, healthy)
      assert.equal(await manager.withWorkspace('healthy', () => 'available'), 'available')
      assert.throws(() => manager.getWorkspace('blocked'), /Workspace recovery/)
      assert.throws(() => manager.getWorkspaceByPath(blocked), /Workspace recovery/)
      assert.throws(() => manager.resolveWorkspacePath('blocked'), /Workspace recovery/)
      assert.throws(() => manager.setActiveWorkspace('blocked'), /Workspace recovery/)
      assert.throws(() => manager.deleteWorkspace('blocked'), /Workspace recovery/)
      assert.throws(() => manager.createWorkspace('Replace', blocked, { mode: 'overwrite' }), /Workspace recovery/)
      let ran = false
      await assert.rejects(manager.withWorkspace('blocked', () => { ran = true }), /Workspace recovery/)
      assert(!ran)
      assert.equal(manager.listWorkspaces().find(item => item.id === 'blocked')?.recoveryState, 'blocked')
      process.env.CLAWMAX_TEST_WORKSPACE = blocked
      assert.throws(() => getWorkspacePath(), /Workspace recovery/, 'Must not fall back to an unrelated workspace')
      process.env.CLAWMAX_TEST_WORKSPACE = healthy
      assert.equal(getWorkspacePath(), healthy)
      assert.equal(fs.readFileSync(registryFile, 'utf8'), original)
      assert.equal(fs.readFileSync(file, 'utf8'), '{invalid')
      fs.unlinkSync(file)
    }
    const link = path.join(blocked, '.clawmax/template-gateway-transaction.json')
    fs.symlinkSync(path.join(root, 'absent'), link)
    assert.throws(() => assertWorkspaceRecovered(blocked), /Workspace recovery/)
    fs.unlinkSync(link)
    assert.throws(() => assertWorkspaceRecovered(blocked), /Workspace recovery/, 'Failed recovery cannot be cleared by deleting its journal')
    await recoverTemplatesBeforeStartup([{ id: 'blocked', path: blocked }], unavailable, path.join(root, 'runtime'), { isolateFailures: true })
    assert.equal(manager.getWorkspace('blocked')?.path, blocked)
    assert.equal(manager.listWorkspaces().find(item => item.id === 'blocked')?.recoveryState, undefined)
    console.log('workspace-recovery-admission.test.ts: passed')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
