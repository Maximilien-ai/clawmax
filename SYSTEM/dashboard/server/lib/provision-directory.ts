import fs from 'fs'
import path from 'path'

const active = new Set<string>()

/** Release only an empty directory that this provisioning attempt created. */
export function prepareProvisionDirectory(directory: string): (success: boolean) => void {
  if (active.has(directory)) throw new Error('Agent provisioning is already in progress')
  fs.mkdirSync(path.dirname(directory), { recursive: true })
  let owned: fs.Stats | undefined
  try {
    fs.mkdirSync(directory)
    owned = fs.lstatSync(directory)
  } catch (error: any) {
    if (error.code !== 'EEXIST' || !fs.lstatSync(directory).isDirectory()) throw error
  }
  active.add(directory)
  let settled = false
  return success => {
    if (settled) return
    settled = true
    active.delete(directory)
    if (success || !owned) return
    try {
      const current = fs.lstatSync(directory)
      if (current.dev === owned.dev && current.ino === owned.ino) fs.rmdirSync(directory)
    } catch (error: any) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error
    }
  }
}
