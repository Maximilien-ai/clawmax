import fs from 'fs'
import path from 'path'
import { PortableTemplateError } from './portable-template-zip'

/** The registered root is trusted; no descendant may redirect a workspace write.
 * lstat (not existsSync) deliberately rejects dangling symbolic links as well.
 * Single-writer volumes are required; this is not an OS-level sandbox against
 * a separate process concurrently renaming directories.
 */
export function templateStoragePath(root: string, relative: string): string {
  const parts = relative.split('/')
  if (!relative || path.isAbsolute(relative) || parts.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) {
    throw new PortableTemplateError('resource_conflict', 'Unsafe workspace storage path', 409)
  }
  let current = path.resolve(root)
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index])
    let stat: fs.Stats
    try { stat = fs.lstatSync(current) } catch (error: any) { if (error.code === 'ENOENT') continue; throw error }
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) {
      throw new PortableTemplateError('resource_conflict', 'Workspace storage cannot traverse symbolic links or non-directories', 409)
    }
  }
  return current
}
