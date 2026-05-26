export type ProductIconName =
  | 'default'
  | 'skill'
  | 'template'
  | 'workflow'
  | 'details'
  | 'status'
  | 'edit'
  | 'clone'
  | 'docs'
  | 'save'
  | 'export'
  | 'restart'
  | 'doctor'
  | 'rename'
  | 'budget'
  | 'whatsapp'
  | 'archive'
  | 'restore'
  | 'delete'
  | 'organization'
  | 'communication'
  | 'community'
  | 'group'
  | 'create'
  | 'import'
  | 'refresh'
  | 'grid'
  | 'list'
  | 'history'
  | 'expand'
  | 'close'
  | 'play'
  | 'pause'
  | 'business'
  | 'technical'
  | 'personal'
  | 'events'
  | 'travel'
  | 'hobbies'
  | 'family'
  | 'science'
  | 'directory'
  | 'github'
  | 'registry'
  | 'partner'
  | 'ai'

type IconResolverInput = {
  iconKey?: string | null
  icon?: string | null
  emoji?: string | null
  hints?: Array<string | null | undefined>
  defaultIcon: ProductIconName
}

export type ProductVisual = {
  iconName: ProductIconName | null
  emoji: string | null
}

const ICON_KEY_ALIASES: Record<string, ProductIconName> = {
  default: 'default',
  skill: 'skill',
  skills: 'skill',
  tool: 'skill',
  tools: 'skill',
  template: 'template',
  templates: 'template',
  workflow: 'workflow',
  workflows: 'workflow',
  organization: 'organization',
  org: 'organization',
  communication: 'communication',
  communications: 'communication',
  details: 'details',
  viewdetails: 'details',
  status: 'status',
  logs: 'status',
  edit: 'edit',
  clone: 'clone',
  docs: 'docs',
  save: 'save',
  templateaction: 'save',
  export: 'export',
  restart: 'restart',
  doctor: 'doctor',
  health: 'doctor',
  rename: 'rename',
  budget: 'budget',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  archive: 'archive',
  restore: 'restore',
  unarchive: 'restore',
  delete: 'delete',
  community: 'community',
  communities: 'community',
  group: 'group',
  groups: 'group',
  create: 'create',
  import: 'import',
  refresh: 'refresh',
  grid: 'grid',
  list: 'list',
  history: 'history',
  expand: 'expand',
  close: 'close',
  play: 'play',
  run: 'play',
  resume: 'play',
  pause: 'pause',
  business: 'business',
  technical: 'technical',
  tech: 'technical',
  engineering: 'technical',
  personal: 'personal',
  events: 'events',
  event: 'events',
  travel: 'travel',
  hobbies: 'hobbies',
  hobby: 'hobbies',
  family: 'family',
  science: 'science',
  directory: 'directory',
  folder: 'directory',
  github: 'github',
  clawhub: 'registry',
  shipables: 'registry',
  tessl: 'registry',
  registry: 'registry',
  partner: 'partner',
  partners: 'partner',
  ai: 'ai',
}

const EMOJI_ICON_ALIASES: Record<string, ProductIconName> = {
  '💼': 'business',
  '⚙️': 'technical',
  '⚙': 'technical',
  '📚': 'personal',
  '🎤': 'events',
  '✈️': 'travel',
  '✈': 'travel',
  '🎨': 'hobbies',
  '🏡': 'family',
  '🔬': 'science',
  '🦞': 'registry',
  '🚢': 'registry',
  '🧩': 'registry',
  '📁': 'directory',
  '🐙': 'github',
  '🤖': 'ai',
  '🛠️': 'skill',
  '🛠': 'skill',
  '⚡': 'workflow',
  '📄': 'template',
  '📃': 'docs',
  '🏢': 'organization',
  '🏘': 'community',
  '🏘️': 'community',
  '👥': 'group',
  '💬': 'communication',
  '👁️': 'details',
  '👁': 'details',
  '📊': 'status',
  '✏️': 'edit',
  '✏': 'edit',
  '📋': 'clone',
  '💾': 'save',
  '📦': 'archive',
  '📤': 'restore',
  '↻': 'restart',
  '🩺': 'doctor',
  '✎': 'rename',
  '💲': 'budget',
  '📱': 'whatsapp',
  '🗑️': 'delete',
  '🗑': 'delete',
}

