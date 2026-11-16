import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hasAgentDirectory } from './agent-directory'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-directory-'))
try {
  fs.mkdirSync(path.join(root, 'valid-agent'))
  fs.writeFileSync(path.join(root, 'not-a-directory'), '')
  fs.symlinkSync(path.join(root, 'valid-agent'), path.join(root, 'linked-agent'))
  assert(hasAgentDirectory(root, 'valid-agent'))
  for (const id of ['../valid-agent', '/valid-agent', 'valid-agent/../valid-agent', 'missing', 'not-a-directory', 'linked-agent', '']) {
    assert(!hasAgentDirectory(root, id), 'Only real agent directories under the trusted root qualify')
  }
  assert(!hasAgentDirectory(path.join(root, 'absent-root'), 'valid-agent'))
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
