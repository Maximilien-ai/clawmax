/**
 * Which hosted models the installed OpenClaw runtime is known not to run.
 *
 * A provider listing a model (and a key authorized for it) does not mean OpenClaw can resolve it:
 * OpenClaw 2026.9.7 rejects every turn of `openai/gpt-5.4-mini-2026-03-17`, a dated snapshot of
 * the `gpt-5.4-mini` its catalog lists, with "Unknown model". The catalog is read from the
 * installed package's plugin manifests, so it matches the runtime that will execute the agent and
 * costs no process spawn, gateway call or state access.
 *
 * The manifests are not the whole set of runnable ids: OpenClaw also resolves some unlisted ids
 * through forward-compat rules (OpenAI `gpt-5.6` and `chat-latest`; Google and xAI families) and
 * provider-specific normalization. So only the confirmed failure is ruled out: an OpenAI dated
 * snapshot that the catalog does not list but whose alias it does. Every other id is unverified
 * and stays selectable, as before.
 */
import fs from 'fs'
import path from 'path'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { openClawConfigPath } from './openclaw-profile-paths'

// Providers whose unlisted snapshots OpenClaw is confirmed to reject. Others (Anthropic, Google,
// xAI, and endpoints the user configures) may resolve unlisted ids, so the catalog says nothing
// about them.
const SNAPSHOT_CHECKED_PROVIDERS = new Set(['openai'])
const CATALOG_TTL_MS = 60 * 1000

export interface OpenClawModelCatalog {
  version?: string
  providers: Map<string, Set<string>>
}

export type OpenClawModelSupport =
  | { status: 'supported' }
  | { status: 'unsupported'; replacement: string }
  | { status: 'unverified' }

let cached: { key: string; catalog: OpenClawModelCatalog | null; expiresAt: number } | null = null
let catalogForTests: OpenClawModelCatalog | null | undefined

/**
 * Pins the catalog for a test: null means no readable runtime catalog, undefined restores the
 * installed one. Keeps fixtures independent of whichever OpenClaw the machine has.
 */
export function setOpenClawModelCatalogForTests(catalog: OpenClawModelCatalog | null | undefined) {
  catalogForTests = catalog
}

/** The package directory holding `dist/extensions`, from the CLI itself or the script that launches it. */
function resolvePackageRoot(cliPath: string): string | null {
  let real: string
  try {
    real = fs.realpathSync(cliPath)
  } catch {
    return null
  }
  const candidates = [path.dirname(real)]
  try {
    // A launcher script (ClawMax's pinned target wrapper) names the entry point it executes.
    if (fs.statSync(real).size < 64 * 1024) {
      for (const match of fs.readFileSync(real, 'utf8').matchAll(/(\/[^"'\s]+)\/openclaw\.mjs\b/g)) candidates.unshift(match[1])
    }
  } catch {
    // Unreadable launcher: fall back to the executable's own directory.
  }
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'dist', 'extensions'))) || null
}

function readCatalog(root: string): OpenClawModelCatalog {
  const providers = new Map<string, Set<string>>()
  const extensionsDir = path.join(root, 'dist', 'extensions')
  for (const entry of fs.readdirSync(extensionsDir)) {
    let manifest: any
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(extensionsDir, entry, 'openclaw.plugin.json'), 'utf8'))
    } catch {
      continue
    }
    if (manifest?.enabledByDefault === false) continue
    for (const [provider, listing] of Object.entries<any>(manifest?.modelCatalog?.providers || {})) {
      if (!SNAPSHOT_CHECKED_PROVIDERS.has(provider) || !Array.isArray(listing?.models)) continue
      const ids = providers.get(provider) || new Set<string>()
      for (const model of listing.models) if (typeof model?.id === 'string' && model.id.trim()) ids.add(model.id.trim())
      providers.set(provider, ids)
    }
  }
  let version: string | undefined
  try {
    version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  } catch {
    version = undefined
  }
  return { version, providers }
}

