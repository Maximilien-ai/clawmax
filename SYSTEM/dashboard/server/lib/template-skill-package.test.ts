import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PortableTemplate, sha256 } from './portable-template'
import { TemplateAuthorityEvidence } from './template-authority'
import { compileTemplateSkillMutations } from './template-skill-package'
import { commitWorkspaceFiles } from './workspace-file-transaction'

const skill = Buffer.from('# Maximilien\n')
const binary = Buffer.alloc(24)
binary.write('7f454c46', 0, 'hex')
binary[4] = 2
binary[5] = 1
binary.writeUInt16LE(183, 18)
const files = new Map<string, Buffer>([
  ['content/skills/maximilien/SKILL.md', skill],
  ['content/skills/maximilien/VERSION', Buffer.from('0.8.0-dev\n')],
  ['content/skills/maximilien/SHA256SUMS', Buffer.from(`${sha256(binary)}  bin/maximilien\n`)],
  ['content/skills/maximilien/bin/maximilien', binary],
])
const bundle = { artifacts: [{ kind: 'agent', id: 'collector', definition: { skills: ['maximilien'] }, files }] } as unknown as PortableTemplate
const authority = { registryRevision: 'one', workspaceId: 'isolated', bindings: [{ artifactId: 'collector', runtime: { platform: 'linux/arm64' }, skills: [{ name: 'maximilien', sha256: sha256(skill), platform: 'linux/arm64' }] }] } as TemplateAuthorityEvidence
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-template-skill-'))
try {
  const mutations = compileTemplateSkillMutations(bundle, authority, root)
  assert.equal(mutations.length, 4)
  assert(!fs.existsSync(path.join(root, 'SKILLS')), 'Planning must not install Skill bytes')
  assert.throws(() => compileTemplateSkillMutations(bundle, { ...authority, bindings: [{ ...authority.bindings[0], skills: [{ ...authority.bindings[0].skills[0], sha256: '0'.repeat(64) }] }] }, root), /identity/)
  const wrongPlatform = structuredClone(bundle)
  wrongPlatform.artifacts[0].files!.set('content/skills/maximilien/bin/maximilien', Buffer.from(binary))
  wrongPlatform.artifacts[0].files!.get('content/skills/maximilien/bin/maximilien')!.writeUInt16LE(62, 18)
  const altered = wrongPlatform.artifacts[0].files!.get('content/skills/maximilien/bin/maximilien')!
  wrongPlatform.artifacts[0].files!.set('content/skills/maximilien/SHA256SUMS', Buffer.from(`${sha256(altered)}  bin/maximilien\n`))
  assert.throws(() => compileTemplateSkillMutations(wrongPlatform, authority, root), /platform/)
  assert.throws(() => commitWorkspaceFiles(root, mutations, index => { if (index === 1) throw new Error('interrupted') }), /interrupted/)
  assert(!fs.existsSync(path.join(root, 'SKILLS/custom/maximilien/SKILL.md')), 'Interrupted install must roll back')
  commitWorkspaceFiles(root, mutations)
  assert.deepEqual(fs.readFileSync(path.join(root, 'SKILLS/custom/maximilien/bin/maximilien')), binary)
  assert.equal(fs.statSync(path.join(root, 'SKILLS/custom/maximilien/bin/maximilien')).mode & 0o777, 0o700)
  assert.throws(() => compileTemplateSkillMutations(bundle, authority, root), /occupies/)
  console.log('template-skill-package.test.ts: passed')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
