export type CoreDashboardPage =
  | 'builder'
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

export type PluginDashboardPage = `plugin:${string}`
export type DashboardPage = CoreDashboardPage | PluginDashboardPage

const DEFAULT_PAGE: CoreDashboardPage = 'builder'

const PAGE_PATHS: Record<CoreDashboardPage, string> = {
  builder: '/builder',
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

export function buildPluginPage(slug: string): PluginDashboardPage {
  return `plugin:${slug.trim()}` as PluginDashboardPage
}

export function isPluginPage(page: DashboardPage): page is PluginDashboardPage {
  return page.startsWith('plugin:')
}

export function pluginSlugFromPage(page: DashboardPage): string | null {
  if (!isPluginPage(page)) return null
  const slug = page.slice('plugin:'.length).trim()
  return slug || null
}

export function pageToPath(page: DashboardPage): string {
  if (isPluginPage(page)) {
    const slug = pluginSlugFromPage(page)
    return slug ? `/plugins/${slug}` : PAGE_PATHS[DEFAULT_PAGE]
  }
  return PAGE_PATHS[page] || PAGE_PATHS[DEFAULT_PAGE]
}

export function pathToPage(pathname: string): DashboardPage {
  const normalizedPath = (pathname || '/').trim().replace(/\/+$/, '') || '/'
  if (normalizedPath.startsWith('/plugins/')) {
    const slug = normalizedPath.slice('/plugins/'.length).trim()
    return slug ? buildPluginPage(slug) : DEFAULT_PAGE
  }
  const matchedEntry = Object.entries(PAGE_PATHS).find(([, path]) => path === normalizedPath)
  return (matchedEntry?.[0] as DashboardPage | undefined) || DEFAULT_PAGE
}
