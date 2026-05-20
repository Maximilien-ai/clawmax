import fs from 'fs'
import path from 'path'
import {
  type AgentTemplate,
  type OrganizationTemplate,
  type Template,
  getAgentTemplatesDir,
  getOrgTemplatesDir,
  getTemplate,
  listTemplates,
  saveTemplate,
  slugify,
  validateTemplate,
} from './templates'

export type RegistryTemplateType = 'agent' | 'team' | 'company' | 'workflow'
export type RegistryTemplateSource = 'system' | 'user'

export interface TemplateRegistryTemplateEntry {
  title: string
  templateType: RegistryTemplateType
  templateSlug: string
  templateId: string
  templateSource: RegistryTemplateSource
  sourceUrl?: string
  summary?: string
  tags: string[]
  applyCount?: number
  rating?: number
  ratingCount?: number
  metadata?: Record<string, any>
}

export interface TemplateRegistryCatalogResponse {
  registry?: Record<string, any>
  templates: TemplateRegistryTemplateEntry[]
  communitySubmissions: TemplateRegistryTemplateEntry[]
  summary?: Record<string, any>
}

type ParsedGitHubTemplateSource = {
  owner: string
  repo: string
  ref: string
  subpath: string
}

const DEFAULT_TEMPLATE_REGISTRY_URL = 'https://www.clawmax.ai/api/template-registry'
const FALLBACK_TEMPLATE_REGISTRY_URL = 'https://clawmax.ai/api/template-registry'

function normalizeTags(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((value) => String(value || '').trim())
    .filter(Boolean)
}

function normalizeRegistryEntry(input: any, fallbackSource: RegistryTemplateSource): TemplateRegistryTemplateEntry | null {
  const title = String(input?.title || input?.name || '').trim()
  const templateSlug = String(input?.templateSlug || input?.slug || '').trim()
  const templateId = String(input?.templateId || `${fallbackSource}:${templateSlug}`).trim()
  const templateSource = input?.templateSource === 'user' ? 'user' : fallbackSource
  const rawType = String(input?.templateType || input?.type || '').trim().toLowerCase()
  const templateType: RegistryTemplateType =
    rawType === 'agent' || rawType === 'team' || rawType === 'company' || rawType === 'workflow'
      ? rawType
      : 'team'

  if (!title || !templateSlug) return null

  return {
    title,
    templateType,
    templateSlug,
    templateId,
    templateSource,
    sourceUrl: typeof input?.sourceUrl === 'string' ? input.sourceUrl.trim() : undefined,
    summary: typeof input?.summary === 'string' ? input.summary.trim() : undefined,
    tags: normalizeTags(input?.tags || input?.templateTags),
    applyCount: Number.isFinite(Number(input?.applyCount)) ? Number(input.applyCount) : undefined,
    rating: Number.isFinite(Number(input?.rating)) ? Number(input.rating) : undefined,
    ratingCount: Number.isFinite(Number(input?.ratingCount)) ? Number(input.ratingCount) : undefined,
    metadata: input?.metadata && typeof input.metadata === 'object' ? input.metadata : undefined,
  }
}

export function getTemplateRegistryUrl(): string {
  return (process.env.TEMPLATE_REGISTRY_REMOTE_URL || process.env.TEMPLATE_REGISTRY_URL || DEFAULT_TEMPLATE_REGISTRY_URL).trim()
}

export function getTemplateRegistryCandidateUrls(): string[] {
  const configured = (process.env.TEMPLATE_REGISTRY_REMOTE_URL || process.env.TEMPLATE_REGISTRY_URL || '').trim()
  if (configured) return [configured]
  return [DEFAULT_TEMPLATE_REGISTRY_URL, FALLBACK_TEMPLATE_REGISTRY_URL]
}

export function getTemplateRegistryWriteToken(): string {
  return (process.env.TEMPLATE_REGISTRY_WRITE_TOKEN || process.env.TEMPLATE_REGISTRY_TOKEN || '').trim()
}

