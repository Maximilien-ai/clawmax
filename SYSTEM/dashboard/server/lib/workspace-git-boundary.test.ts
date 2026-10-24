/**
 * The workspace is a git repository the dashboard commits to on every document save, and git runs what
 * `.git/config` names. No upload, document write or document ZIP may put anything into a `.git` folder,
 * whether named directly, in another letter case, or reached through a link.
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-git-boundary.test.ts
 */
import assert from 'assert'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-git-boundary-'))
const workspace = path.join(root, 'workspace')
const home = path.join(root, 'home')
for (const dir of [path.join(workspace, 'AGENTS', 'real-agent'), path.join(workspace, 'ORG'), home]) {
  fs.mkdirSync(dir, { recursive: true })
}

// CLAWMAX_TEST_WORKSPACE wins over SYSTEM/dashboard/.env, so nothing here can reach a real workspace.
const originalEnv = { ...process.env }
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.OPENCLAW_WORKSPACE = workspace
process.env.HOME = home
process.env.OPENCLAW_GATEWAY_PORT = '9'

let passed = 0
let failed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (error: any) {
    failed++
    console.error(`✗ ${name}\n  ${error?.message || error}`)
  }
}

async function run() {
  await test('nothing may be written into the workspace .git folder, which git runs commands from', () => {
    const { writeWorkspaceBinaryFile } = require('./workspace')
    for (const relPath of ['.git/config', '.GIT/config', 'AGENTS/real-agent/.git/hooks/pre-commit']) {
      assert.strictEqual(writeWorkspaceBinaryFile(relPath, Buffer.from('[filter "p"]\n\tclean = touch /tmp/x\n'), workspace), false, `${relPath} must be refused`)
    }
    assert(!fs.existsSync(path.join(workspace, '.git')), 'No .git folder may be created')
    assert.strictEqual(writeWorkspaceBinaryFile('ORG/notes.txt', Buffer.from('ok'), workspace), true, 'Ordinary files are still written')
    // The workspace is a repository; a link to its .git (planted by an agent, say) is no way in either.
    fs.mkdirSync(path.join(workspace, '.git'))
    fs.symlinkSync(path.join(workspace, '.git'), path.join(workspace, 'ORG', 'linked'))
    assert.strictEqual(writeWorkspaceBinaryFile('ORG/linked/config', Buffer.from('x'), workspace), false, 'A write through a link into .git must be refused')
    assert(!fs.existsSync(path.join(workspace, '.git', 'config')), 'Nothing may land in .git')
    fs.rmSync(path.join(workspace, 'ORG', 'linked'))
    fs.rmSync(path.join(workspace, '.git'), { recursive: true })
  })

  await test('a document ZIP that carries a .git folder is refused before anything is extracted', () => {
    const { extractZipBufferToWorkspace } = require('./workspace')
    const zipPath = path.join(root, 'with-git.zip')
    execFileSync('python3', ['-c', [
      'import sys, zipfile',
      'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
      '    zf.writestr(".git/config", "[filter \\"p\\"]\\n\\tclean = touch /tmp/x\\n")',
      '    zf.writestr(".gitattributes", "*.md filter=p\\n")',
      '    zf.writestr("notes.md", "# Notes\\n")',
    ].join('\n'), zipPath])
    const result = extractZipBufferToWorkspace('.', fs.readFileSync(zipPath), workspace)
    assert.strictEqual(result.ok, false, 'Expected the archive to be refused')
    assert(/\.git/.test(result.error || ''), `Expected the refusal to name .git, got ${result.error}`)
    assert(!fs.existsSync(path.join(workspace, '.git')) && !fs.existsSync(path.join(workspace, 'notes.md')), 'Nothing from the archive may land')
  })
}

run()
  .catch((error) => { failed++; console.error(error) })
  .finally(() => {
    process.env = originalEnv
    fs.rmSync(root, { recursive: true, force: true })
    console.log(`\nworkspace-git-boundary.test.ts: ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
    process.exit(0)
  })
