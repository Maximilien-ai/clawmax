#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const agentDir = path.resolve(process.argv[2] || '')
const mode = process.argv[3] === 'read' ? 'read' : 'write'
if (!agentDir || agentDir === path.parse(agentDir).root) {
  throw new Error('Usage: openclaw-auth-store.mjs <agent-dir> [read]')
}

let store
if (mode === 'write') {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  store = JSON.parse(input)
  if (!store || typeof store !== 'object' || !store.profiles || typeof store.profiles !== 'object') {
    throw new Error('Expected an OpenClaw auth profile store on stdin')
  }
}

const roots = [
  process.env.OPENCLAW_PACKAGE_ROOT,
  '/usr/local/lib/node_modules/openclaw',
].filter(Boolean)

let storeModulePath = ''
let saveExportName = ''
let persistedModulePath = ''
let loadExportName = ''
for (const root of roots) {
  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(distDir)) continue
  const entries = fs.readdirSync(distDir)
  const match = entries.find((name) => {
    if (!name.startsWith('store-') || !name.endsWith('.js')) return false
    const source = fs.readFileSync(path.join(distDir, name), 'utf8')
    const exportMatch = source.match(/saveAuthProfileStore as ([A-Za-z_$][\w$]*)/)
    if (!exportMatch) return false
    saveExportName = exportMatch[1]
    return true
  })
  if (match) {
    storeModulePath = path.join(distDir, match)
    const persistedMatch = entries.find((name) => {
      if (!name.startsWith('persisted-') || !name.endsWith('.js')) return false
      const source = fs.readFileSync(path.join(distDir, name), 'utf8')
      const exportMatch = source.match(/loadPersistedAuthProfileStore as ([A-Za-z_$][\w$]*)/)
      if (!exportMatch) return false
      loadExportName = exportMatch[1]
      return true
    })
    if (persistedMatch) persistedModulePath = path.join(distDir, persistedMatch)
    break
  }
}

if (!storeModulePath) {
  throw new Error('Unable to locate the pinned OpenClaw auth store module')
}

if (mode === 'read') {
  if (!persistedModulePath) {
    throw new Error('Unable to locate the pinned OpenClaw persisted auth module')
  }
  const persistedModule = await import(pathToFileURL(persistedModulePath).href)
  const loadAuthProfileStore = persistedModule[loadExportName]
  if (typeof loadAuthProfileStore !== 'function') {
    throw new Error('Pinned OpenClaw persisted auth module does not export loadPersistedAuthProfileStore')
  }
  const loadedStore = loadAuthProfileStore(agentDir)
  process.stdout.write(JSON.stringify({ native: true, store: loadedStore || { version: 1, profiles: {} } }))
  process.exit(0)
}

const storeModule = await import(pathToFileURL(storeModulePath).href)
const saveAuthProfileStore = storeModule[saveExportName]
if (typeof saveAuthProfileStore !== 'function') {
  throw new Error('Pinned OpenClaw auth store module does not export saveAuthProfileStore')
}

saveAuthProfileStore(store, agentDir)
process.stdout.write(JSON.stringify({
  native: fs.existsSync(path.join(agentDir, 'openclaw-agent.sqlite')),
}))
