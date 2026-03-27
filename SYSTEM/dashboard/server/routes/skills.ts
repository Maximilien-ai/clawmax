import express from 'express'
import {
  listAvailableSkills,
  getSkillById,
  getAgentSkills,
  setAgentSkills,
  validateSkills,
  createCustomSkill,
  importWorkspaceSkill,
  deleteWorkspaceSkill
} from '../lib/skills'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const router = express.Router()

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
    const { name, description, emoji, requires, install, homepage, content } = req.body

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
      content
    })

    res.json({ ok: true, skill })
  } catch (err: any) {
    console.error('Error creating skill:', err)
    res.status(400).json({ error: err.message || 'Failed to create skill' })
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

    // Validate all skills exist
    const validation = validateSkills(skills)
    if (!validation.valid) {
      return res.status(400).json({
        error: `Invalid skills: ${validation.missing.join(', ')}`,
        missing: validation.missing
      })
    }

    // Update agent's skills with metadata stamping
    setAgentSkills(agentId, skills)

    res.json({ ok: true, skills })
  } catch (err: any) {
    console.error('Error updating agent skills:', err)

    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to update agent skills' })
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

// POST /api/skills/import - Import workspace custom skill from local directory
router.post('/import', (req, res) => {
  try {
    const { sourcePath } = req.body

    if (!sourcePath) {
      return res.status(400).json({ error: 'sourcePath is required' })
    }

    const result = importWorkspaceSkill(sourcePath)

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.json({ ok: true, skillId: result.skillId })
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

        const results: { skillId: string; ok: boolean; error?: string }[] = []
        for (const dir of skillDirs) {
          const result = importWorkspaceSkill(path.join(skillsDir, dir))
          results.push({
            skillId: result.skillId || dir,
            ok: result.success,
            error: result.error,
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

        res.json({ ok: true, skillId: result.skillId, imported: 1, total: 1 })
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

export default router
