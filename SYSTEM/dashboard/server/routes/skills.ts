import express from 'express'
import {
  listAvailableSkills,
  getSkillById,
  getSkillContent,
  getAgentSkills,
  setAgentSkills,
  validateSkills,
  createCustomSkill,
  importWorkspaceSkill,
  deleteWorkspaceSkill,
  updateSkillContent,
  getSkillRequirementInstallCommands,
  getSkillSetupCommands,
  validateSkillChanges,
  stampImportedRegistrySkillMetadata,
  getWorkspaceSkillsDir,
} from '../lib/skills'
import { extractZipBufferToWorkspace, resolveWorkspacePath } from '../lib/workspace'
import { getCuratedPartnerInstaller, listCuratedPartnerInstallers } from '../lib/partner-installs'
import { generateSkillFromNL, setRequestByokKeys, warmOpenAiCompatibleGenerationModel } from '../lib/ai-generator'
import { safeEnv } from '../lib/safe-env'
import {
  buildSkillRegistryInstallCommands,
  buildSkillRegistrySearchCommands,
  discoverInstalledRegistrySkillDirs,
  getSkillRegistryProviderMeta,
  getTesslInstallBlockerMessage,
  normalizeSkillRegistryProvider,
  normalizeSkillRegistrySearchResults,
  parseRegistryJsonOutput,
  resolveImportableRegistrySkillDirs,
  selectBestRegistryInstallName,
} from '../lib/skill-registry'
import { exec } from 'child_process'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getRequestDashboardInstanceId, traceAgentChat } from '../lib/opik'
import { randomUUID } from 'crypto'

const execAsync = promisify(exec)
const execFileAsync = promisify(require('child_process').execFile)
const router = express.Router()

function getNativeDirectoryPickerSupportForRuntime(
  platform = process.platform,
  hasOsaScript = fs.existsSync('/usr/bin/osascript'),
) {
  const managedSkillsDir = getWorkspaceSkillsDir()
  if (platform !== 'darwin') {
    return {
      available: false,
      status: 501,
      suggestedPath: managedSkillsDir,
      error: `Browse is only available when the dashboard itself is running directly on macOS. If this is a cloud, container, or remote/on-prem dashboard, use a path inside that runtime instead of a path on your laptop. Managed custom skills live under ${managedSkillsDir}.`,
    }
  }
  if (!hasOsaScript) {
    return {
      available: false,
      status: 501,
      suggestedPath: managedSkillsDir,
      error: `Browse is unavailable in this dashboard runtime because macOS osascript support is missing. Use a path that exists inside this runtime instead of a path on your local machine. Managed custom skills live under ${managedSkillsDir}.`,
    }
  }
  return { available: true, status: 200 }
}

function getLocalSkillImportSourcePathGuidance(sourcePath: string) {
  const managedSkillsDir = getWorkspaceSkillsDir()
  return `Source path "${sourcePath}" was not found in this dashboard runtime. If this dashboard is running in cloud, a container, or a remote/on-prem server, a path from your laptop (for example /Users/...) will not exist there. Paste a path that exists inside the dashboard runtime, or copy/mount the skill directory there first. Managed custom skills live under ${managedSkillsDir}.`
}

function isSingleSkillDirectory(sourcePath: string) {
  return fs.existsSync(path.join(sourcePath, 'SKILL.md')) || fs.existsSync(path.join(sourcePath, 'skill.md'))
}

function detectImportableSkillRoot(sourcePath: string) {
  const trimmedPath = sourcePath.trim()
  if (!trimmedPath) {
    return { ok: false as const, error: 'sourcePath is required' }
  }

  if (!fs.existsSync(trimmedPath)) {
    return {
      ok: false as const,
      error: getLocalSkillImportSourcePathGuidance(trimmedPath),
      suggestedPath: getWorkspaceSkillsDir(),
    }
  }

  if (!fs.statSync(trimmedPath).isDirectory()) {
    return { ok: false as const, error: 'sourcePath must be a directory' }
  }

  const skillsSubdir = path.join(trimmedPath, 'skills')
  const isSingleSkill = isSingleSkillDirectory(trimmedPath)
  const hasSkillsDir = fs.existsSync(skillsSubdir) && fs.statSync(skillsSubdir).isDirectory()

  if (isSingleSkill || hasSkillsDir) {
    return { ok: true as const, sourcePath: trimmedPath }
  }

  const childDirs = fs.readdirSync(trimmedPath)
    .map((entry) => path.join(trimmedPath, entry))
    .filter((entryPath) => {
      try {
        return fs.statSync(entryPath).isDirectory()
      } catch {
        return false
      }
    })

  if (childDirs.length === 1) {
    const nestedRoot = childDirs[0]
    const nestedSkillsSubdir = path.join(nestedRoot, 'skills')
    if (
      isSingleSkillDirectory(nestedRoot) ||
      (fs.existsSync(nestedSkillsSubdir) && fs.statSync(nestedSkillsSubdir).isDirectory())
    ) {
      return { ok: true as const, sourcePath: nestedRoot }
    }
  }

  return {
    ok: false as const,
    error: 'Uploaded archive did not contain a skill directory or a skills/ bundle. ZIP files should contain a single skill folder with SKILL.md or a multi-skill bundle with a skills/ directory.',
  }
}

