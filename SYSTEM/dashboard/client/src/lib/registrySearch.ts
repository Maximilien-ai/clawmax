export type SkillRegistryProvider = 'clawhub' | 'shipables' | 'tessl'

export interface RegistrySearchResult {
  name: string
  registry_provider?: SkillRegistryProvider
  [key: string]: unknown
}

export interface RegistrySearchResponse<T extends RegistrySearchResult = RegistrySearchResult> {
  results: T[]
  total: number
}

export function normalizeRegistrySearchResponse<T extends RegistrySearchResult>(
  provider: SkillRegistryProvider,
  data: any,
): RegistrySearchResponse<T> {
  const results = Array.isArray(data?.results)
    ? data.results.map((result: T) => ({ ...result, registry_provider: provider }))
    : []
  return {
    results,
    total: Number.isFinite(data?.total) ? data.total : results.length,
  }
}

export function combineRegistrySearchResponses<T extends RegistrySearchResult>(
  responses: RegistrySearchResponse<T>[],
): RegistrySearchResponse<T> {
  return {
    results: responses.flatMap((response) => response.results),
    total: responses.reduce((total, response) => total + response.total, 0),
  }
}
