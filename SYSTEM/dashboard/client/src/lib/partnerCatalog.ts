export type PartnerCatalogEntry = {
  slug: string
  name: string
  category?: string
}

const PARTNER_CATEGORY_ORDER = ['delivery', 'communications', 'context', 'monitoring']

function normalizeCategory(category: string | undefined): string {
  return (category || 'other').trim().toLowerCase() || 'other'
}

export function groupPartnersByCategory<T extends PartnerCatalogEntry>(partners: T[]): Array<{ category: string; partners: T[] }> {
  const grouped = new Map<string, T[]>()

  for (const partner of partners) {
    const category = normalizeCategory(partner.category)
    const bucket = grouped.get(category) || []
    bucket.push(partner)
    grouped.set(category, bucket)
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
  if (category === 'other') return 'Other'
  return category.charAt(0).toUpperCase() + category.slice(1)
}