function importSkillsFromDirectory(sourcePath: string) {
  const detected = detectImportableSkillRoot(sourcePath)
  if (!detected.ok) {
    return {
      ok: false as const,
      status: 400,
      error: detected.error,
      suggestedPath: 'suggestedPath' in detected ? detected.suggestedPath : undefined,
    }
  }

  const resolvedSourcePath = detected.sourcePath
  const skillsSubdir = path.join(resolvedSourcePath, 'skills')
  const isSingleSkill = isSingleSkillDirectory(resolvedSourcePath)
  const hasSkillsDir = fs.existsSync(skillsSubdir) && fs.statSync(skillsSubdir).isDirectory()

  if (hasSkillsDir && !isSingleSkill) {
    const skillDirs = fs.readdirSync(skillsSubdir).filter((d: string) => {
      const sp = path.join(skillsSubdir, d)
      if (!fs.statSync(sp).isDirectory()) return false
      return isSingleSkillDirectory(sp)
    })

    if (skillDirs.length === 0) {
      return {
        ok: false as const,
        status: 400,
        error: 'No skills found in skills/ directory (each skill needs a SKILL.md)',
      }
    }

    const results: { skillId: string; ok: boolean; error?: string; warning?: string }[] = []
    for (const dir of skillDirs) {
      const result = importWorkspaceSkill(path.join(skillsSubdir, dir))
      results.push({ skillId: result.skillId || dir, ok: result.success, error: result.error, warning: result.warning })
    }

    const imported = results.filter((r) => r.ok)
    return {
      ok: true as const,
      status: 200,
      body: {
        ok: imported.length > 0,
        imported: imported.length,
        failed: results.length - imported.length,
        total: results.length,
        skills: results,
      },
    }
  }

  const result = importWorkspaceSkill(resolvedSourcePath)
  if (!result.success) {
    return {
      ok: false as const,
      status: 400,
      error: result.error || 'Failed to import skill',
    }
  }

  return {
    ok: true as const,
    status: 200,
    body: { ok: true, skillId: result.skillId, imported: 1, total: 1, warning: result.warning },
  }
}

type SkillSetupSession = {
  id: string
  skillId: string
  process: ChildProcessWithoutNullStreams
  logs: string[]
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  endedAt?: number
  exitCode?: number | null
  error?: string
}

async function getCuratedPartnerPluginStatuses() {
  const installers = listCuratedPartnerInstallers()
  const result: any = await execFileAsync('openclaw', ['plugins', 'list', '--json'], {
    timeout: 30000,
    env: safeEnv(),
    maxBuffer: 1024 * 1024 * 8,
  })
  const stdout = typeof result === 'string' ? result : result?.stdout
  const parsed = JSON.parse(String(stdout || '{}'))
  const plugins = Array.isArray(parsed?.plugins) ? parsed.plugins : []
  const byId = new Map(plugins.map((plugin: any) => [String(plugin?.id || ''), plugin]))
  return Object.fromEntries(
    installers.map((installer) => {
      const plugin = byId.get(installer.pluginId) as any
      return [installer.commandId, {
        commandId: installer.commandId,
        pluginId: installer.pluginId,
        installed: !!plugin,
        enabled: !!plugin?.enabled,
        status: plugin?.status || (plugin ? 'installed' : 'not-installed'),
        name: plugin?.name || installer.label,
        version: plugin?.version || '',
        origin: plugin?.origin || '',
      }]
    })
  )
}

function buildUnknownCuratedPartnerPluginStatuses() {
  return Object.fromEntries(
    listCuratedPartnerInstallers().map((installer) => [installer.commandId, {
      commandId: installer.commandId,
      pluginId: installer.pluginId,
      installed: false,
      enabled: false,
      status: 'unknown',
      name: installer.label,
    }])
  )
}

const interactiveSkillSetupSessions = new Map<string, SkillSetupSession>()

function summarizeGitHubImportFailures(
  failures: Array<{ skillId: string; error?: string }>
): string {
  const details = failures
    .map((failure) => `${failure.skillId}: ${failure.error || 'Unknown import failure'}`)
    .join('; ')
  return `Failed to import skills from GitHub. ${details}`
}

function normalizeGitHubImportResults<T extends { skillId: string; ok: boolean; error?: string; warning?: string }>(
  results: T[],
) {
  const normalized = results.map((result) => {
    if (!result.ok && /already exists/i.test(result.error || '')) {
      return {
        ...result,
        ok: true,
        warning: result.warning || `Skill "${result.skillId}" is already installed`,
        alreadyPresent: true,
      }
    }
    return {
      ...result,
      alreadyPresent: false,
    }
  })

  const imported = normalized.filter((result) => result.ok && !result.alreadyPresent)
  const existing = normalized.filter((result) => result.alreadyPresent)
  const failed = normalized.filter((result) => !result.ok)

  return { normalized, imported, existing, failed }
}

function trimTrailingLines(lines: string[], maxLines = 400) {
  return lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines
}