export function isTemplateRegistryWriteEnabled(): boolean {
  return !!getTemplateRegistryWriteToken()
}

export async function fetchTemplateRegistryCatalog(): Promise<TemplateRegistryCatalogResponse> {
  let lastError: Error | null = null

  for (const url of getTemplateRegistryCandidateUrls()) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const data: any = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Template registry request failed (${response.status})`)
      }

      return {
        registry: data?.registry && typeof data.registry === 'object' ? data.registry : undefined,
        templates: Array.isArray(data?.templates)
          ? data.templates
              .map((entry: any) => normalizeRegistryEntry(entry, 'system'))
              .filter((entry: TemplateRegistryTemplateEntry | null): entry is TemplateRegistryTemplateEntry => !!entry)
          : [],
        communitySubmissions: Array.isArray(data?.communitySubmissions)
          ? data.communitySubmissions
              .map((entry: any) => normalizeRegistryEntry(entry, 'user'))
              .filter((entry: TemplateRegistryTemplateEntry | null): entry is TemplateRegistryTemplateEntry => !!entry)
          : [],
        summary: data?.summary && typeof data.summary === 'object' ? data.summary : undefined,
      }
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err || 'Failed to reach template registry'))
    }
  }

  throw lastError || new Error('Failed to reach template registry')
}

export async function postTemplateRegistryAction(pathname: 'rate' | 'share', payload: Record<string, any>) {
  const token = getTemplateRegistryWriteToken()
  if (!token) {
    throw new Error('Template registry write actions are not configured on this dashboard yet.')
  }

  const response = await fetch(new URL(pathname, `${getTemplateRegistryUrl().replace(/\/+$/, '')}/`).toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  const data: any = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Template registry ${pathname} failed (${response.status})`)
  }
  return data
}

export function parseGitHubTemplateSourceUrl(sourceUrl: string): ParsedGitHubTemplateSource | null {
  const raw = String(sourceUrl || '').trim()
  if (!raw) return null

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  if (parsed.hostname !== 'github.com') return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 5) return null
  const [owner, repo, treeOrBlob, ref, ...rest] = parts
  if (!owner || !repo || (treeOrBlob !== 'tree' && treeOrBlob !== 'blob') || !ref || rest.length === 0) return null

  return {
    owner,
    repo,
    ref,
    subpath: rest.join('/'),
  }
}

export function buildRawGitHubTemplateFileUrl(source: ParsedGitHubTemplateSource, fileName: string): string {
  const normalizedSubpath = source.subpath.replace(/\/+$/, '')
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.ref}/${normalizedSubpath}/${fileName}`
}

async function fetchRawFile(url: string): Promise<string | null> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: '*/*' },
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Failed to fetch template asset (${response.status})`)
  }
  return response.text()
}

function findLocalTemplateBySlugOrName(type: 'agent' | 'organization', slug: string, title: string): Template | null {
  const normalizedSlug = slugify(slug)
  const normalizedTitle = title.trim().toLowerCase()
  return (listTemplates(type) as Array<AgentTemplate | OrganizationTemplate>).find((template) => {
    return template.slug === normalizedSlug || template.name.trim().toLowerCase() === normalizedTitle
  }) || null
}

function templateRegistryTypeToDashboardType(type: RegistryTemplateType): 'agent' | 'organization' | null {
  if (type === 'agent') return 'agent'
  if (type === 'team' || type === 'company') return 'organization'
  return null
}

function writeImportedAgentTemplateFiles(templateDir: string, files: Partial<Record<'IDENTITY.md' | 'SOUL.md' | 'TOOLS.md' | 'TEMPLATE.md', string | null>>) {
  for (const [fileName, content] of Object.entries(files)) {
    if (typeof content !== 'string' || !content.trim()) continue
    fs.writeFileSync(path.join(templateDir, fileName), content, 'utf-8')
  }
}

