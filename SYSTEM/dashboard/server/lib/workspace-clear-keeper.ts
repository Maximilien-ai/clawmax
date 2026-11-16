import fs from 'fs'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import { WorkspaceClearError } from './workspace-clear'

export const KEEPER_ID = 'clawmax-runtime-keeper'
const MARKER = 'clawmax-personal-clear-keeper-v1\n'

/** A narrowly owned reservation survives ambiguous RPC results and process restarts.
 * Never adopt an existing registration or storage merely because its name matches.
 */
export function inspectClearKeeper(state: string, config: any, workspaceRoots: string[]) {
  const directory = path.join(state, 'workspace-clear-keeper')
  const marker = path.join(directory, '.owner')
  const workspace = path.join(directory, 'workspace')
  const agentDir = path.join(state, 'agents', KEEPER_ID, 'agent')
  const entry = { name: 'ClawMax runtime keeper', workspace, agentDir, skills: [], heartbeat: { every: '0m' }, tools: { deny: ['*'] } }
  const refuse = () => { throw new WorkspaceClearError('Runtime keeper ownership or configuration requires manual review; no Personal content was cleared.') }
  if (config.agents?.ownership !== 'explicit' || !config.agents?.entries || config.agents.list) refuse()
  if (fs.realpathSync(state) !== state) refuse()
  if (workspaceRoots.some(root => directory === root || directory.startsWith(root + path.sep) || root.startsWith(directory + path.sep))) refuse()
  // Validate each existing path component, including dangling links.
  for (const target of [directory, workspace, path.join(state, 'agents'), path.dirname(agentDir), agentDir]) {
    try { if (!fs.lstatSync(target).isDirectory() || fs.realpathSync(target) !== target) refuse() }
    catch (error: any) { if (error.code !== 'ENOENT') throw error }
  }
  let owned = false
  try {
    const info = fs.lstatSync(marker)
    if (!info.isFile() || info.nlink !== 1 || fs.readFileSync(marker, 'utf8') !== MARKER) refuse()
    owned = true
  } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  const existing = config.agents.entries[KEEPER_ID]
  if (!owned && (existing || fs.existsSync(directory) || fs.existsSync(path.dirname(agentDir)))) refuse()
  if (existing && !isDeepStrictEqual(existing, entry)) refuse()
  return { directory, marker, entry, owned, registered: !!existing }
}

export async function ensureClearKeeper(options: {
  state: string; workspaceRoots: string[]; readConfig: () => any
  revision: () => Promise<string>; create: (entry: Record<string, unknown>, revision: string) => Promise<void>
}) {
  const revision = await options.revision()
  const plan = inspectClearKeeper(options.state, options.readConfig(), options.workspaceRoots)
  if (plan.registered) return
  if (!plan.owned) {
    fs.mkdirSync(plan.directory, { mode: 0o700 })
    fs.writeFileSync(plan.marker, MARKER, { flag: 'wx', mode: 0o600 })
  }
  // Do not copy credentials or rewrite defaults, bindings, or any other entry.
  await options.create(plan.entry, revision)
  if (!inspectClearKeeper(options.state, options.readConfig(), options.workspaceRoots).registered) {
    throw new WorkspaceClearError('Runtime keeper registration was not verified; retry clearing Personal.')
  }
}