function buildInteractiveSetupCommand(
  skill: ReturnType<typeof getSkillById>,
  inputs: Record<string, string>
): { command: string; args: string[]; display: string } | null {
  if (!skill?.setupRequirements?.actionId) return null

  if (skill.setupRequirements.actionId === 'himalaya-account-configure') {
    const accountName = String(inputs.accountName || '').trim()
    const configPath = String(inputs.configPath || '').trim()
    if (!accountName) {
      throw new Error('Account name is required for Himalaya setup')
    }

    const args = ['account', 'configure', accountName]
    if (configPath) {
      args.push('--config', configPath)
    }
    return {
      command: 'himalaya',
      args,
      display: `himalaya ${args.join(' ')}`,
    }
  }

  return null
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function spawnInteractiveSetupProcess(command: string, args: string[]) {
  if (process.platform === 'darwin') {
    return spawn('script', ['-q', '/dev/null', command, ...args], {
      env: safeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  const rendered = [command, ...args].map(shellQuote).join(' ')
  return spawn('script', ['-qfc', rendered, '/dev/null'], {
    env: safeEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

type RegistryResultMetadata = {
  name?: string
  full_name?: string
  install_name?: string
  description?: string
  latest_version?: string
  downloads_weekly?: number
  categories?: string[]
  homepage?: string
  emoji?: string
  raw?: any
}

function extractRegistryMetadata(raw: RegistryResultMetadata | undefined) {
  if (!raw) return undefined
  return {
    installName: raw.install_name || raw.full_name || raw.name,
    version: raw.latest_version,
    downloadsWeekly: typeof raw.downloads_weekly === 'number' ? raw.downloads_weekly : undefined,
    categories: Array.isArray(raw.categories) ? raw.categories.filter(Boolean).map((value) => String(value).trim()) : [],
    homepage: raw.homepage || raw.raw?.homepage || raw.raw?.url || raw.raw?.repositoryUrl || raw.raw?.repository_url,
    emoji: raw.emoji || raw.raw?.emoji || raw.raw?.icon,
  }
}

function getRegistryInstallUnavailableMessage(provider: 'clawhub' | 'shipables' | 'tessl') {
  if (provider === 'clawhub') {
    return 'ClawHub install needs Node.js and npx in this runtime. Verify the dashboard runtime has the required CLI prerequisites, then retry the install.'
  }
  if (provider === 'tessl') {
    return 'Tessl install needs the Tessl CLI or npx access in this runtime. Verify the runtime prerequisites, then retry the install.'
  }
  return 'Registry install needs the provider CLI available in this runtime. Verify the runtime prerequisites, then retry the install.'
}

function getRegistryUnsupportedFormatMessage(provider: 'clawhub' | 'shipables' | 'tessl') {
  if (provider === 'clawhub') {
    return 'ClawHub install completed, but no importable OpenClaw skill files were found. The package may not expose a compatible SKILL.md-based layout for this runtime yet.'
  }
  if (provider === 'tessl') {
    return 'No skill files found after install. The skill may use a format not yet supported.'
  }
  return 'No skill files found after install. The skill may use a format not yet supported.'
}

// GET /api/skills/browse-directory - Show native directory picker (macOS)
router.get('/browse-directory', async (req, res) => {
  try {
    const support = getNativeDirectoryPickerSupportForRuntime()
    if (!support.available) {
      return res.status(support.status).json({
        error: support.error,
        supported: false,
        canPastePath: true,
        suggestedPath: support.suggestedPath || null,
        path: support.suggestedPath || null,
      })
    }

    // Use macOS osascript to show native directory picker
    const script = `/usr/bin/osascript -e 'POSIX path of (choose folder with prompt "Select skill directory")'`

    const { stdout, stderr } = await execAsync(script)

    if (stderr) {
      console.error('Directory picker error:', stderr)
      return res.status(500).json({ error: 'Failed to show directory picker' })
    }

    const selectedPath = stdout.trim()

    if (!selectedPath) {
      return res.status(400).json({ error: 'No directory selected' })
    }

    res.json({ path: selectedPath })
  } catch (err: any) {
    // User cancelled the dialog
    if (err.message?.includes('User canceled') || err.message?.includes('-128')) {
      return res.json({ path: null, cancelled: true })
    }
    if (err.code === 'ENOENT' || /osascript: not found/i.test(String(err.message || ''))) {
      const support = getNativeDirectoryPickerSupportForRuntime(process.platform, false)
      return res.status(support.status).json({
        error: support.error,
        supported: false,
        canPastePath: true,
        suggestedPath: support.suggestedPath || null,
        path: support.suggestedPath || null,
      })
    }
    console.error('Error showing directory picker:', err)
    res.status(500).json({ error: err.message || 'Failed to show directory picker' })
  }
})

export const __test = {
  getNativeDirectoryPickerSupportForRuntime,
  getLocalSkillImportSourcePathGuidance,
  detectImportableSkillRoot,
}

// POST /api/skills - Create a new custom skill
router.post('/', (req, res) => {
  try {
    const { name, description, emoji, requires, install, homepage, tags, content } = req.body

    if (!name || !description || !content) {
      return res.status(400).json({
        error: 'Missing required fields: name, description, content'
      })
    }

    const skill = createCustomSkill({
      name,
      description,
      emoji,
      requires,
      install,
      homepage,
      tags,
      content
    })

    res.json({ ok: true, skill })
  } catch (err: any) {
    console.error('Error creating skill:', err)
    res.status(400).json({ error: err.message || 'Failed to create skill' })
  }
})

// POST /api/skills/generate - AI-generate a custom skill scaffold
router.post('/generate', async (req, res) => {
  const { description, currentDraft, byokKeys } = req.body as {
    description?: string
    currentDraft?: { name?: string; description?: string; emoji?: string; tags?: string[]; content?: string }
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }

  if (!description?.trim()) {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    await warmOpenAiCompatibleGenerationModel(byokKeys)
    setRequestByokKeys(byokKeys)
    const skill = await generateSkillFromNL(description.trim(), currentDraft)
    const session = getAuthenticatedSession(req)
    traceAgentChat('ai-generate-skill', description.trim(), `Generated skill scaffold ${skill.name || 'skill'}`, {
      model: 'ai-generate-skill',
      provider: 'system',
      sessionId: `ai-generate-skill:${Date.now()}`,
      actorUserId: session?.userId,
      actorLogin: session?.login,
      actorEmail: session?.email || null,
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    })
    res.json({ ok: true, skill })
  } catch (err: any) {
    console.error('AI skill generation error:', err)
    const message = err?.message || String(err)
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({
        error: 'AI generation needs a configured OpenAI, Anthropic, or OpenAI-compatible setup, or a shared preferred model. Open Workspaces Integrations or Keys & Secrets first.',
      })
    }
    if (/developer API key|subscription or app credentials|does not look like/i.test(message)) {
      return res.status(400).json({ error: message })
    }
    res.status(500).json({ error: message })
  } finally {
    setRequestByokKeys(undefined)
  }
})

// GET /api/skills - List all available skills
router.get('/', (req, res) => {
  try {
    const skills = listAvailableSkills()
    res.json({ skills })
  } catch (err) {
    console.error('Error listing skills:', err)
    res.status(500).json({ error: 'Failed to load skills' })
  }
})

// GET /api/skills/partner-install/status - Report curated partner plugin install state
router.get('/partner-install/status', async (_req, res) => {
  try {
    res.json({ ok: true, statuses: await getCuratedPartnerPluginStatuses() })
  } catch (err: any) {
    console.error('Curated partner plugin status error:', err.message)
    res.status(500).json({
      error: err.message || 'Failed to inspect curated partner plugin status',
      statuses: buildUnknownCuratedPartnerPluginStatuses(),
    })
  }
})

// GET /api/skills/:skillId/content - Get raw SKILL.md content
router.get('/:skillId/content', (req, res) => {
  try {
    const { skillId } = req.params
    const result = getSkillContent(skillId)

    if (!result) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    res.json(result)
  } catch (err) {
    console.error('Error getting skill content:', err)
    res.status(500).json({ error: 'Failed to load skill content' })
  }
})

// PUT /api/skills/:skillId/content - Update raw SKILL.md content
router.put('/:skillId/content', (req, res) => {
  try {
    const { skillId } = req.params
    const { content, name, description, tags } = req.body

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' })
    }
    if (name != null && typeof name !== 'string') {
      return res.status(400).json({ error: 'name must be a string when provided' })
    }
    if (description != null && typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string when provided' })
    }
    if (tags != null && !Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags must be an array when provided' })
    }

    const result = updateSkillContent(skillId, content, {
      name,
      description,
      tags: Array.isArray(tags) ? tags : undefined,
    })
    res.json({ ok: true, ...result })
  } catch (err: any) {
    console.error('Error updating skill content:', err)
    if (err.message?.includes('read-only')) {
      return res.status(403).json({ error: err.message })
    }
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message })
    }
    if (err.message?.includes('already exists') || err.message?.includes('must contain only') || err.message?.includes('required')) {
      return res.status(400).json({ error: err.message })
    }
    res.status(500).json({ error: err.message || 'Failed to update skill content' })
  }
})

// GET /api/skills/:skillId - Get skill details
router.get('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params
    const skill = getSkillById(skillId)

    if (!skill) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    res.json(skill)
  } catch (err) {
    console.error('Error getting skill:', err)
    res.status(500).json({ error: 'Failed to load skill' })
  }
})

