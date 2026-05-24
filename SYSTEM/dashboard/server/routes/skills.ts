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
} from '../lib/skills'
import { getCuratedPartnerInstaller } from '../lib/partner-installs'
import { generateSkillFromNL, setRequestByokKeys } from '../lib/ai-generator'
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
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)
const execFileAsync = promisify(require('child_process').execFile)
const router = express.Router()

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

// GET /api/skills/browse-directory - Show native directory picker (macOS)
router.get('/browse-directory', async (req, res) => {
  try {
    // Use macOS osascript to show native directory picker
    const script = `osascript -e 'POSIX path of (choose folder with prompt "Select skill directory")'`

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
    if (err.message?.includes('User canceled')) {
      return res.json({ path: null, cancelled: true })
    }
    console.error('Error showing directory picker:', err)
    res.status(500).json({ error: err.message || 'Failed to show directory picker' })
  }
})

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
    setRequestByokKeys(byokKeys)
    const skill = await generateSkillFromNL(description.trim(), currentDraft)
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
    const { sourcePath } = req.body

    if (!sourcePath) {
      return res.status(400).json({ error: 'sourcePath is required' })
    }

    const fs = require('fs')
    const path = require('path')

    // Check if this is a multi-skill directory (has skills/ subdir with SKILL.md entries)
    const skillsSubdir = path.join(sourcePath, 'skills')
    const isSingleSkill = fs.existsSync(path.join(sourcePath, 'SKILL.md')) ||
                          fs.existsSync(path.join(sourcePath, 'skill.md'))
    const hasSkillsDir = fs.existsSync(skillsSubdir) && fs.statSync(skillsSubdir).isDirectory()

    if (hasSkillsDir && !isSingleSkill) {
      // Multi-skill: import each subdirectory under skills/
      const skillDirs = fs.readdirSync(skillsSubdir).filter((d: string) => {
        const sp = path.join(skillsSubdir, d)
        if (!fs.statSync(sp).isDirectory()) return false
        return fs.existsSync(path.join(sp, 'SKILL.md')) || fs.existsSync(path.join(sp, 'skill.md'))
      })

      if (skillDirs.length === 0) {
        return res.status(400).json({ error: 'No skills found in skills/ directory (each skill needs a SKILL.md)' })
      }

      const results: { skillId: string; ok: boolean; error?: string; warning?: string }[] = []
      for (const dir of skillDirs) {
        const result = importWorkspaceSkill(path.join(skillsSubdir, dir))
        results.push({ skillId: result.skillId || dir, ok: result.success, error: result.error, warning: result.warning })
      }

      const imported = results.filter(r => r.ok)
      return res.json({
        ok: imported.length > 0,
        imported: imported.length,
        failed: results.length - imported.length,
        total: results.length,
        skills: results,
      })
    }

    // Single skill import
    const result = importWorkspaceSkill(sourcePath)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ ok: true, skillId: result.skillId, imported: 1, total: 1, warning: result.warning })
  } catch (err: any) {
    console.error('Error importing skill:', err)
    res.status(500).json({ error: err.message || 'Failed to import skill' })
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

    const { execSync } = require('child_process')
    const os = require('os')
    const path = require('path')
    const fs = require('fs')

    const tempDir = path.join(os.tmpdir(), `openclaw-skill-${Date.now()}`)

    try {
      // Clone the repository
      console.log(`Cloning ${normalizedUrl} to ${tempDir}`)
      execSync(`git clone --depth 1 ${normalizedUrl} ${tempDir}`, { stdio: 'pipe' })

      // Determine import root: subdir override, or auto-detect
      let importRoot = tempDir
      if (subdir) {
        importRoot = path.join(tempDir, subdir)
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

        const imported = results.filter(r => r.ok)
        const failed = results.filter(r => !r.ok)

        res.json({
          ok: imported.length > 0,
          imported: imported.length,
          failed: failed.length,
          total: results.length,
          skills: results,
        })
      } else {
        // Single skill: import directly
        const result = importWorkspaceSkill(importRoot)

        // Clean up
        fs.rmSync(tempDir, { recursive: true, force: true })

        if (!result.success) {
          return res.status(400).json({ error: result.error })
        }

        res.json({ ok: true, skillId: result.skillId, imported: 1, total: 1, warning: result.warning })
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
        return res.status(400).json({ error: 'No skill files found after install. The skill may use a format not yet supported.' })
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

// POST /api/skills/partner-install - Run curated partner-owned skill installer
router.post('/partner-install', async (req, res) => {
  try {
    const { commandId } = req.body
    if (!commandId || typeof commandId !== 'string') {
      return res.status(400).json({ error: 'commandId is required' })
    }

    const installer = getCuratedPartnerInstaller(commandId)
    if (!installer) {
      return res.status(400).json({ error: 'Unknown curated partner installer' })
    }

    const [command, ...args] = installer.command
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 180000,
      env: safeEnv(),
      maxBuffer: 1024 * 1024 * 8,
    })
    res.json({
      ok: true,
      commandId: installer.commandId,
      label: installer.label,
      stdout: `${stdout || ''}`.trim(),
      stderr: `${stderr || ''}`.trim(),
    })
  } catch (err: any) {
    console.error('Curated partner install error:', err.message)
    const detail = [err?.stderr, err?.stdout].filter(Boolean).join('\n').trim()
    res.status(500).json({
      error: err.message || 'Failed to run curated partner installer',
      detail: detail || undefined,
    })
  }
})

export default router
