import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { listTemplateHostCredentialRequirements } from './template-agent-auth'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-auth-projection-'))
try {
  assert.deepEqual(listTemplateHostCredentialRequirements(root), [])
  const file = path.join(root, 'TEMPLATE_AUTHORITY.json')
  fs.writeFileSync(file, JSON.stringify({ credentials: [{ name: 'MAXIMILIEN_ACCESS_TOKEN', reference: 'private-reference' }] }))
  assert.deepEqual(listTemplateHostCredentialRequirements(root), ['MAXIMILIEN_ACCESS_TOKEN'])
  fs.writeFileSync(file, JSON.stringify({ credentials: [{ name: 'OTHER_TOKEN' }] }))
  assert.deepEqual(listTemplateHostCredentialRequirements(root), ['OTHER_TOKEN'])
  fs.unlinkSync(file)
  const target = path.join(root, 'target')
  fs.writeFileSync(target, JSON.stringify({ credentials: [{ name: 'MAXIMILIEN_ACCESS_TOKEN' }] }))
  fs.symlinkSync(target, file)
  assert.deepEqual(listTemplateHostCredentialRequirements(root), [], 'Authority symlink must not be followed')
  console.log('template-agent-auth.test.ts: passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