export async function importTemplateRegistryEntry(input: {
  title: string
  templateSlug: string
  templateType: RegistryTemplateType
  templateId?: string
  templateSource?: RegistryTemplateSource
  sourceUrl: string
}) {
  const dashboardType = templateRegistryTypeToDashboardType(input.templateType)
  if (!dashboardType) {
    throw new Error('Only agent, team, and company templates can be added to local templates right now.')
  }

  const existingTemplate = findLocalTemplateBySlugOrName(dashboardType, input.templateSlug, input.title)
  if (existingTemplate) {
    return {
      ok: true as const,
      alreadyLocal: true as const,
      template: existingTemplate,
      slug: existingTemplate.slug || slugify(existingTemplate.name),
    }
  }

  const parsedSource = parseGitHubTemplateSourceUrl(input.sourceUrl)
  if (!parsedSource) {
    throw new Error('Template source URL must be a GitHub tree/blob URL.')
  }

  const templateJsonText = await fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'template.json'))
  if (!templateJsonText) {
    throw new Error('Template source does not include template.json')
  }

  let template: Template
  try {
    template = JSON.parse(templateJsonText)
  } catch {
    throw new Error('Template source returned invalid template.json')
  }

  if (template.type !== dashboardType) {
    throw new Error(`Template source type mismatch: expected ${dashboardType}, got ${template.type}`)
  }

  const validation = validateTemplate(template)
  if (!validation.valid) {
    throw new Error(validation.errors?.[0] || 'Imported template is invalid')
  }

  const registryMetadata = {
    ...(template as any).metadata,
    registryTemplateId: input.templateId || `${input.templateSource || 'system'}:${input.templateSlug}`,
    registryTemplateSource: input.templateSource || 'system',
    registrySourceUrl: input.sourceUrl,
    basedOnSlug: input.templateSlug,
    basedOnSource: input.templateSource === 'system' ? 'system' : 'workspace',
  }

  const saveResult = saveTemplate({
    ...(template as any),
    metadata: registryMetadata,
  } as Template)
  if (!saveResult.ok || !saveResult.path) {
    throw new Error(saveResult.error || 'Failed to save registry template')
  }

  if (template.type === 'agent') {
    const [identity, soul, tools, templateMd] = await Promise.all([
      fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'IDENTITY.md')),
      fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'SOUL.md')),
      fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'TOOLS.md')),
      fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'TEMPLATE.md')),
    ])
    writeImportedAgentTemplateFiles(saveResult.path, {
      'IDENTITY.md': identity,
      'SOUL.md': soul,
      'TOOLS.md': tools,
      'TEMPLATE.md': templateMd,
    })
  } else {
    const templateMd = await fetchRawFile(buildRawGitHubTemplateFileUrl(parsedSource, 'TEMPLATE.md'))
    if (typeof templateMd === 'string' && templateMd.trim()) {
      fs.writeFileSync(path.join(saveResult.path, 'TEMPLATE.md'), templateMd, 'utf-8')
    }
  }

  const savedTemplate = getTemplate(template.type, slugify(template.name))
  return {
    ok: true as const,
    alreadyLocal: false as const,
    template: savedTemplate || template,
    slug: slugify(template.name),
  }
}

export function templateExistsLocally(entry: {
  title: string
  templateSlug: string
  templateType: RegistryTemplateType
}) {
  const dashboardType = templateRegistryTypeToDashboardType(entry.templateType)
  if (!dashboardType) return false
  return !!findLocalTemplateBySlugOrName(dashboardType, entry.templateSlug, entry.title)
}

export function getLocalTemplateDir(type: 'agent' | 'organization', slug: string): string {
  return type === 'agent'
    ? path.join(getAgentTemplatesDir(), slug)
    : path.join(getOrgTemplatesDir(), slug)
}