const HINT_ICON_RULES: Array<{ match: RegExp; icon: ProductIconName }> = [
  { match: /\bgithub|git\b/i, icon: 'github' },
  { match: /\bworkflow|automation|cron|scheduler\b/i, icon: 'workflow' },
  { match: /\borganization|org|company structure\b/i, icon: 'organization' },
  { match: /\bcommunication|communications|chat|channel\b/i, icon: 'communication' },
  { match: /\bcommunity|communities\b/i, icon: 'community' },
  { match: /\bgroup|groups\b/i, icon: 'group' },
  { match: /\bbusiness|sales|marketing|hr|legal|revenue|finance\b/i, icon: 'business' },
  { match: /\btechnical|engineering|devops|data|qa|infra\b/i, icon: 'technical' },
  { match: /\bpersonal|study|writing|research|notes\b/i, icon: 'personal' },
  { match: /\bevent|events|conference|meeting|launch\b/i, icon: 'events' },
  { match: /\btravel|trip|flight|hotel\b/i, icon: 'travel' },
  { match: /\bhobbies|art|music|gaming|craft\b/i, icon: 'hobbies' },
  { match: /\bfamily|household|kids|home\b/i, icon: 'family' },
  { match: /\bscience|lab|astronomy|physics|biology\b/i, icon: 'science' },
  { match: /\bclawhub|shipables|tessl|registry\b/i, icon: 'registry' },
  { match: /\bpartner|integration\b/i, icon: 'partner' },
  { match: /\bai|generate|assistant|agent\b/i, icon: 'ai' },
  { match: /\bdirectory|local\b/i, icon: 'directory' },
  { match: /\btemplate|prompt\b/i, icon: 'template' },
  { match: /\bskill|skills|tool|tools\b/i, icon: 'skill' },
]

function normalizeIconKey(value?: string | null): ProductIconName | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '')
  return ICON_KEY_ALIASES[normalized] || null
}

function firstMappedEmoji(value?: string | null): ProductIconName | null {
  if (!value) return null
  return EMOJI_ICON_ALIASES[value.trim()] || null
}

function inferIconFromHints(hints: Array<string | null | undefined>): ProductIconName | null {
  for (const rawHint of hints) {
    if (!rawHint) continue
    for (const rule of HINT_ICON_RULES) {
      if (rule.match.test(rawHint)) return rule.icon
    }
  }
  return null
}

function resolveProductVisual(input: IconResolverInput): ProductVisual {
  const explicitIcon = normalizeIconKey(input.iconKey) || normalizeIconKey(input.icon)
  if (explicitIcon) return { iconName: explicitIcon, emoji: null }

  const mappedEmojiIcon = firstMappedEmoji(input.emoji) || firstMappedEmoji(input.icon)
  if (mappedEmojiIcon) return { iconName: mappedEmojiIcon, emoji: null }

  const inferred = inferIconFromHints(input.hints || [])
  if (inferred) return { iconName: inferred, emoji: null }

  if (input.emoji) return { iconName: null, emoji: input.emoji }
  if (input.icon && !normalizeIconKey(input.icon)) return { iconName: null, emoji: input.icon }

  return { iconName: input.defaultIcon, emoji: null }
}

export function resolveSkillVisual(skill: any): ProductVisual {
  return resolveProductVisual({
    iconKey: skill?.iconKey || skill?.icon_key,
    icon: skill?.icon,
    emoji: skill?.emoji,
    hints: [
      skill?.name,
      skill?.description,
      ...(Array.isArray(skill?.tags) ? skill.tags : []),
      ...(Array.isArray(skill?.registryCategories) ? skill.registryCategories : []),
      skill?.registryProvider,
      skill?.registryName,
    ],
    defaultIcon: 'skill',
  })
}

export function resolveTemplateVisual(template: any): ProductVisual {
  return resolveProductVisual({
    iconKey: template?.iconKey || template?.icon_key,
    icon: template?.icon,
    emoji: template?.emoji,
    hints: [
      template?.category,
      template?.type,
      template?.name,
      template?.description,
      ...(Array.isArray(template?.tags) ? template.tags : []),
    ],
    defaultIcon: template?.type === 'workflow' ? 'workflow' : 'template',
  })
}

export function resolveCategoryVisual(categoryKey: string, emoji?: string | null): ProductVisual {
  return resolveProductVisual({
    iconKey: categoryKey,
    emoji: emoji || null,
    hints: [categoryKey],
    defaultIcon: 'template',
  })
}
