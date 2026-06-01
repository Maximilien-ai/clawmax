import { normalizeRuntimePlatform, type RuntimePlatform } from './skillPlatform'

export function buildSkillsPageCountLabel(filteredCount: number, totalCount: number): string {
  return `Showing ${filteredCount} of ${totalCount} skills`
}

export function buildRegistryCompatibilityNote(runtimePlatform: string | null | undefined): string | null {
  const normalized = normalizeRuntimePlatform(runtimePlatform as RuntimePlatform | string | null | undefined)
  if (normalized === 'darwin') return 'Showing skills compatible with this macOS runtime.'
  if (normalized === 'linux') return 'Showing skills compatible with this Linux runtime.'
  return null
}
