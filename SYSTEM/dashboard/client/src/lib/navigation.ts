export type DashboardPage =
  | 'agents'
  | 'activity'
  | 'communication'
  | 'docs'
  | 'templates'
  | 'organizations'
  | 'workflows'
  | 'skills'
  | 'keys'
  | 'logs'

const DEFAULT_PAGE: DashboardPage = 'agents'

const PAGE_PATHS: Record<DashboardPage, string> = {
  agents: '/agents',
  activity: '/activity',
  communication: '/communication',
  docs: '/docs',
  templates: '/templates',
  organizations: '/organizations',
  workflows: '/workflows',
  skills: '/skills',
  keys: '/keys',
  logs: '/logs',
}

export function pageToPath(page: DashboardPage): string {
  return PAGE_PATHS[page] || PAGE_PATHS[DEFAULT_PAGE]
}

export function pathToPage(pathname: string): DashboardPage {
  const normalizedPath = (pathname || '/').trim().replace(/\/+$/, '') || '/'
  const matchedEntry = Object.entries(PAGE_PATHS).find(([, path]) => path === normalizedPath)
  return (matchedEntry?.[0] as DashboardPage | undefined) || DEFAULT_PAGE
}

