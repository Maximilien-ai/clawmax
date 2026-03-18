import path from 'path'
import fs from 'fs'

/**
 * Walk up from __dirname looking for the .git directory to find repo root.
 * Works in both dev (ts-node from server/lib/) and production (compiled to dist/server/lib/).
 */
export function findRepoRoot(): string {
  let dir = __dirname
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  throw new Error('Could not find repo root (.git directory) from ' + __dirname)
}
