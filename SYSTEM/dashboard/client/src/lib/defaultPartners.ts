export type DefaultPartnerFieldDefinition = {
  key: string
  label: string
  type: 'text' | 'password' | 'select'
  required?: boolean
  secret?: boolean
  storage?: 'browser' | 'server'
}

export type DefaultPartnerDefinition = {
  slug: string
  name: string
  logoUrl?: string
  website?: string
  docsUrl?: string
  description: string
  category?: string
  enabledByDefault?: boolean
  fields?: DefaultPartnerFieldDefinition[]
}

export const DEFAULT_VISIBLE_PARTNERS = ['senso', 'opik', 'github'] as const

export const DEFAULT_PARTNER_DEFINITIONS: DefaultPartnerDefinition[] = [
  {
    slug: 'github',
    name: 'GitHub',
    logoUrl: 'https://brand.github.com/_next/static/media/logo-03.cc5e5332.png',
    website: 'https://github.com',
    docsUrl: 'https://docs.github.com/',
    description: 'Repository, issues, and pull request integration for coding and delivery workflows.',
    category: 'delivery',
    enabledByDefault: true,
    fields: [
      {
        key: 'token',
        label: 'Runtime token',
        type: 'password',
        required: false,
        secret: true,
        storage: 'server',
      },
      {
        key: 'defaultRepo',
        label: 'Default repository',
        type: 'text',
        required: false,
        secret: false,
      },
    ],
  },
  {
    slug: 'senso',
    name: 'Senso',
    logoUrl: 'https://www.senso.ai/_next/image?q=75&url=%2FSenso-1x.png&w=640',
    website: 'https://senso.ai',
    docsUrl: 'https://docs.senso.ai/',
    description: 'Shared evidence and context layer for agent research, ingestion, search, and content generation workflows.',
    category: 'context',
    enabledByDefault: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: false,
        secret: true,
      },
      {
        key: 'contextLabel',
        label: 'Default context label',
        type: 'text',
        required: false,
        secret: false,
      },
    ],
  },
  {
    slug: 'opik',
    name: 'Opik',
    logoUrl: 'https://www.comet.com/site/wp-content/uploads/2025/07/comet-logo-dark.svg',
    website: 'https://www.comet.com/site/products/opik/',
    docsUrl: 'https://www.comet.com/site/products/opik/',
    description: 'Tracing and monitoring for agent runs and model execution.',
    category: 'monitoring',
    enabledByDefault: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: false,
        secret: true,
      },
      {
        key: 'workspace',
        label: 'Workspace',
        type: 'text',
        required: false,
        secret: false,
      },
      {
        key: 'project',
        label: 'Project',
        type: 'text',
        required: false,
        secret: false,
      },
    ],
  },
]

export function getDefaultPartnerDefinitions() {
  return DEFAULT_PARTNER_DEFINITIONS.map((partner) => ({
    ...partner,
    fields: partner.fields ? [...partner.fields] : [],
  }))
}
