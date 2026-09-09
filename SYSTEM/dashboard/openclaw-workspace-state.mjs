#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const workspaceDir = path.resolve(process.argv[2] || '')
if (!workspaceDir || workspaceDir === path.parse(workspaceDir).root) {
  throw new Error('Usage: openclaw-workspace-state.mjs <workspace-dir>')
}

const roots = [
  process.env.OPENCLAW_PACKAGE_ROOT,
  '/usr/local/lib/node_modules/openclaw',
  '/opt/homebrew/lib/node_modules/openclaw',
].filter(Boolean)

let modulePath = ''
let prepareExportName = ''
let deleteExportName = ''
let readExportName = ''

for (const root of roots) {
  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(distDir)) continue
  const entries = fs.readdirSync(distDir)
  const match = entries.find((name) => {
    if (!name.startsWith('workspace-state-store-') || !name.endsWith('.js')) return false
    const source = fs.readFileSync(path.join(distDir, name), 'utf8')
    const prepareMatch = source.match(/prepareWorkspaceStateDeletion as ([A-Za-z_$][\w$]*)/)
    const deleteMatch = source.match(/deleteWorkspaceState as ([A-Za-z_$][\w$]*)/)
    const readMatch = source.match(/readWorkspaceStateSnapshot as ([A-Za-z_$][\w$]*)/)
    if (!prepareMatch || !deleteMatch || !readMatch) return false
    prepareExportName = prepareMatch[1]
    deleteExportName = deleteMatch[1]
    readExportName = readMatch[1]
    return true
  })
  if (match) {
    modulePath = path.join(distDir, match)
    break
  }
}

if (!modulePath) {
  throw new Error('Unable to locate the pinned OpenClaw workspace state module')
}

const workspaceStateModule = await import(pathToFileURL(modulePath).href)
const prepareWorkspaceStateDeletion = workspaceStateModule[prepareExportName]
const deleteWorkspaceState = workspaceStateModule[deleteExportName]
const readWorkspaceStateSnapshot = workspaceStateModule[readExportName]

if (
  typeof prepareWorkspaceStateDeletion !== 'function' ||
  typeof deleteWorkspaceState !== 'function' ||
  typeof readWorkspaceStateSnapshot !== 'function'
) {
  throw new Error('Pinned OpenClaw workspace state module is missing required lifecycle exports')
}

const deletionPlan = prepareWorkspaceStateDeletion(workspaceDir)
deleteWorkspaceState(deletionPlan)

const snapshot = readWorkspaceStateSnapshot(workspaceDir, { readOnly: true })
if (snapshot?.setupExists || snapshot?.attestation) {
  throw new Error('OpenClaw workspace state remains after deletion')
}

process.stdout.write(JSON.stringify({ cleared: true, workspaceDir }))