// POST /api/skills/:skillId/install-requirements - Install machine requirements for a skill
router.post('/:skillId/install-requirements', async (req, res) => {
  try {
    const { skillId } = req.params
    const skill = getSkillById(skillId)

    if (!skill) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    const commands = getSkillRequirementInstallCommands(skill)
    if (commands.length === 0) {
      return res.status(400).json({ error: `Skill "${skill.name}" has no dashboard-installable requirements yet` })
    }

    const outputs: Array<{ display: string; stdout?: string; stderr?: string }> = []
    for (const command of commands) {
      const { stdout, stderr } = await execFileAsync(command.command, command.args, {
        timeout: 300000,
        env: safeEnv(),
        maxBuffer: 1024 * 1024 * 8,
      })
      outputs.push({
        display: command.display,
        stdout: `${stdout || ''}`.trim() || undefined,
        stderr: `${stderr || ''}`.trim() || undefined,
      })
    }

    res.json({
      ok: true,
      skill: skill.name,
      commands: commands.map((command) => command.display),
      outputs,
    })
  } catch (err: any) {
    console.error('Skill requirement install error:', err.message)
    const detail = [err?.stderr, err?.stdout].filter(Boolean).join('\n').trim()
    res.status(500).json({
      error: err.message || 'Failed to install skill requirements',
      detail: detail || undefined,
    })
  }
})

// POST /api/skills/:skillId/complete-setup - Run guided setup commands for a skill
router.post('/:skillId/complete-setup', async (req, res) => {
  try {
    const { skillId } = req.params
    const skill = getSkillById(skillId)

    if (!skill) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    const commands = getSkillSetupCommands(skill, {
      inputs: req.body?.inputs,
    })
    if (commands.length === 0) {
      return res.status(400).json({ error: `Skill "${skill.name}" has no dashboard-guided setup flow yet` })
    }

    const outputs: Array<{ display: string; stdout?: string; stderr?: string }> = []
    for (const command of commands) {
      const { stdout, stderr } = await execFileAsync(command.command, command.args, {
        timeout: 600000,
        env: safeEnv(),
        maxBuffer: 1024 * 1024 * 8,
      })
      outputs.push({
        display: command.display,
        stdout: `${stdout || ''}`.trim() || undefined,
        stderr: `${stderr || ''}`.trim() || undefined,
      })
    }

    res.json({
      ok: true,
      skill: skill.name,
      commands: commands.map((command) => command.display),
      outputs,
    })
  } catch (err: any) {
    console.error('Skill setup error:', err.message)
    const detail = [err?.stderr, err?.stdout].filter(Boolean).join('\n').trim()
    res.status(500).json({
      error: err.message || 'Failed to complete skill setup',
      detail: detail || undefined,
    })
  }
})

// POST /api/skills/:skillId/setup-session/start - Run a constrained interactive setup session for a skill
router.post('/:skillId/setup-session/start', async (req, res) => {
  try {
    const { skillId } = req.params
    const skill = getSkillById(skillId)

    if (!skill) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    const command = buildInteractiveSetupCommand(skill, req.body?.inputs || {})
    if (!command) {
      return res.status(400).json({ error: `Skill "${skill.name}" has no interactive dashboard setup flow yet` })
    }

    const child = spawnInteractiveSetupProcess(command.command, command.args)
    const sessionId = randomUUID()
    const session: SkillSetupSession = {
      id: sessionId,
      skillId,
      process: child,
      logs: [`$ ${command.display}`],
      status: 'running',
      startedAt: Date.now(),
    }
    interactiveSkillSetupSessions.set(sessionId, session)

    const appendLog = (chunk: string) => {
      session.logs = trimTrailingLines([...session.logs, chunk])
    }

    child.stdout.on('data', (chunk) => appendLog(String(chunk)))
    child.stderr.on('data', (chunk) => appendLog(String(chunk)))
    child.on('error', (err) => {
      session.status = 'failed'
      session.error = err.message
      session.endedAt = Date.now()
      appendLog(`✗ ${err.message}`)
    })
    child.on('close', (code) => {
      session.exitCode = code
      session.endedAt = Date.now()
      if (session.status !== 'failed') {
        session.status = code === 0 ? 'completed' : 'failed'
        if (code === 0) {
          appendLog(`✓ Completed setup flow for ${skill.name}`)
        } else {
          session.error = session.error || `Setup session exited with code ${code}`
          appendLog(`✗ Setup session exited with code ${code}`)
        }
      }
    })

    res.json({
      ok: true,
      sessionId,
      skill: skill.name,
      command: command.display,
      status: session.status,
      logs: session.logs,
    })
  } catch (err: any) {
    console.error('Interactive skill setup start error:', err.message)
    res.status(500).json({
      error: err.message || 'Failed to start interactive skill setup',
    })
  }
})

// GET /api/skills/setup-session/:sessionId - Poll interactive setup session state
router.get('/setup-session/:sessionId', (req, res) => {
  const session = interactiveSkillSetupSessions.get(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Setup session not found' })
  }

  res.json({
    ok: true,
    sessionId: session.id,
    skillId: session.skillId,
    status: session.status,
    logs: session.logs,
    error: session.error,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    exitCode: session.exitCode,
  })
})

