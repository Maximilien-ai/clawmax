#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Pinned-source compatibility patch. Refuse source drift rather than silently
// packaging a runtime that cannot atomically roll back keyed Agent entries.
export function patchRosterRemoval(source) {
  const start = source.indexOf('  "config.patch": async (')
  const end = source.indexOf('  "config.apply": async (', start)
  if (start < 0 || end < start) throw new Error('Unsupported OpenClaw config handler layout')
  const handler = source.slice(start, end)
  const before = `const writeResult = await commitGatewayConfigWriteOrRespond({
      snapshot,
      writeOptions,
      nextConfig: writeConfig,`
  const after = `const writeResult = await commitGatewayConfigWriteOrRespond({
      snapshot,
      // ClawMax: authorize only explicit, revision-checked keyed deletions.
      writeOptions: {
        ...writeOptions,
        allowedAgentRosterRemovals: hashlessPatch ? [] : Object.entries(normalizedPatch.agents?.entries ?? {})
          .filter(([id, entry]) => entry === null && Object.hasOwn(sourceConfig.agents?.entries ?? {}, id))
          .map(([id]) => id),
      },
      nextConfig: writeConfig,`
  if (handler.includes(after)) return source
  if (handler.split(before).length !== 2) throw new Error('Unsupported OpenClaw config.patch write boundary')
  return source.slice(0, start) + handler.replace(before, after) + source.slice(end)
}

export function patchBundledRosterRemoval(source) {
  const start = source.indexOf('\t"config.patch": async (')
  const end = source.indexOf('\t"config.apply": async (', start)
  if (start < 0 || end < start) throw new Error('Unsupported bundled OpenClaw config handler layout')
  const handler = source.slice(start, end)
  const before = 'const writeResult = await commitGatewayConfigWriteOrRespond({\n\t\t\tsnapshot,\n\t\t\twriteOptions,\n\t\t\tnextConfig: writeConfig,'
  const after = before.replace('\t\t\twriteOptions,', `\t\t\t// ClawMax: authorize only explicit, revision-checked keyed deletions.
\t\t\twriteOptions: {
\t\t\t\t...writeOptions,
\t\t\t\tallowedAgentRosterRemovals: hashlessPatch ? [] : Object.entries(normalizedPatch.agents?.entries ?? {}).filter(([id, entry]) => entry === null && Object.hasOwn(sourceConfig.agents?.entries ?? {}, id)).map(([id]) => id)
\t\t\t},`)
  if (handler.includes(after)) return source
  if (handler.split(before).length !== 2) throw new Error('Unsupported bundled OpenClaw config.patch write boundary')
  return source.slice(0, start) + handler.replace(before, after) + source.slice(end)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Pass the prepared OpenClaw source root')
  const root = path.resolve(process.argv[2])
  let file = path.join(root, 'src/gateway/server-methods/config.ts')
  const bundled = process.argv[3] === '--dist'
  if (bundled) {
    const candidates = fs.readdirSync(path.join(root, 'dist')).filter(name => /^config-[\w-]+\.(?:js|mjs)$/.test(name))
      .map(name => path.join(root, 'dist', name)).filter(candidate => fs.readFileSync(candidate, 'utf8').includes('\t"config.patch": async ('))
    if (candidates.length !== 1) throw new Error(`Expected one bundled config handler, found ${candidates.length}`)
    file = candidates[0]
  }
  const source = fs.readFileSync(file, 'utf8')
  const patched = bundled ? patchBundledRosterRemoval(source) : patchRosterRemoval(source)
  if (patched !== source) fs.writeFileSync(file, patched)
  console.log('Verified OpenClaw explicit keyed roster-removal authorization patch')
}
