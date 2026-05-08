import fs from 'fs'
import path from 'path'

export type SkillRegistryProvider = 'shipables' | 'tessl'

export function normalizeSkillRegistryProvider(input?: string): SkillRegistryProvider {
  return input === 'tessl' ? 'tessl' : 'shipables'
}

export function getSkillRegistryProviderMeta(provider: SkillRegistryProvider) {
  if (provider === 'tessl') {
    return {
      id: 'tessl' as const,
      label: 'Tessl',
      homepage: 'https://docs.tessl.io/use',
      description: 'Search and install Tessl registry skills for OpenClaw workflows.',
    }
  }

  return {
    id: 'shipables' as const,
    label: 'Shipables',
    homepage: 'https://shipables.dev',
    description: 'Search and install skills from Shipables.dev.',
  }
}

export function normalizeSkillRegistrySearchResults(provider: SkillRegistryProvider, parsed: any): {
  results: any[]
  total?: number
  pagination?: any
} {
  if (provider === 'tessl') {
    const extractQualifiedTileName = (item: any): string | undefined => {
      const directCandidates = [
        item?.full_name,
        item?.fullName,
        item?.registry_name,
        item?.packageName,
        item?.package_name,
        item?.purl,
        item?.source,
        item?.name,
        item?.tile,
        item?.tileName,
        item?.id,
        item?.slug,
      ].filter(Boolean)

      for (const candidate of directCandidates) {
        const value = String(candidate).trim()
        if (/^[a-z0-9._-]+\/[a-z0-9._-]+(?:@[a-z0-9._.-]+)?$/i.test(value)) {
          return value
        }
      }

      const commandCandidates = [
        item?.installCommand,
        item?.install_command,
        item?.command,
      ].filter(Boolean)
      for (const candidate of commandCandidates) {
        const match = String(candidate).match(/\b([a-z0-9._-]+\/[a-z0-9._-]+(?:@[a-z0-9._.-]+)?)\b/i)
        if (match) return match[1]
      }

      if ((item?.workspace || item?.workspaceName) && (item?.tile || item?.tileName || item?.name)) {
        return `${item.workspace || item.workspaceName}/${item.tile || item.tileName || item.name}`
      }

      return undefined
    }

    const results = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed?.items)
          ? parsed.items
          : Array.isArray(parsed?.skills)
            ? parsed.skills
            : []

    const filteredResults = results.filter((item: any) => {
      const type = String(item?.type || '').trim().toLowerCase()
      return !type || type === 'tile' || type === 'tile-skill'
    })

    const normalized = filteredResults.map((item: any) => ({
      name: item?.name || item?.tile || item?.tileName || item?.id || item?.slug,
      full_name: extractQualifiedTileName(item) || item?.fullName || item?.name || item?.tile || item?.tileName || item?.id || item?.slug,
      install_name: extractQualifiedTileName(item),
      description: item?.description || item?.summary || '',
      latest_version: item?.latest_version || item?.latestVersion || item?.version,
      downloads_weekly: item?.downloads_weekly || item?.downloads || item?.installs,
      categories: item?.categories || item?.tags || [],
      result_type: item?.type,
      raw: item,
    })).filter((item: any) => item.name)

    const deduped = new Map<string, any>()
    for (const item of normalized) {
      const key = item.install_name || item.full_name || item.name
      const current = deduped.get(key)
      if (!current) {
        deduped.set(key, item)
        continue
      }

      const currentPriority = current.result_type === 'tile' ? 2 : current.result_type === 'tile-skill' ? 1 : 0
      const nextPriority = item.result_type === 'tile' ? 2 : item.result_type === 'tile-skill' ? 1 : 0
      if (nextPriority > currentPriority) {
        deduped.set(key, item)
      }
    }

    return {
      results: Array.from(deduped.values()),
      total: parsed?.total || parsed?.pagination?.total || deduped.size,
      pagination: parsed?.pagination,
    }
  }

  const results = Array.isArray(parsed) ? parsed : (parsed?.skills || [])
  return {
    results,
    total: parsed?.pagination?.total,
    pagination: parsed?.pagination,
  }
}

export function selectBestRegistryInstallName(
  provider: SkillRegistryProvider,
  requestedName: string,
  results: Array<{ name?: string; full_name?: string; install_name?: string }>
): string {
  if (provider !== 'tessl') return requestedName

  if (/^[a-z0-9._-]+\/[a-z0-9._-]+(?:@[a-z0-9._.-]+)?$/i.test(requestedName)) {
    return requestedName
  }

  const normalized = requestedName.trim().toLowerCase()
  const exactMatch = results.find((item) => {
    const candidates = [item.install_name, item.full_name, item.name]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase())
    return candidates.includes(normalized)
  })
  if (exactMatch?.install_name) return exactMatch.install_name

  const suffixMatch = results.find((item) => {
    const installName = String(item.install_name || '').trim().toLowerCase()
    const shortName = String(item.name || '').trim().toLowerCase()
    return shortName === normalized || installName.endsWith(`/${normalized}`) || installName.endsWith(`/${normalized}@latest`)
  })
  if (suffixMatch?.install_name) return suffixMatch.install_name

  return requestedName
}