// POST /api/skills/setup-session/:sessionId/input - Send one line of input to an interactive setup session
router.post('/setup-session/:sessionId/input', (req, res) => {
  const session = interactiveSkillSetupSessions.get(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Setup session not found' })
  }
  if (session.status !== 'running') {
    return res.status(400).json({ error: 'Setup session is no longer running' })
  }

  const input = String(req.body?.input || '')
  if (!input.trim()) {
    return res.status(400).json({ error: 'input is required' })
  }

  session.logs = trimTrailingLines([...session.logs, `> ${input}`])
  session.process.stdin.write(`${input}\n`)
  res.json({ ok: true })
})

// POST /api/skills/setup-session/:sessionId/close - Stop an interactive setup session
router.post('/setup-session/:sessionId/close', (req, res) => {
  const session = interactiveSkillSetupSessions.get(req.params.sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Setup session not found' })
  }

  if (session.status === 'running') {
    session.process.kill()
    session.status = 'failed'
    session.error = session.error || 'Setup session stopped'
    session.endedAt = Date.now()
    session.logs = trimTrailingLines([...session.logs, '✗ Setup session stopped'])
  }

  res.json({ ok: true })
})

// GET /api/skills/agent/:agentId - Get agent's assigned skills
router.get('/agent/:agentId', (req, res) => {
  try {
    const { agentId } = req.params
    const skillIds = getAgentSkills(agentId)

    // Return full skill objects, not just IDs
    const allSkills = listAvailableSkills()
    const skills = skillIds
      .map(skillId => allSkills.find(s => s.name === skillId))
      .filter(Boolean)

    res.json({ skills, skillIds })
  } catch (err) {
    console.error('Error getting agent skills:', err)
    res.status(500).json({ error: 'Failed to load agent skills' })
  }
})

// PUT /api/skills/agent/:agentId - Update agent's skills via Gateway RPC
router.put('/agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills must be an array' })
    }

    const currentSkills = getAgentSkills(agentId) || []
    const validation = validateSkillChanges(currentSkills, skills)

    // Only newly added skills should block the request.
    if (validation.invalidAdded.length > 0) {
      return res.status(400).json({
        error: `Invalid skills: ${validation.invalidAdded.join(', ')}`,
        missing: validation.invalidAdded
      })
    }

    // Existing stale skills should warn but not block.
    const warnings = validation.invalidPreserved.length === 0
      ? []
      : [`Missing skills already assigned to ${agentId}: ${validation.invalidPreserved.join(', ')}`]

    // Update agent's skills with metadata stamping
    setAgentSkills(agentId, skills)

    res.json({ ok: true, skills, warnings })
  } catch (err: any) {
    console.error('Error updating agent skills:', err)

    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to update agent skills' })
  }
})

// POST /api/skills/bulk-assign - Add/remove skills for multiple agents at once
router.post('/bulk-assign', (req, res) => {
  try {
    const { agentIds, addSkills, removeSkills } = req.body

    if (!Array.isArray(agentIds) || agentIds.length === 0) {
      return res.status(400).json({ error: 'agentIds must be a non-empty array' })
    }

    const toAdd = Array.isArray(addSkills) ? addSkills : []
    const toRemove = Array.isArray(removeSkills) ? removeSkills : []

    if (toAdd.length === 0 && toRemove.length === 0) {
      return res.status(400).json({ error: 'Provide addSkills and/or removeSkills' })
    }

    // Validate skills to add exist
    if (toAdd.length > 0) {
      const validation = validateSkills(toAdd)
      if (!validation.valid) {
        return res.status(400).json({ error: `Invalid skills: ${validation.missing.join(', ')}`, missing: validation.missing })
      }
    }

    const results: Array<{ agentId: string; ok: boolean; skills?: string[]; error?: string; warnings?: string[] }> = []

    for (const agentId of agentIds) {
      try {
        const { getAgentSkills } = require('../lib/skills')
        const current: string[] = getAgentSkills(agentId) || []
        const updated = [...new Set([...current.filter(s => !toRemove.includes(s)), ...toAdd])]
        const validation = validateSkillChanges(current, updated)
        setAgentSkills(agentId, updated)
        results.push({
          agentId,
          ok: true,
          skills: updated,
          warnings: validation.invalidPreserved.length === 0
            ? []
            : [`Missing skills already assigned to ${agentId}: ${validation.invalidPreserved.join(', ')}`],
        })
      } catch (err: any) {
        results.push({ agentId, ok: false, error: err.message })
      }
    }

    const succeeded = results.filter(r => r.ok).length
    res.json({ ok: true, updated: succeeded, total: agentIds.length, results })
  } catch (err) {
    console.error('Error in bulk skill assign:', err)
    res.status(500).json({ error: 'Failed to bulk assign skills' })
  }
})

// POST /api/skills/validate - Validate skill IDs exist
router.post('/validate', (req, res) => {
  try {
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills must be an array' })
    }

    const validation = validateSkills(skills)

    res.json(validation)
  } catch (err) {
    console.error('Error validating skills:', err)
    res.status(500).json({ error: 'Failed to validate skills' })
  }
})

// POST /api/skills/import - Import workspace custom skill(s) from local directory
// Supports single skill dir or multi-skill dir (auto-detects skills/ subdirectory)
router.post('/import', (req, res) => {
  try {
    const rawSourcePath = req.body?.sourcePath
    const sourcePath = typeof rawSourcePath === 'string' ? rawSourcePath.trim() : ''
    const result = importSkillsFromDirectory(sourcePath)
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.suggestedPath ? { suggestedPath: result.suggestedPath } : {}),
      })
    }
    res.status(result.status).json(result.body)
  } catch (err: any) {
    console.error('Error importing skill:', err)
    res.status(500).json({ error: err.message || 'Failed to import skill' })
  }
})

