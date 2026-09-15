import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { Writable } from 'stream'
import { streamZipExport } from './zip-export'
import { WORKSPACE_EXPORT_SECRET_GLOBS } from './workspace-export'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-export-test-'))
  try {
    const source = path.join(root, 'source')
    fs.mkdirSync(path.join(source, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(source, 'IDENTITY.md'), '# Synthetic agent\n')
    fs.writeFileSync(path.join(source, 'SYSTEM', 'integrations.secrets.json'), 'synthetic-secret')
    const agentZip = path.join(root, 'agent.zip')
    await streamZipExport(fs.createWriteStream(agentZip), archive => {
      archive.directory(source, 'agent')
      archive.append('{}', { name: 'agent/clawmax-export.json' })
    })
    assert.equal(execFileSync('unzip', ['-p', agentZip, 'agent/IDENTITY.md'], { encoding: 'utf8' }), '# Synthetic agent\n')
    assert.equal(execFileSync('unzip', ['-p', agentZip, 'agent/clawmax-export.json'], { encoding: 'utf8' }), '{}')
    const workspaceZip = path.join(root, 'workspace.zip')
    await streamZipExport(fs.createWriteStream(workspaceZip), archive => {
      archive.glob('**/*', { cwd: source, dot: true, ignore: [...WORKSPACE_EXPORT_SECRET_GLOBS] }, { prefix: 'workspace' })
    })
    const entries = execFileSync('unzip', ['-Z1', workspaceZip], { encoding: 'utf8' })
    assert(entries.includes('workspace/IDENTITY.md'))
    assert(!entries.includes('integrations.secrets.json'))
    await assert.rejects(streamZipExport(new Writable({ write(_chunk, _encoding, callback) { callback(new Error('disconnected')) } }), archive => {
      archive.append('test', { name: 'test.txt' })
    }), /disconnected/)
    await assert.rejects(streamZipExport(new Writable({ write(_chunk, _encoding, callback) { callback() } }), () => {
      throw new Error('populate failed')
    }), /populate failed/)
    console.log('PASS: ZIP contents, workspace exclusions, disconnect, population failure')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
