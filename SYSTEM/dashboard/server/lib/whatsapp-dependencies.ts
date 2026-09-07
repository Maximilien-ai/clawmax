import fs from 'fs'
import path from 'path'

export type WhatsAppDependencyPaths = {
  baileys: string | null
  boom: string | null
}

type ResolveWhatsAppDependencyOptions = {
  cliPath?: string | null
  homeDir?: string
  repositoryRoot?: string
}

function isPackageRoot(candidate: string, expectedNames: string[]): boolean {
  if (!fs.existsSync(path.join(candidate, 'lib', 'index.js'))) return false
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(candidate, 'package.json'), 'utf-8'))
    return expectedNames.includes(String(manifest?.name || ''))
  } catch {
    return false
  }
}

function findDirectPackage(root: string, subPaths: string[], expectedNames: string[]): string | null {
  for (const subPath of subPaths) {
    const candidate = path.join(root, 'node_modules', subPath)
    if (isPackageRoot(candidate, expectedNames)) return candidate
  }
  return null
}

function findPnpmPackage(root: string, prefixes: string[], subPaths: string[], expectedNames: string[]): string | null {
  const pnpmDir = path.join(root, 'node_modules', '.pnpm')
  let entries: string[] = []
  try {
    entries = fs.readdirSync(pnpmDir).sort()
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!prefixes.some(prefix => entry.startsWith(prefix))) continue
    for (const subPath of subPaths) {
      const candidate = path.join(pnpmDir, entry, 'node_modules', subPath)
      if (isPackageRoot(candidate, expectedNames)) return candidate
    }
  }
  return null
}

function findPair(root: string): WhatsAppDependencyPaths {
  const baileysNames = ['baileys', '@whiskeysockets/baileys']
  const baileysSubPaths = ['baileys', path.join('@whiskeysockets', 'baileys')]
  const baileys = findDirectPackage(root, baileysSubPaths, baileysNames)
    || findPnpmPackage(root, ['baileys@', '@whiskeysockets+baileys@'], baileysSubPaths, baileysNames)
  const boom = findDirectPackage(root, [path.join('@hapi', 'boom')], ['@hapi/boom'])
    || findPnpmPackage(root, ['@hapi+boom@'], [path.join('@hapi', 'boom')], ['@hapi/boom'])
  return { baileys, boom }
}

function addCliRoots(roots: Set<string>, cliPath: string): void {
  const addForPath = (resolvedCli: string) => {
    const cliDir = path.dirname(resolvedCli)
    roots.add(path.resolve(cliDir, '..', 'src'))
    roots.add(cliDir)
    roots.add(path.dirname(cliDir))
  }
  addForPath(cliPath)
  try {
    addForPath(fs.realpathSync(cliPath))
  } catch {}
}

function addExternalPluginRoots(roots: Set<string>, homeDir: string): void {
  const projectsDir = path.join(homeDir, '.openclaw', 'npm', 'projects')
  try {
    for (const entry of fs.readdirSync(projectsDir).sort()) {
      if (entry.startsWith('openclaw-whatsapp-')) roots.add(path.join(projectsDir, entry))
    }
  } catch {}
}

/** Resolve WhatsApp's runtime libraries across OpenClaw 1.x and 2.x layouts. */
export function resolveWhatsAppDependencyPaths(
  options: ResolveWhatsAppDependencyOptions = {},
): WhatsAppDependencyPaths {
  const homeDir = options.homeDir || process.env.HOME || ''
  const roots = new Set<string>()
  if (options.cliPath) addCliRoots(roots, options.cliPath)
  addExternalPluginRoots(roots, homeDir)
  if (options.repositoryRoot) roots.add(options.repositoryRoot)

  // Retain compatibility with conventional source checkouts without assuming
  // a particular GitHub account name.
  roots.add(path.join(homeDir, 'github', 'openclaw'))
  try {
    for (const owner of fs.readdirSync(path.join(homeDir, 'github')).sort()) {
      roots.add(path.join(homeDir, 'github', owner, 'openclaw'))
    }
  } catch {}

  for (const root of roots) {
    const result = findPair(root)
    if (result.baileys && result.boom) return result
  }
  return { baileys: null, boom: null }
}