// POST /api/skills/import-upload - Upload a ZIP archive from the client and import it into workspace custom skills
router.post('/import-upload', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const fileNameHeader = req.header('x-file-name') || req.header('x-upload-file-name') || ''
  const fileName = path.basename(fileNameHeader.trim())
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || [])

  if (!fileName) {
    return res.status(400).json({ error: 'x-file-name header required' })
  }
  if (!fileName.toLowerCase().endsWith('.zip')) {
    return res.status(400).json({ error: 'Only .zip skill uploads are supported right now' })
  }
  if (!body.length) {
    return res.status(400).json({ error: 'File body required' })
  }

  const stagingRelDir = path.posix.join('SYSTEM', '.skill-imports', randomUUID())
  const stagingAbsDir = resolveWorkspacePath(stagingRelDir)
  if (!stagingAbsDir) {
    return res.status(500).json({ error: 'Failed to prepare workspace staging directory for skill upload' })
  }

  try {
    const extracted = extractZipBufferToWorkspace(stagingRelDir, body)
    if (!extracted.ok) {
      return res.status(400).json({ error: extracted.error || 'Failed to extract ZIP archive' })
    }

    const result = importSkillsFromDirectory(stagingAbsDir)
    if (!result.ok) {
      return res.status(result.status).json({
        error: result.error,
        ...(result.suggestedPath ? { suggestedPath: result.suggestedPath } : {}),
      })
    }

    return res.status(result.status).json({
      ...result.body,
      upload: {
        fileName,
        extractedFiles: extracted.files?.length || 0,
      },
    })
  } catch (err: any) {
    console.error('Error importing uploaded skill ZIP:', err)
    return res.status(500).json({ error: err.message || 'Failed to import uploaded skill ZIP' })
  } finally {
    try {
      fs.rmSync(stagingAbsDir, { recursive: true, force: true })
    } catch {}
  }
})

// POST /api/skills/import-github - Clone and import skill(s) from GitHub
// Supports single-skill repos and multi-skill repos (auto-detects skills/ subdirectory)
router.post('/import-github', async (req, res) => {
  try {
    const { githubUrl, subdir } = req.body

    if (!githubUrl) {
      return res.status(400).json({ error: 'githubUrl is required' })
    }

    // Normalize: strip trailing slashes
    const normalizedUrl = githubUrl.replace(/\/+$/, '')

    // Validate GitHub URL format — strict HTTPS-only check to prevent command injection
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/.test(normalizedUrl)) {
      return res.status(400).json({ error: 'Only HTTPS GitHub URLs are allowed (https://github.com/user/repo)' })
    }

    // Extract repo name from URL
    const urlParts = normalizedUrl.replace(/\.git$/, '').split('/')
    const repoName = urlParts[urlParts.length - 1]

    if (!repoName) {
      return res.status(400).json({ error: 'Could not parse repository name from URL' })
    }

    if (subdir && (typeof subdir !== 'string' || path.isAbsolute(subdir) || subdir.split(/[\\/]+/).includes('..'))) {
      return res.status(400).json({ error: 'Subdirectory must stay inside the cloned repository' })
    }

    const os = require('os')

    const tempDir = path.join(os.tmpdir(), `openclaw-skill-${Date.now()}`)

    try {
      // Clone the repository
      console.log(`Cloning ${normalizedUrl} to ${tempDir}`)
      require('child_process').execFileSync('git', ['clone', '--depth', '1', normalizedUrl, tempDir], { stdio: 'pipe' })

      // Determine import root: subdir override, or auto-detect
      let importRoot = tempDir
      if (subdir) {
        importRoot = path.resolve(tempDir, subdir)
        if (importRoot !== tempDir && !importRoot.startsWith(`${tempDir}${path.sep}`)) {
          throw new Error('Subdirectory must stay inside the cloned repository')
        }
        if (!fs.existsSync(importRoot)) {
          throw new Error(`Subdirectory "${subdir}" not found in repository`)
        }
      }

      // Check if this is a multi-skill repo (has skills/ directory with subdirs containing SKILL.md)
      const skillsDir = path.join(importRoot, 'skills')
      const hasSkillsDir = fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()

      // Also check if importRoot itself is a single skill (has SKILL.md or skill.md)
      const isSingleSkill = fs.existsSync(path.join(importRoot, 'SKILL.md')) ||
                            fs.existsSync(path.join(importRoot, 'skill.md')) ||
                            fs.existsSync(path.join(importRoot, 'index.ts'))

      if (hasSkillsDir && !isSingleSkill) {
        // Multi-skill repo: import each subdirectory under skills/
        const skillDirs = fs.readdirSync(skillsDir).filter((d: string) => {
          const skillPath = path.join(skillsDir, d)
          if (!fs.statSync(skillPath).isDirectory()) return false
          // Must have SKILL.md or skill.md
          return fs.existsSync(path.join(skillPath, 'SKILL.md')) ||
                 fs.existsSync(path.join(skillPath, 'skill.md'))
        })

        if (skillDirs.length === 0) {
          throw new Error('No skills found in skills/ directory (each skill needs a SKILL.md)')
        }

        const results: { skillId: string; ok: boolean; error?: string; warning?: string }[] = []
        for (const dir of skillDirs) {
          const result = importWorkspaceSkill(path.join(skillsDir, dir))
          results.push({
            skillId: result.skillId || dir,
            ok: result.success,
            error: result.error,
            warning: result.warning,
          })
        }

        // Clean up
        fs.rmSync(tempDir, { recursive: true, force: true })

        const { normalized, imported, existing, failed } = normalizeGitHubImportResults(results)

        if (imported.length === 0 && existing.length === 0) {
          return res.status(400).json({
            error: summarizeGitHubImportFailures(failed),
            imported: 0,
            failed: failed.length,
            existing: 0,
            total: results.length,
            skills: results,
          })
        }

        res.json({
          ok: imported.length > 0 || existing.length > 0,
          imported: imported.length,
          failed: failed.length,
          existing: existing.length,
          total: results.length,
          skills: normalized,
          warning: imported.length === 0 && existing.length > 0
            ? 'All requested skills are already installed.'
            : undefined,
        })
      } else {
        // Single skill: import directly
        const result = importWorkspaceSkill(importRoot)

        // Clean up
        fs.rmSync(tempDir, { recursive: true, force: true })

        if (!result.success && /already exists/i.test(result.error || '')) {
          return res.json({
            ok: true,
            skillId: result.skillId || repoName,
            imported: 0,
            existing: 1,
            total: 1,
            warning: `Skill "${result.skillId || repoName}" is already installed`,
          })
        }

        if (!result.success) {
          return res.status(400).json({ error: result.error })
        }

        res.json({ ok: true, skillId: result.skillId, imported: 1, existing: 0, total: 1, warning: result.warning })
      }
    } catch (cloneErr: any) {
      // Clean up on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
      throw cloneErr
    }
  } catch (err: any) {
    console.error('Error importing GitHub skill:', err)
    res.status(500).json({ error: err.message || 'Failed to import skill from GitHub' })
  }
})

