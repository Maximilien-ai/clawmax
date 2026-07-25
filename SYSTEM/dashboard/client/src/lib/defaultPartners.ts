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
  categories?: string[]
  enabledByDefault?: boolean
  fields?: DefaultPartnerFieldDefinition[]
  skills?: {
    mode: 'planned'
    label: string
  }
  validation?: {
    mode: 'status'
    label: string
    helperText: string
  }
}

export const DEFAULT_VISIBLE_PARTNERS = ['senso', 'opik', 'github', 'resend', 'cognee', 'gmail', 'microsoft365'] as const

export const DEFAULT_PARTNER_DEFINITIONS: DefaultPartnerDefinition[] = [
  {
    slug: 'github',
    name: 'GitHub',
    logoUrl: 'https://brand.github.com/_next/static/media/logo-03.cc5e5332.png',
    website: 'https://github.com',
    docsUrl: 'https://docs.github.com/',
    description: 'Repository, issues, and pull request integration for coding and delivery workflows.',
    category: 'delivery',
    categories: ['delivery', 'context'],
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
  {
    slug: 'resend',
    name: 'Resend',
    logoUrl: 'https://cdn.resend.com/brand/resend-wordmark-black.svg',
    website: 'https://resend.com',
    docsUrl: 'https://resend.com/docs',
    description: 'Transactional email delivery for agent notifications, outbound messages, and React Email workflows.',
    category: 'communications',
    enabledByDefault: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: false,
        secret: true,
        storage: 'server',
      },
    ],
  },
  {
    slug: 'cognee',
    name: 'Cognee',
    website: 'https://www.cognee.ai/',
    docsUrl: 'https://docs.cognee.ai/',
    description: 'Memory, recall, and semantic context layer for agents and agent teams.',
    category: 'context',
    categories: ['context', 'memory'],
    enabledByDefault: true,
    fields: [
      {
        key: 'apiKey',
        label: 'API key',
        type: 'password',
        required: false,
        secret: true,
        storage: 'server',
      },
      {
        key: 'baseUrl',
        label: 'Base URL',
        type: 'text',
        required: false,
        secret: false,
      },
      {
        key: 'datasetName',
        label: 'Dataset name',
        type: 'text',
        required: false,
        secret: false,
      },
      {
        key: 'searchType',
        label: 'Search type',
        type: 'text',
        required: false,
        secret: false,
      },
    ],
  },
  {
    slug: 'gmail',
    name: 'Gmail',
    website: 'https://workspace.google.com/products/gmail/',
    docsUrl: 'https://developers.google.com/workspace/gmail/api/guides',
    description: 'Delegated Gmail access for bounded inbox search, reading, and draft creation.',
    category: 'communications',
    categories: ['communications', 'productivity'],
    enabledByDefault: true,
    skills: {
      mode: 'planned',
      label: 'Public OAuth preview: read, search, and create drafts without exposing Google passwords or OAuth tokens to agents.',
    },
    validation: {
      mode: 'status',
      label: 'Connection status',
      helperText: 'Delegated OAuth is available when the operator configures the Google client ID, secret, callback URI, and encryption master key. Passwords and app passwords are not accepted.',
    },
  },
  {
    slug: 'microsoft365',
    name: 'Microsoft 365',
    website: 'https://www.microsoft.com/microsoft-365',
    docsUrl: 'https://learn.microsoft.com/graph/api/resources/mail-api-overview',
    description: 'Delegated Outlook and Microsoft 365 mail access for bounded inbox search, reading, and draft creation.',
    category: 'communications',
    categories: ['communications', 'productivity'],
    enabledByDefault: true,
    skills: {
      mode: 'planned',
      label: 'Public OAuth preview: Microsoft Graph read, search, and draft capabilities without exposing account passwords or OAuth tokens to agents.',
    },
    validation: {
      mode: 'status',
      label: 'Connection status',
      helperText: 'Delegated OAuth is available when the operator configures the Entra client ID, secret, callback URI, and encryption master key. Passwords and app passwords are not accepted.',
    },
  },
]

export function getDefaultPartnerDefinitions() {
  return DEFAULT_PARTNER_DEFINITIONS.map((partner) => ({
    ...partner,
    fields: partner.fields ? [...partner.fields] : [],
  }))
}
