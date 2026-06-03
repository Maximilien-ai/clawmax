import type { OpenClawSkill, SkillInstallOption } from '../types'
import type { RuntimePlatform } from './skillPlatform'

const INSTALL_KIND_PRIORITY: Record<RuntimePlatform, SkillInstallOption['kind'][]> = {
  darwin: ['brew', 'npm', 'pnpm', 'uv', 'go', 'node', 'apt', 'download', 'manual'],
  linux: ['apt', 'npm', 'pnpm', 'uv', 'go', 'node', 'brew', 'download', 'manual'],
  win32: ['npm', 'pnpm', 'uv', 'go', 'node', 'download', 'manual', 'brew', 'apt'],
  unknown: ['brew', 'apt', 'npm', 'pnpm', 'uv', 'go', 'node', 'download', 'manual'],
}

function supportsRuntime(option: SkillInstallOption, runtimePlatform: RuntimePlatform): boolean {
  if (!option.os || option.os.length === 0 || runtimePlatform === 'unknown') return true
  return option.os.includes(runtimePlatform)
}

const HIMALAYA_LINUX_INSTALL_COMMAND = 'curl -sSL https://raw.githubusercontent.com/pimalaya/himalaya/master/install.sh | PREFIX=/usr/local sh'

export function formatDashboardInstallRequirementCommand(
  skill: Pick<OpenClawSkill, 'name'>,
  option: SkillInstallOption,
  runtimePlatform: RuntimePlatform,
): string | null {
  if (runtimePlatform === 'linux' && skill.name === 'himalaya' && option.kind === 'apt' && option.package === 'himalaya') {
    return HIMALAYA_LINUX_INSTALL_COMMAND
  }
  if (option.kind === 'brew' && option.formula) return `brew install ${option.formula.trim()}`
  if (option.kind === 'apt' && option.package) return `apt-get install -y ${option.package.trim()}`
  if (option.kind === 'npm' && option.package) return `npm install -g ${option.package.trim()}`
  if (option.kind === 'pnpm' && option.package) return `pnpm add -g ${option.package.trim()}`
  if (option.kind === 'uv' && option.package) {
    return runtimePlatform === 'linux' || runtimePlatform === 'unknown'
      ? `python3 -m pip install --user ${option.package.trim()}`
      : `uv tool install ${option.package.trim()}`
  }
  if (option.kind === 'go' && (option.module || option.package)) return `go install ${String(option.module || option.package).trim()}`
  if (option.kind === 'node' && option.package) return `npm install -g ${option.package.trim()}`
  return null
}

function requirementSignature(option: SkillInstallOption): string {
  const bins = (option.bins || []).map((bin) => bin.trim()).filter(Boolean).sort()
  if (bins.length > 0) return `bins:${bins.join(',')}`
  return `pkg:${option.formula || option.package || option.module || option.id}`
}

export function getDashboardInstallRequirementCommands(
  skill: Pick<OpenClawSkill, 'install' | 'name'>,
  runtimePlatform: RuntimePlatform
): string[] {
  const priority = INSTALL_KIND_PRIORITY[runtimePlatform] || INSTALL_KIND_PRIORITY.unknown
  const compatibleOptions = (skill.install || [])
    .filter((option) => supportsRuntime(option, runtimePlatform))
    .map((option) => ({
      option,
      command: formatDashboardInstallRequirementCommand(skill, option, runtimePlatform),
      priority: priority.indexOf(option.kind),
    }))
    .filter((entry) => !!entry.command)
    .sort((a, b) => {
      const aPriority = a.priority === -1 ? Number.MAX_SAFE_INTEGER : a.priority
      const bPriority = b.priority === -1 ? Number.MAX_SAFE_INTEGER : b.priority
      return aPriority - bPriority
    })

  const commands: string[] = []
  const seenSignatures = new Set<string>()

  for (const entry of compatibleOptions) {
    const signature = requirementSignature(entry.option)
    if (seenSignatures.has(signature)) continue
    seenSignatures.add(signature)
    commands.push(entry.command!)
  }

  return commands
}