// DELETE /api/skills/:skillId - Delete workspace custom skill
router.delete('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params

    const result = deleteWorkspaceSkill(skillId)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ ok: true })
  } catch (err: any) {
    console.error('Error deleting skill:', err)
    res.status(500).json({ error: err.message || 'Failed to delete skill' })
  }
})

// ============================================================================
// Skills Registry Integration
// ============================================================================

router.get('/registry/search', async (req, res) => {
  const provider = normalizeSkillRegistryProvider(req.query.provider as string | undefined)
  try {
    const query = (req.query.q as string || '').trim()
    const limit = parseInt(req.query.limit as string) || 20

    if (provider === 'clawhub') {
      const endpoint = query
        ? `https://clawhub.dev/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`
        : `https://clawhub.dev/api/v1/explore?limit=${limit}`
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`ClawHub search failed with HTTP ${response.status}`)
      }
      const parsed = await response.json()
      const normalized = normalizeSkillRegistrySearchResults(provider, parsed)
      return res.json({ ok: true, provider, ...normalized, meta: getSkillRegistryProviderMeta(provider) })
    }

    const commands = buildSkillRegistrySearchCommands(provider, query, limit)

    let lastError: any = null
    for (const candidate of commands) {
      try {
        const { stdout } = await execFileAsync(candidate.command, candidate.args, {
          timeout: candidate.timeout,
          env: safeEnv(),
          maxBuffer: 1024 * 1024 * 8,
        })
        const parsed = parseRegistryJsonOutput(stdout)
        const normalized = normalizeSkillRegistrySearchResults(provider, parsed)
        return res.json({ ok: true, provider, ...normalized, meta: getSkillRegistryProviderMeta(provider) })
      } catch (err: any) {
        lastError = err
      }
    }

    if (lastError?.code === 'ENOENT' || lastError?.message?.includes('not found')) {
      return res.json({ ok: true, provider, results: [], warning: `${getSkillRegistryProviderMeta(provider).label} CLI not available`, meta: getSkillRegistryProviderMeta(provider) })
    }
    console.error(`${provider} search error:`, lastError?.message)
    res.json({ ok: true, provider, results: [], error: lastError?.message, meta: getSkillRegistryProviderMeta(provider) })
  } catch (err: any) {
    console.error('Registry search error:', err.message)
    res.json({ ok: true, provider, results: [], error: err.message, meta: getSkillRegistryProviderMeta(provider) })
  }
})

router.get('/registry/info/:name', async (req, res) => {
  const provider = normalizeSkillRegistryProvider(req.query.provider as string | undefined)
  try {
    const { name } = req.params
    if (!name || !/^[@a-z0-9._-]+$/i.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name' })
    }

    if (provider !== 'shipables') {
      return res.status(400).json({ error: `Registry info is not yet available for ${getSkillRegistryProviderMeta(provider).label}` })
    }

    const { stdout } = await execAsync(`npx @senso-ai/shipables info "${name}" --json`, {
      timeout: 15000,
    })

    const info = JSON.parse(stdout)
    res.json({ ok: true, provider, skill: info, meta: getSkillRegistryProviderMeta(provider) })
  } catch (err: any) {
    console.error('Registry info error:', err.message)
    res.status(404).json({ error: `Skill not found: ${req.params.name}` })
  }
})

