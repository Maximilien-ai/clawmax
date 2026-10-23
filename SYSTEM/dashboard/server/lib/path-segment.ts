/**
 * One path segment taken from a request, a stored file or imported content (a template slug, a skill folder,
 * a workflow output key). Joined to a folder it names something directly inside that folder: never empty,
 * `.`/`..` or hidden (`.git`), and without a separator or NUL. Express decodes `%2F` inside a route
 * parameter, so a route value is checked like any other.
 */
export function isPlainPathSegment(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !value.startsWith('.') && !/[\\/\0]/.test(value)
}
