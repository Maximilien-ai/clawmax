import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { repairWorkspaceAgentRegistrations } from './workspace-agent-registration'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-registration-'))
  try {
    const inspected: string[] = []
    const registered: string[] = []
    const skipped: string[] = []
    const options = {
      workspacePath: root, registeredIds: new Set(['existing']),
      isManaged: (workspace: string) => { inspected.push(path.basename(workspace)); return path.basename(workspace) !== 'unmanaged' },
      register: async (id: string, workspace: string) => {
        assert.equal(workspace, path.join(root, 'AGENTS', id))
        if (id === 'broken') throw new Error('Synthetic registration failure')
        registered.push(id)
      },
      skipped: (id: string, error: unknown) => { assert(error instanceof Error); skipped.push(id) },
    }
    assert.equal(await repairWorkspaceAgentRegistrations(options), 0)
    const reserved = 'tr-0123456789abcdef-agent-0123456789ab'
    for (const id of [reserved, 'existing', 'legacy', 'broken', 'unmanaged', '.hidden', 'archive']) {
      fs.mkdirSync(path.join(root, 'AGENTS', id), { recursive: true })
    }
    fs.writeFileSync(path.join(root, 'AGENTS', 'ordinary-file'), 'not an agent')
    fs.symlinkSync(path.join(root, 'AGENTS', 'legacy'), path.join(root, 'AGENTS', 'linked-agent'))
    // No Template metadata is needed: removing metadata cannot enable repair.
    assert.equal(await repairWorkspaceAgentRegistrations(options), 1)
    assert.deepEqual(registered, ['legacy'])
    assert(!inspected.includes(reserved), 'Reserved IDs must be rejected before callbacks')
    assert.deepEqual(new Set(skipped), new Set(['broken', reserved]))
    assert.deepEqual(new Set(inspected), new Set(['broken', 'legacy', 'unmanaged']))
    // A subsequent startup remains blocked; existing registrations are untouched.
    options.registeredIds.add('legacy')
    registered.length = 0
    assert.equal(await repairWorkspaceAgentRegistrations(options), 0)
    assert.deepEqual(registered, [])
    console.log('Workspace agent registration admission tests passed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
