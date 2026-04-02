export interface DiscoveryCandidate {
  id: string
  name: string
  description?: string
  type?: string
  category?: string
  tags?: string[]
  keywords?: string[]
}

export interface DiscoverySuggestion {
  id: string
  score: number
  reasons: string[]
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function addReason(reasons: Set<string>, reason: string) {
  if (reasons.size < 3) reasons.add(reason)
}

export function getDiscoverySuggestions(
  query: string,
  candidates: DiscoveryCandidate[],
  limit: number = 5
): DiscoverySuggestion[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const queryTokens = tokenize(normalizedQuery)
  if (queryTokens.length === 0) return []

  return candidates
    .map((candidate) => {
      let score = 0
      const reasons = new Set<string>()
      const name = candidate.name.toLowerCase()
      const description = (candidate.description || '').toLowerCase()
      const category = (candidate.category || '').toLowerCase()
      const tags = (candidate.tags || []).map((tag) => tag.toLowerCase())
      const keywords = (candidate.keywords || []).map((keyword) => keyword.toLowerCase())

      if (name === normalizedQuery) {
        score += 20
        addReason(reasons, 'exact name')
      } else if (name.includes(normalizedQuery)) {
        score += 12
        addReason(reasons, 'name match')
      }

      if (description.includes(normalizedQuery)) {
        score += 7
        addReason(reasons, 'description match')
      }

      if (category && category.includes(normalizedQuery)) {
        score += 6
        addReason(reasons, 'category match')
      }

      if (tags.some((tag) => tag.includes(normalizedQuery))) {
        score += 6
        addReason(reasons, 'tag match')
      }

      if (keywords.some((keyword) => keyword.includes(normalizedQuery))) {
        score += 7
        addReason(reasons, 'role or target match')
      }

      for (const token of queryTokens) {
        if (token.length < 2) continue

        if (name.split(/[^a-z0-9]+/g).includes(token)) {
          score += 4
          addReason(reasons, 'matching name terms')
          continue
        }
        if (description.split(/[^a-z0-9]+/g).includes(token)) {
          score += 2
          addReason(reasons, 'matching description terms')
          continue
        }
        if (tags.some((tag) => tag.split(/[^a-z0-9]+/g).includes(token))) {
          score += 3
          addReason(reasons, 'matching tags')
          continue
        }
        if (keywords.some((keyword) => keyword.split(/[^a-z0-9]+/g).includes(token))) {
          score += 3
          addReason(reasons, 'matching roles or targets')
        }
      }

      return {
        id: candidate.id,
        score,
        reasons: Array.from(reasons),
      }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
}
