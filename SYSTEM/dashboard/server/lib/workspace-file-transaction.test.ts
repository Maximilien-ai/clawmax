import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { commitWorkspaceFiles, recoverWorkspaceFileTransaction } from './workspace-file-transaction'
import { sha256 } from './portable-template'

const mutations = [
  { path: 'AGENTS/fixture/IDENTITY.md', expectedSha256: null, content: '# Synthetic agent' },
  { path: 'ORG/GROUPS.md', expectedSha256: sha256('original'), content: 'changed' },
]
if (process.argv[2] === '--crash') {
  commitWorkspaceFiles(process.argv[3], mutations, () => process.exit(77))
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-transaction-'))
  try {
    fs.mkdirSync(path.join(root, 'ORG'))
    fs.writeFileSync(path.join(root, 'ORG', 'GROUPS.md'), 'original')
    fs.writeFileSync(path.join(root, 'ORG', 'unrelated.md'), 'preserve')
    assert.throws(() => commitWorkspaceFiles(root, mutations, () => { throw new Error('synthetic write failure') }), /synthetic write failure/)
    assert(!fs.existsSync(path.join(root, mutations[0].path)))
    assert.equal(fs.readFileSync(path.join(root, mutations[1].path), 'utf8'), 'original')
    const child = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', __filename, '--crash', root], { encoding: 'utf8', timeout: 15_000 })
    assert.equal(child.status, 77, child.stderr)
    assert(fs.existsSync(path.join(root, mutations[0].path)), 'Crash must leave a partial write for recovery to handle')
    recoverWorkspaceFileTransaction(root)
    assert(!fs.existsSync(path.join(root, mutations[0].path)))
    assert.equal(fs.readFileSync(path.join(root, mutations[1].path), 'utf8'), 'original')
    commitWorkspaceFiles(root, mutations)
    assert.equal(fs.readFileSync(path.join(root, mutations[0].path), 'utf8'), '# Synthetic agent')
    assert.equal(fs.readFileSync(path.join(root, mutations[1].path), 'utf8'), 'changed')
    assert.throws(() => commitWorkspaceFiles(root, mutations), /changed after planning/)
    assert.equal(fs.readFileSync(path.join(root, 'ORG', 'unrelated.md'), 'utf8'), 'preserve')
    assert.throws(() => commitWorkspaceFiles(root, [{ path: 'ORG/../../outside', expectedSha256: null, content: 'bad' }]), /Unsafe resource path/)
    fs.symlinkSync(os.tmpdir(), path.join(root, 'ORG', 'link'))
    assert.throws(() => commitWorkspaceFiles(root, [{ path: 'ORG/link/outside', expectedSha256: null, content: 'bad' }]), /symbolic links/)
    commitWorkspaceFiles(root, [{ path: mutations[0].path, expectedSha256: sha256('# Synthetic agent'), content: null }])
    assert(!fs.existsSync(path.join(root, mutations[0].path)))
    fs.writeFileSync(path.join(root, mutations[1].path), 'original')
    const conflictingCrash = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', __filename, '--crash', root], { encoding: 'utf8', timeout: 15_000 })
    assert.equal(conflictingCrash.status, 77)
    fs.writeFileSync(path.join(root, mutations[0].path), 'external edit')
    assert.throws(() => recoverWorkspaceFileTransaction(root), /changed outside/)
    assert.equal(fs.readFileSync(path.join(root, mutations[0].path), 'utf8'), 'external edit')
    console.log('workspace-file-transaction.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
