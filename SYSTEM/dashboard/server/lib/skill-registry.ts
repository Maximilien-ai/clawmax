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
      description: 'Search and install Tessl registry skills for OpenClaw/Codex workflows.',
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
    const results = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.results)
        ? parsed.results
        : Array.isArray(parsed?.items)
          ? parsed.items
          : Array.isArray(parsed?.skills)
            ? parsed.skills
            : []

    const normalized = results.map((item: any) => ({
      name: item?.name || item?.tile || item?.id || item?.slug,
      full_name: item?.full_name || item?.name || item?.tile || item?.id || item?.slug,
      description: item?.description || item?.summary || '',
      latest_version: item?.latest_version || item?.version,
      downloads_weekly: item?.downloads_weekly || item?.downloads || item?.installs,
      categories: item?.categories || item?.tags || [],
      raw: item,
    })).filter((item: any) => item.name)

    return {
      results: normalized,
      total: parsed?.total || parsed?.pagination?.total || normalized.length,
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
        args: ['@tessl/cli@latest', 'install', name, '--agent', 'openclaw', '--agent', 'codex', '--yes'],
        timeout: 45000,
      },
      {
        command: 'tessl',
        args: ['install', name, '--agent', 'openclaw', '--agent', 'codex', '--yes'],
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
