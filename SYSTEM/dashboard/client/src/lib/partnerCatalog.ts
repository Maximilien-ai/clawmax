export type PartnerCatalogEntry = {
  slug: string
  name: string
  category?: string
  categories?: string[]
}

const PARTNER_CATEGORY_ORDER = ['delivery', 'communications', 'context', 'monitoring']

function normalizeCategory(category: string | undefined): string {
  return (category || 'other').trim().toLowerCase() || 'other'
}

export function getPartnerCategories(partner: PartnerCatalogEntry): string[] {
  const normalized = Array.from(new Set(
    (Array.isArray(partner.categories) && partner.categories.length > 0
      ? partner.categories
      : [partner.category || 'other'])
      .map((category) => normalizeCategory(category))
      .filter(Boolean)
  ))
  return normalized.length > 0 ? normalized : ['other']
}

export function listPartnerCategoryTabs<T extends PartnerCatalogEntry>(partners: T[]): string[] {
  const categories = new Set<string>()
  for (const partner of partners) {
    for (const category of getPartnerCategories(partner)) {
      categories.add(category)
    }
  }

  return ['all', ...Array.from(categories).sort((a, b) => {
    const ai = PARTNER_CATEGORY_ORDER.indexOf(a)
    const bi = PARTNER_CATEGORY_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    }
    return a.localeCompare(b)
  })]
}

export function filterPartnersByCategory<T extends PartnerCatalogEntry>(partners: T[], category: string): T[] {
  if (category === 'all') {
    return partners.slice().sort((a, b) => a.name.localeCompare(b.name))
  }
  return partners
    .filter((partner) => getPartnerCategories(partner).includes(category))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function groupPartnersByCategory<T extends PartnerCatalogEntry>(partners: T[]): Array<{ category: string; partners: T[] }> {
  const grouped = new Map<string, T[]>()

  for (const partner of partners) {
    for (const category of getPartnerCategories(partner)) {
      const bucket = grouped.get(category) || []
      bucket.push(partner)
      grouped.set(category, bucket)
    }
  }

  const sortedCategories = Array.from(grouped.keys()).sort((a, b) => {
    const ai = PARTNER_CATEGORY_ORDER.indexOf(a)
    const bi = PARTNER_CATEGORY_ORDER.indexOf(b)
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    }
    return a.localeCompare(b)
  })

  return sortedCategories.map((category) => ({
    category,
    partners: (grouped.get(category) || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
  }))
}

export function formatPartnerCategoryLabel(category: string): string {
  if (category === 'all') return 'All'
  if (category === 'other') return 'Other'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export function getPartnerLogoClass(slug: string, variant: 'compact' | 'hero' = 'compact'): string {
  if (variant === 'hero') {
    if (slug === 'github') {
      return 'h-7 w-auto max-w-[104px] object-contain rounded-sm border border-gray-200 bg-white px-1 py-0.5 dark:border-gray-700 dark:bg-white'
    }
    if (slug === 'resend') {
      return 'h-5 w-auto max-w-[96px] object-contain rounded-sm border border-gray-200 bg-white px-1 py-0.5 dark:border-gray-700 dark:bg-white'
    }
    if (slug === 'senso') {
      return 'h-5 w-auto max-w-[90px] object-contain rounded-sm border border-gray-200 bg-white px-1 py-0.5 dark:border-gray-700 dark:bg-white'
    }
    return 'h-8 w-auto max-w-[120px] object-contain rounded-sm border border-gray-200 bg-white px-1.5 py-1 dark:border-gray-700 dark:bg-white'
  }
  if (slug === 'github') {
    return 'h-5 w-auto max-w-[78px] object-contain rounded-sm border border-gray-200 bg-white px-0.5 py-0.5 dark:border-gray-700 dark:bg-white'
  }
  if (slug === 'resend') {
    return 'h-4 w-auto max-w-[74px] object-contain rounded-sm border border-gray-200 bg-white px-0.5 py-0.5 dark:border-gray-700 dark:bg-white'
  }
  if (slug === 'senso') {
    return 'h-4 w-auto max-w-[72px] object-contain rounded-sm border border-gray-200 bg-white px-0.5 py-0.5 dark:border-gray-700 dark:bg-white'
  }
  return 'h-6 w-auto max-w-[96px] object-contain rounded-sm border border-gray-200 bg-white px-1 py-0.5 dark:border-gray-700 dark:bg-white'
}
