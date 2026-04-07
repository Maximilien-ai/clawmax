import fs from 'fs'
import path from 'path'

export interface PartnerFieldDefinition {
  key: string
  label: string
  type: 'text' | 'password' | 'select'
  required?: boolean
  secret?: boolean
}

export interface PartnerSkillsDefinition {
  mode: 'shipables' | 'curated-installer' | 'planned' | 'catalog'
  items?: string[]
  commandId?: string
  label?: string
}

export interface PartnerValidationDefinition {
  mode: 'live' | 'config' | 'status'
  resultKey?: string
  label?: string
  helperText?: string
}

export interface PartnerDefinition {
  slug: string
  name: string
  logoUrl?: string
  website?: string
  docsUrl?: string
  description: string
  category?: string
  enabledByDefault?: boolean
  fields?: PartnerFieldDefinition[]
  skills?: PartnerSkillsDefinition
  validation?: PartnerValidationDefinition
  content?: string
  sourceRoot?: string
}

const DEFAULT_PARTNERS = ['senso', 'opik', 'github']

function splitList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function getPartnerRoots(): string[] {
  const cwdRoot = path.resolve(process.cwd(), '../../PARTNERS')
  const repoRoot = path.resolve(process.cwd(), 'PARTNERS')
  const extraRoots = splitList(process.env.CLAWMAX_EXTRA_PARTNER_DIRS)
  const roots = [repoRoot, cwdRoot, ...extraRoots.map((root) => path.resolve(root))]
  return Array.from(new Set(roots)).filter((root) => fs.existsSync(root))
}

export function getEnabledPartnerSlugs(): string[] {
  const configured = splitList(process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES)
  return configured.length > 0 ? configured : DEFAULT_PARTNERS
}

export function listPartnerDefinitions(): PartnerDefinition[] {
  const enabled = new Set(getEnabledPartnerSlugs())
  const loaded = new Map<string, PartnerDefinition>()

  for (const root of getPartnerRoots()) {
    const entries = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    for (const entry of entries) {
      const partnerDir = path.join(root, entry.name)
      const jsonPath = path.join(partnerDir, 'partner.json')
      if (!fs.existsSync(jsonPath)) continue

      try {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as PartnerDefinition
        if (!parsed?.slug || !enabled.has(parsed.slug)) continue
        const mdPath = path.join(partnerDir, 'PARTNER.md')
        loaded.set(parsed.slug, {
          ...parsed,
          content: fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf-8') : '',
          sourceRoot: partnerDir,
        })
      } catch {
        continue
      }
    }
  }

  return getEnabledPartnerSlugs()
    .map((slug) => loaded.get(slug))
    .filter((partner): partner is PartnerDefinition => !!partner)
}
