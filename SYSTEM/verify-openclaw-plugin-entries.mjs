import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export function verifyPluginEntries(root) {
  const directory = path.join(root, 'dist', 'extensions')
  const failures = []
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === 'node_modules') continue
    const pluginRoot = path.join(directory, item.name)
    const manifest = path.join(pluginRoot, 'package.json')
    if (!fs.existsSync(manifest)) {
      // Some bundled plugins intentionally have no package.json and use the
      // default index.js entry. A manifest is still required for discovery.
      if (!fs.existsSync(path.join(pluginRoot, 'openclaw.plugin.json')) || !fs.existsSync(path.join(pluginRoot, 'index.js'))) {
        failures.push(`${item.name}: missing plugin manifest or default entry`)
      }
      continue
    }
    const entries = JSON.parse(fs.readFileSync(manifest, 'utf8')).openclaw?.extensions ?? []
    if (!Array.isArray(entries)) throw new Error(`${item.name}: invalid extension entries`)
    if (entries.length && !fs.existsSync(path.join(pluginRoot, 'openclaw.plugin.json'))) {
      failures.push(`${item.name}: missing plugin manifest`)
    }
    for (const entry of entries) {
      if (typeof entry !== 'string') throw new Error(`${item.name}: invalid extension entry`)
      const target = path.resolve(pluginRoot, entry)
      if (!target.startsWith(`${pluginRoot}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
        failures.push(`${item.name}: missing or invalid extension entry ${entry}`)
      }
    }
  }
  if (failures.length) throw new Error(failures.join('\n'))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyPluginEntries(path.resolve(process.argv[2])) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