export function buildSkillRegistrySearchCommands(provider: SkillRegistryProvider, query: string, limit: number) {
  if (provider === 'tessl') {
    return [
      {
        command: 'npx',
        args: ['@tessl/cli@latest', 'search', query || '', '--type', 'skills', '--json'],
        timeout: 20000,
      },
      {
        command: 'tessl',
        args: ['search', query || '', '--type', 'skills', '--json'],
        timeout: 20000,
      },
    ]
  }

  return [
    {
      command: 'npx',
      args: ['@senso-ai/shipables', 'search', query || '', '--limit', String(limit), '--json'],
      timeout: 15000,
    },
  ]
}

export function buildSkillRegistryInstallCommands(provider: SkillRegistryProvider, name: string) {
  if (provider === 'tessl') {
    return [
      {
        command: 'npx',
        args: ['@tessl/cli@latest', 'install', name, '--agent', 'openclaw', '--yes'],
        timeout: 45000,
      },
      {
        command: 'tessl',
        args: ['install', name, '--agent', 'openclaw', '--yes'],
        timeout: 45000,
      },
    ]
  }

  return [
    {
      command: 'npx',
      args: ['@senso-ai/shipables', 'install', name, '--yes'],
      timeout: 30000,
    },
  ]
}

export function discoverInstalledRegistrySkillDirs(provider: SkillRegistryProvider, tmpDir: string): string[] {
  if (provider === 'tessl') {
    const candidates = [
      path.join(tmpDir, '.codex', 'skills'),
      path.join(tmpDir, 'skills'),
      path.join(tmpDir, '.openclaw', 'skills'),
    ]

    const discovered: string[] = []
    for (const skillsDir of candidates) {
      if (!fs.existsSync(skillsDir)) continue
      const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => path.join(skillsDir, entry.name))
      discovered.push(...dirs)
    }

    const tesslTilesRoot = path.join(tmpDir, '.tessl', 'tiles')
    if (fs.existsSync(tesslTilesRoot)) {
      const workspaceDirs = fs.readdirSync(tesslTilesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => path.join(tesslTilesRoot, entry.name))

      for (const workspaceDir of workspaceDirs) {
        const tileDirs = fs.readdirSync(workspaceDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .map((entry) => path.join(workspaceDir, entry.name))
        discovered.push(...tileDirs)
      }
    }

    return Array.from(new Set(discovered))
  }

  const claudeSkillsDir = path.join(tmpDir, '.claude', 'skills')
  let skillDirs: string[] = []

  if (fs.existsSync(claudeSkillsDir)) {
    skillDirs = fs.readdirSync(claudeSkillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => path.join(claudeSkillsDir, d.name))
  }

  if (skillDirs.length === 0) {
    const topDirs = fs.readdirSync(tmpDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    for (const d of topDirs) {
      const sub = path.join(tmpDir, d.name)
      if (fs.existsSync(path.join(sub, 'SKILL.md')) || fs.existsSync(path.join(sub, 'skill.md'))) {
        skillDirs.push(sub)
      }
    }
    if (fs.existsSync(path.join(tmpDir, 'SKILL.md')) || fs.existsSync(path.join(tmpDir, 'skill.md'))) {
      skillDirs.push(tmpDir)
    }
  }

  return skillDirs
}

export function resolveImportableRegistrySkillDirs(provider: SkillRegistryProvider, skillDirs: string[]): string[] {
  if (provider !== 'tessl') {
    return Array.from(new Set(skillDirs))
  }

  const resolved: string[] = []

  for (const skillDir of skillDirs) {
    const directSkillMd = ['SKILL.md', 'skill.md'].some((file) => fs.existsSync(path.join(skillDir, file)))
    if (directSkillMd) {
      resolved.push(skillDir)
      continue
    }

    const tileJsonPath = path.join(skillDir, 'tile.json')
    if (!fs.existsSync(tileJsonPath)) continue

    try {
      const tileJson = JSON.parse(fs.readFileSync(tileJsonPath, 'utf-8'))
      const skills = tileJson?.skills && typeof tileJson.skills === 'object' ? Object.values(tileJson.skills) as Array<any> : []
      for (const entry of skills) {
        const relativeSkillPath = entry?.path
        if (!relativeSkillPath || typeof relativeSkillPath !== 'string') continue
        const nestedDir = path.dirname(path.join(skillDir, relativeSkillPath))
        const nestedHasSkillMd = ['SKILL.md', 'skill.md'].some((file) => fs.existsSync(path.join(nestedDir, file)))
        if (nestedHasSkillMd) {
          resolved.push(nestedDir)
        }
      }
    } catch {
      // Ignore malformed tile manifests and let caller surface unsupported format if nothing usable is found.
    }
  }

  return Array.from(new Set(resolved))
}

export function parseRegistryJsonOutput(raw: string): any {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return {}

  try {
    return JSON.parse(trimmed)
  } catch {
    const objectStart = trimmed.indexOf('{')
    const arrayStart = trimmed.indexOf('[')
    const start = [objectStart, arrayStart].filter((index) => index >= 0).sort((a, b) => a - b)[0]
    if (start === undefined) {
      throw new Error('Registry command did not return JSON')
    }
    return JSON.parse(trimmed.slice(start))
  }
}

export function getTesslInstallBlockerMessage(raw: string): string | null {
  const text = String(raw || '')
  if (!text) return null

  if (text.includes('Skipped ') && text.includes('due to security review')) {
    return 'Tessl blocked this skill behind a security review. Review the skill in Tessl or rerun with an explicit security bypass if you trust it.'
  }

  if (text.includes('--dangerously-ignore-security') || text.includes('Security  Risky')) {
    return 'Tessl requires an explicit security bypass before installing this skill. Review the tile and use Tessl security bypass only if you trust it.'
  }

  return null
}