/** The installed runtime's catalog, or null when no OpenClaw installation can be read. */
export function getOpenClawModelCatalog(): OpenClawModelCatalog | null {
  if (catalogForTests !== undefined) return catalogForTests
  // The launcher pairs a pinned CLI with its package root; otherwise find it from the CLI.
  const explicitRoot = process.env.OPENCLAW_PACKAGE_ROOT?.trim()
  const cliPath = explicitRoot ? null : resolveOpenClawCliPath()
  const key = explicitRoot || cliPath || ''
  if (cached && cached.key === key && cached.expiresAt > Date.now()) return cached.catalog
  let catalog: OpenClawModelCatalog | null = null
  const root = explicitRoot
    ? (fs.existsSync(path.join(explicitRoot, 'dist', 'extensions')) ? explicitRoot : null)
    : cliPath ? resolvePackageRoot(cliPath) : null
  if (root) {
    try {
      catalog = readCatalog(root)
    } catch {
      catalog = null
    }
  }
  cached = { key, catalog, expiresAt: Date.now() + CATALOG_TTL_MS }
  return catalog
}

// OpenAI's dated snapshots, such as `gpt-5.4-mini-2026-03-17`.
const SNAPSHOT_SUFFIX = /-\d{4}-\d{2}-\d{2}$/

export function checkOpenClawModelSupport(model: string | undefined, catalog = getOpenClawModelCatalog()): OpenClawModelSupport {
  const value = String(model || '').trim()
  const slash = value.indexOf('/')
  if (!catalog || slash <= 0) return { status: 'unverified' }
  const provider = value.slice(0, slash)
  const id = value.slice(slash + 1)
  const ids = catalog.providers.get(provider)
  if (!ids || ids.size === 0) return { status: 'unverified' }
  if (ids.has(id)) return { status: 'supported' }
  // Only the pinned version has a confirmed negative resolution rule.
  if (catalog.version !== '2026.9.7' || provider !== 'openai') return { status: 'unverified' }
  // Custom providers extend or replace the bundled catalog. Respect the selected profile,
  // without falling back to host state or caching a user's mutable custom configuration.
  try {
    const config = JSON.parse(fs.readFileSync(openClawConfigPath(), 'utf8'))
    if (config?.models?.providers?.[provider] || JSON.stringify(config).includes('"$include"')) return { status: 'unverified' }
  } catch (error: any) {
    // Missing config means stock defaults; unreadable or JSON5 config proves nothing.
    if (error?.code !== 'ENOENT') return { status: 'unverified' }
  }
  const alias = id.replace(SNAPSHOT_SUFFIX, '')
  return alias !== id && ids.has(alias)
    ? { status: 'unsupported', replacement: `${provider}/${alias}` }
    : { status: 'unverified' }
}

/** Drops models the runtime is known not to run; unverifiable ones stay, as before. */
export function filterOpenClawRunnableModels(models: string[], catalog = getOpenClawModelCatalog()): string[] {
  if (!catalog) return models
  return models.filter((model) => checkOpenClawModelSupport(model, catalog).status !== 'unsupported')
}

/**
 * Why the selected models cannot be saved for an OpenClaw agent, or null when they can.
 * `label` names each slot ("primary model", "backup model") in the message.
 */
export function describeOpenClawModelRejection(
  selections: Array<{ model: string | undefined; label: string }>,
  catalog = getOpenClawModelCatalog()
): string | null {
  for (const { model, label } of selections) {
    const support = checkOpenClawModelSupport(model, catalog)
    if (support.status !== 'unsupported') continue
    const runtime = `OpenClaw${catalog?.version ? ` ${catalog.version}` : ''}`
    const provider = String(model).slice(0, String(model).indexOf('/'))
    const remedy = `Use \`${support.replacement}\`, the id ${runtime} lists for this model, or choose another model from the list.`
    return `The ${label} \`${model}\` is not in the ${provider} model catalog of the installed ${runtime} runtime, so the runtime would reject every chat with it ("Unknown model"). The provider offering a model does not make it runnable here. ${remedy}`
  }
  return null
}

export function clearOpenClawModelCatalogCache() {
  cached = null
}
