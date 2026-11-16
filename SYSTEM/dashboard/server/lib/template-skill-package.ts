import fs from 'fs'
import path from 'path'
import { PortableTemplate, sha256 } from './portable-template'
import { PortableTemplateError } from './portable-template-zip'
import { TemplateAuthorityEvidence } from './template-authority'
import { templateStoragePath } from './template-storage-path'
import { WorkspaceFileMutation } from './workspace-file-transaction'

const fail = (message: string): never => { throw new PortableTemplateError('template_skill_unavailable', message, 409) }
const safeSkillFile = (relative: string) => relative.split('/').every(part => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '..')

export interface PackagedTemplateSkills { root: string; version: string }

/** Pin the complete host-owned package, not only its instructions file. */
export function describePackagedTemplateSkill(source: PackagedTemplateSkills, name: string) {
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(name) || !path.isAbsolute(source.root)) fail('Packaged Skill identity is unsafe')
  const directory = path.join(source.root, name)
  try {
    if (!fs.lstatSync(directory).isDirectory()) return fail('Packaged Skill is unavailable')
    const files: Array<[string, Buffer]> = []
    const visit = (relative: string) => {
      for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
        const next = relative ? `${relative}/${entry.name}` : entry.name
        if (!safeSkillFile(next) || entry.isSymbolicLink()) return fail('Packaged Skill inventory is unsafe')
        if (entry.isDirectory()) visit(next)
        else if (entry.isFile()) {
          if (files.length >= 128) return fail('Packaged Skill inventory is too large')
          const bytes = fs.readFileSync(path.join(directory, next))
          if (bytes.length > 16 * 1024 * 1024) return fail('Packaged Skill file is too large')
          files.push([next, bytes])
        } else return fail('Packaged Skill inventory is unsafe')
      }
    }
    visit('')
    const instructions = files.find(([relative]) => relative === 'SKILL.md')?.[1]
    if (!instructions) return fail('Packaged Skill instructions are missing')
    const packageSha256 = sha256(Buffer.concat(files.sort(([a], [b]) => a.localeCompare(b)).flatMap(([relative, bytes]) => [Buffer.from(`${relative}\0`), bytes])))
    return { sha256: sha256(instructions), packageSha256 }
  } catch (error) {
    if (error instanceof PortableTemplateError) throw error
    return fail('Packaged Skill is unavailable')
  }
}

/** Verify bundle-pinned Skill bytes without executing them. Only authority-
 * selected packages become revision-owned workspace files. Runtime admission
 * and token delivery remain separate and blocked for staged Templates. */
export function compileTemplateSkillMutations(bundle: PortableTemplate, authority: TemplateAuthorityEvidence, workspacePath: string, packaged?: PackagedTemplateSkills): WorkspaceFileMutation[] {
  const installed = new Map<string, string>()
  const mutations: WorkspaceFileMutation[] = []
  for (const agent of bundle.artifacts.filter(item => item.kind === 'agent')) {
    const binding = authority.bindings.find(item => item.artifactId === agent.id)
    if (!binding) return fail('Skill authority binding is missing')
    const requested = new Set<string>(agent.definition.skills)
    const archives = agent.files || new Map<string, Buffer>()
    const allSkillPaths = [...archives.keys()].filter(file => file.startsWith('content/skills/'))
    for (const file of allSkillPaths) {
      const name = file.split('/')[2]
      if (!requested.has(name)) fail('Embedded Skill is not requested by its Agent')
    }
    for (const skill of binding.skills) {
      if (skill.platform !== binding.runtime.platform || !['linux/amd64', 'linux/arm64'].includes(skill.platform)) fail('Skill platform does not match its admitted runtime')
      if (skill.source === 'packaged') {
        if (!packaged) return fail('Packaged Skill source is unavailable')
        if (skill.version !== packaged.version || !skill.packageSha256) fail('Packaged Skill version is unavailable or mismatched')
        if ([...archives.keys()].some(file => file.startsWith(`content/skills/${skill.name}/`))) fail('Packaged Skill must not also be embedded')
        const identity = describePackagedTemplateSkill(packaged, skill.name)
        if (identity.sha256 !== skill.sha256 || identity.packageSha256 !== skill.packageSha256) fail('Packaged Skill checksum does not match authority')
        continue
      }
      const prefix = `content/skills/${skill.name}/`
      const files = [...archives.entries()].filter(([file]) => file.startsWith(prefix)).map(([file, bytes]) => [file.slice(prefix.length), bytes] as const)
      if (!files.length || files.some(([relative, bytes]) => !safeSkillFile(relative) || bytes.length > 16 * 1024 * 1024)) fail('Embedded Skill inventory is unsafe or oversized')
      const content = new Map(files)
      const instructions = content.get('SKILL.md')
      const sums = content.get('SHA256SUMS')
      const version = content.get('VERSION')
      if (!instructions || !sums || !version || sha256(instructions) !== skill.sha256 || !version.toString('utf8').trim()) return fail('Embedded Skill identity or required files do not match authority')
      const checksums = new Map<string, string>()
      for (const line of sums.toString('utf8').trim().split('\n')) {
        const match = line.match(/^([a-f0-9]{64})  \*?([A-Za-z0-9][A-Za-z0-9._/-]*)$/)
        if (!match || !safeSkillFile(match[2]) || checksums.has(match[2])) return fail('Embedded Skill checksum manifest is invalid')
        checksums.set(match[2], match[1])
      }
      // License text is pinned by the portable Agent manifest, but is not an
      // executable payload and is commonly omitted from a Skill's SHA256SUMS.
      const payloadPaths = files.map(([relative]) => relative).filter(relative => !['SKILL.md', 'SHA256SUMS', 'VERSION', 'LICENSE'].includes(relative))
      if (checksums.size !== payloadPaths.length || payloadPaths.some(relative => checksums.get(relative) !== sha256(content.get(relative)!))) fail('Embedded Skill checksum inventory does not match its files')
      const machine = skill.platform === 'linux/arm64' ? 183 : 62
      for (const [relative, bytes] of files) {
        if (!relative.startsWith('bin/') || bytes.subarray(0, 4).toString('hex') !== '7f454c46') continue
        if (bytes.length < 20 || bytes[4] !== 2 || bytes[5] !== 1 || bytes.readUInt16LE(18) !== machine) fail('Embedded Skill executable is not for the admitted platform')
      }
      const packageDigest = sha256(Buffer.concat(files.sort(([left], [right]) => left.localeCompare(right)).flatMap(([relative, bytes]) => [Buffer.from(relative), bytes])))
      if (installed.has(skill.name)) {
        if (installed.get(skill.name) !== packageDigest) fail('Agents request conflicting copies of one Skill')
        continue
      }
      installed.set(skill.name, packageDigest)
      if (fs.existsSync(templateStoragePath(workspacePath, `SKILLS/custom/${skill.name}`))) fail('An installed Skill already occupies the requested name')
      for (const [relative, bytes] of files) mutations.push({ path: `SKILLS/custom/${skill.name}/${relative}`, expectedSha256: null, content: bytes, mode: relative.startsWith('bin/') ? 0o700 : 0o600 })
    }
  }
  return mutations
}
