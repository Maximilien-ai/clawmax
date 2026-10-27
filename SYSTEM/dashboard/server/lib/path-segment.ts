import fs from 'fs'
import path from 'path'

/**
 * One path segment taken from a request, a stored file or imported content (a template slug, a skill folder,
 * a workflow output key). Joined to a folder it names something directly inside that folder: never empty,
 * `.`/`..` or hidden (`.git`), and without a separator or NUL. Express decodes `%2F` inside a route
 * parameter, so a route value is checked like any other.
 */
export function isPlainPathSegment(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !value.startsWith('.') && !/[\\/\0]/.test(value)
}
/** Resolve an untrusted relative path below a trusted root, without following
 * symlinks supplied by an imported workspace or repository. */
export function resolvePathWithin(root: string, relative: string): string {
  if (!relative || relative.includes('\0') || path.isAbsolute(relative) || relative.includes('\\')) {
    throw new Error('Path must stay inside its root')
  }
  const base = path.resolve(root)
  const resolved = path.resolve(base, relative)
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error('Path must stay inside its root')
  let current = base
  for (const segment of path.relative(base, resolved).split(path.sep)) {
    current = path.join(current, segment)
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links are not allowed in this path')
    } catch (error: any) {
      if (error.code === 'ENOENT') break
      throw error
    }
  }
  return resolved
}