router.post('/registry/install', async (req, res) => {
  const provider = normalizeSkillRegistryProvider(req.body?.provider)
  try {
    let { name } = req.body
    const registryResult = req.body?.registryResult as RegistryResultMetadata | undefined
    const overwrite = req.body?.overwrite === true
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Skill name is required' })
    }

    // Validate name format
    if (!/^[@a-z0-9._/-]+$/i.test(name)) {
      return res.status(400).json({ error: 'Invalid skill name format' })
    }

    const os = require('os')
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${provider}-`))

    try {
      if (provider === 'tessl' && !name.includes('/')) {
        let searchResolved = name
        const searchCommands = buildSkillRegistrySearchCommands(provider, name, 20)
        for (const candidate of searchCommands) {
          try {
            const { stdout } = await execFileAsync(candidate.command, candidate.args, {
              timeout: candidate.timeout,
              cwd: tmpDir,
              env: safeEnv(),
              maxBuffer: 1024 * 1024 * 8,
            })
            const parsed = parseRegistryJsonOutput(stdout || '{}')
            const normalized = normalizeSkillRegistrySearchResults(provider, parsed)
            searchResolved = selectBestRegistryInstallName(provider, name, normalized.results || [])
            break
          } catch {
            // Fall through to install with original name if search resolution fails.
          }
        }
        name = searchResolved
      }

      const commands = buildSkillRegistryInstallCommands(provider, name)
      let lastError: any = null
      let lastOutput = ''
      for (const candidate of commands) {
        try {
          const result = await execFileAsync(candidate.command, candidate.args, {
            timeout: candidate.timeout,
            cwd: tmpDir,
            env: safeEnv(),
            maxBuffer: 1024 * 1024 * 8,
          })
          lastOutput = `${result.stdout || ''}\n${result.stderr || ''}`
          lastError = null
          break
        } catch (err: any) {
          lastOutput = `${err?.stdout || ''}\n${err?.stderr || ''}`
          lastError = err
        }
      }

      if (lastError) {
        if (lastError?.code === 'ENOENT' || lastError?.message?.includes('not found')) {
          return res.status(400).json({
            error: getRegistryInstallUnavailableMessage(provider),
            source: provider,
            meta: getSkillRegistryProviderMeta(provider),
          })
        }
        if (provider === 'tessl') {
          const blocker = getTesslInstallBlockerMessage(lastOutput)
          if (blocker) {
            return res.status(400).json({ error: blocker })
          }
        }
        throw lastError
      }

      const discoveredSkillDirs = discoverInstalledRegistrySkillDirs(provider, tmpDir)
      const skillDirs = resolveImportableRegistrySkillDirs(provider, discoveredSkillDirs)

      if (skillDirs.length === 0) {
        if (provider === 'tessl') {
          const blocker = getTesslInstallBlockerMessage(lastOutput)
          if (blocker) {
            return res.status(400).json({ error: blocker })
          }
        }
        return res.status(400).json({
          error: getRegistryUnsupportedFormatMessage(provider),
          source: provider,
          meta: getSkillRegistryProviderMeta(provider),
        })
      }

      const { getWorkspacePath } = require('../lib/workspace')
      const customSkillsDir = path.join(getWorkspacePath(), 'SKILLS', 'custom')
      fs.mkdirSync(customSkillsDir, { recursive: true })

      const results: Array<{ name: string; ok: boolean; error?: string }> = []
      for (const skillDir of skillDirs) {
        const dirName = path.basename(skillDir)
        try {
          // Try standard import first
          let result = importWorkspaceSkill(skillDir)
          if (!result.success && /already exists/i.test(result.error || '') && overwrite) {
            const deleted = deleteWorkspaceSkill(dirName)
            if (!deleted.success) {
              results.push({ name: dirName, ok: false, error: deleted.error || `Failed to replace existing skill "${dirName}"` })
              continue
            }
            result = importWorkspaceSkill(skillDir)
          }
          if (result.success) {
            stampImportedRegistrySkillMetadata(path.join(customSkillsDir, result.skillId || dirName), {
              provider,
              registryName: name,
              ...extractRegistryMetadata(registryResult),
            })
            results.push({ name: dirName, ok: true })
            continue
          }

          // Fallback: direct copy for Shipables format (SKILL.md without index.ts)
          const targetDir = path.join(customSkillsDir, dirName)
          if (fs.existsSync(targetDir)) {
            if (overwrite) {
              const deleted = deleteWorkspaceSkill(dirName)
              if (!deleted.success) {
                results.push({ name: dirName, ok: false, error: deleted.error || `Failed to replace existing skill "${dirName}"` })
                continue
              }
            } else {
              results.push({ name: dirName, ok: false, error: `Skill "${dirName}" already exists` })
              continue
            }
          }

          // Copy entire directory recursively
          fs.cpSync(skillDir, targetDir, { recursive: true })

          // Ensure SKILL.md exists (rename skill.md if needed)
          if (!fs.existsSync(path.join(targetDir, 'SKILL.md')) && fs.existsSync(path.join(targetDir, 'skill.md'))) {
            fs.renameSync(path.join(targetDir, 'skill.md'), path.join(targetDir, 'SKILL.md'))
          }

          stampImportedRegistrySkillMetadata(targetDir, {
            provider,
            registryName: name,
            ...extractRegistryMetadata(registryResult),
          })

          results.push({ name: dirName, ok: true })
        } catch (err: any) {
          results.push({ name: dirName, ok: false, error: err.message })
        }
      }

      const succeeded = results.filter(r => r.ok).length
      const conflicts = results.filter(r => !r.ok && /already exists/i.test(r.error || ''))

      if (succeeded === 0 && conflicts.length > 0 && !overwrite) {
        return res.status(409).json({
          error: `Skill already exists: ${conflicts.map((item) => item.name).join(', ')}`,
          canOverwrite: true,
          conflicts: conflicts.map((item) => item.name),
          source: provider,
          meta: getSkillRegistryProviderMeta(provider),
        })
      }

      res.json({
        ok: succeeded > 0,
        installed: succeeded,
        total: results.length,
        replaced: overwrite ? conflicts.length : 0,
        results,
        source: provider,
        meta: getSkillRegistryProviderMeta(provider),
      })
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    }
  } catch (err: any) {
    console.error('Registry install error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to install skill from registry' })
  }
})

function runPartnerCommand(command: string, args: string[], options: { input?: string; timeoutMs?: number } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: safeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeoutMs = options.timeoutMs || 180000
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      const err: any = new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`)
      err.stdout = stdout
      err.stderr = stderr
      reject(err)
    }, timeoutMs)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', (error: any) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
        return
      }
      const err: any = new Error(`${command} ${args.join(' ')} failed with code ${code}`)
      err.stdout = stdout
      err.stderr = stderr
      reject(err)
    })
    child.stdin.write(options.input || '')
    child.stdin.end()
  })
}

async function runCuratedPartnerInstaller(req: any, res: any, action: 'install' | 'uninstall') {
  try {
    const { commandId } = req.body
    if (!commandId || typeof commandId !== 'string') {
      return res.status(400).json({ error: 'commandId is required' })
    }

    const installer = getCuratedPartnerInstaller(commandId)
    if (!installer) {
      return res.status(400).json({ error: 'Unknown curated partner installer' })
    }

    const commandParts = action === 'install' ? installer.installCommand : installer.uninstallCommand
    const [command, ...args] = commandParts
    const { stdout, stderr } = await runPartnerCommand(command, args, {
      input: action === 'uninstall' ? 'y\n' : '',
      timeoutMs: 180000,
    })
    res.json({
      ok: true,
      action,
      commandId: installer.commandId,
      label: installer.label,
      command: commandParts.join(' '),
      stdout: `${stdout || ''}`.trim(),
      stderr: `${stderr || ''}`.trim(),
    })
  } catch (err: any) {
    console.error(`Curated partner ${action} error:`, err.message)
    const detail = [err?.stderr, err?.stdout].filter(Boolean).join('\n').trim()
    res.status(500).json({
      error: err.message || `Failed to run curated partner ${action}`,
      detail: detail || undefined,
    })
  }
}

// POST /api/skills/partner-install - Run curated partner-owned skill installer
router.post('/partner-install', async (req, res) => {
  await runCuratedPartnerInstaller(req, res, 'install')
})

// POST /api/skills/partner-uninstall - Run curated partner-owned plugin uninstaller
router.post('/partner-uninstall', async (req, res) => {
  await runCuratedPartnerInstaller(req, res, 'uninstall')
})

export default router
