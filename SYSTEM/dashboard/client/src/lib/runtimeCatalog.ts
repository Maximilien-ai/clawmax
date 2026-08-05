/**
 * Shared handling of the agent-runtime catalog served by GET /api/integrations/runtimes.
 *
 * The Add Agent wizard, the agent editor and the BYOK wizard all render the same data. Each grew
 * its own copy of the parsing and the "is this model still valid for the chosen runtime" rule, and
 * the copies drifted — one checked the provider-prefixed model id and the other did not, so the
 * same agent kept its model in one dialog and lost it in the other.
 */

export interface RuntimeCatalogEntry {
  id: string
  label: string
  /** Models this runtime's CLI accepts, empty when it cannot enumerate a catalog. */
  models: string[]
  enabled: boolean
}

/** The UI's "inherit the workspace default" sentinel, plus OpenClaw itself, are not CLI pins. */
export function isCliRuntimeSelection(runtime: string | undefined | null): boolean {
  return !!runtime && runtime !== 'default' && runtime !== 'openclaw'
}

export function parseRuntimeCatalog(data: unknown): RuntimeCatalogEntry[] {
  const payload = data as { runtimes?: unknown; enabledRuntimes?: unknown } | null
  const enabled = Array.isArray(payload?.enabledRuntimes) ? payload!.enabledRuntimes.map(String) : []
  const rows = Array.isArray(payload?.runtimes) ? payload!.runtimes : []
  return rows
    .filter((row: any) => row?.id && row.id !== 'openclaw')
    .map((row: any) => ({
      id: String(row.id),
      label: String(row.label || row.id),
      models: Array.isArray(row.models) ? row.models.map(String) : [],
      enabled: enabled.includes(String(row.id)),
    }))
}

export function enabledRuntimeIds(catalog: RuntimeCatalogEntry[]): string[] {
  return catalog.filter((entry) => entry.enabled).map((entry) => entry.id)
}

export function runtimeModelsFor(catalog: RuntimeCatalogEntry[], runtime: string): string[] {
  return isCliRuntimeSelection(runtime) ? (catalog.find((entry) => entry.id === runtime)?.models || []) : []
}

export function runtimeLabelFor(catalog: RuntimeCatalogEntry[], runtime: string): string {
  return catalog.find((entry) => entry.id === runtime)?.label || runtime
}

/** Runtime CLIs take a bare model id; ClawMax stores `provider/model`. */
export function stripModelProvider(model: string): string {
  return model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
}

/**
 * Whether a runtime will accept a model. An empty catalog means "cannot enumerate", which is
 * treated as permissive — refusing everything would strand a working runtime.
 */
export function runtimeAcceptsModel(models: string[], model: string): boolean {
  if (models.length === 0) return true
  return models.includes(model) || models.includes(stripModelProvider(model))
}

/** Model to keep after switching runtime: the current one if still valid, otherwise none. */
export function modelAfterRuntimeChange(
  catalog: RuntimeCatalogEntry[],
  nextRuntime: string,
  currentModel: string,
): string {
  const models = runtimeModelsFor(catalog, nextRuntime)
  if (!currentModel || runtimeAcceptsModel(models, currentModel)) return currentModel
  return ''
}
