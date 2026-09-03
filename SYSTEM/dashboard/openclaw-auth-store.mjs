#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const agentDir = path.resolve(process.argv[2] || '')
if (!agentDir || agentDir === path.parse(agentDir).root) {
  throw new Error('Usage: openclaw-auth-store.mjs <agent-dir>')
}

let input = ''
for await (const chunk of process.stdin) input += chunk
const store = JSON.parse(input)
if (!store || typeof store !== 'object' || !store.profiles || typeof store.profiles !== 'object') {
  throw new Error('Expected an OpenClaw auth profile store on stdin')
}

const roots = [
  process.env.OPENCLAW_PACKAGE_ROOT,
  '/usr/local/lib/node_modules/openclaw',
].filter(Boolean)

let storeModulePath = ''
let saveExportName = ''
for (const root of roots) {
  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(distDir)) continue
  const match = fs.readdirSync(distDir).find((name) => {
    if (!name.startsWith('store-') || !name.endsWith('.js')) return false
    const source = fs.readFileSync(path.join(distDir, name), 'utf8')
    const exportMatch = source.match(/saveAuthProfileStore as ([A-Za-z_$][\w$]*)/)
    if (!exportMatch) return false
    saveExportName = exportMatch[1]
    return true
  })
  if (match) {
    storeModulePath = path.join(distDir, match)
    break
  }
}

if (!storeModulePath) {
  throw new Error('Unable to locate the pinned OpenClaw auth store module')
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
