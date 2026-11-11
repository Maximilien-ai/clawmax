import type { RequestHandler } from 'express'
import { simpleGit } from 'simple-git'
import { createWorkspaceFile, getWorkspacePath, parseGroups, parseIdentity, writeWorkspaceFile } from '../lib/workspace'
import { validateCommunities, validateGroups, validateIdentity } from '../lib/validator'

/** Create and Save retain the same schema checks and document Git history. */
export function documentContentHandler(createOnly = false): RequestHandler {
  return async (req, res) => {
    const { path: relPath, content } = req.body as { path?: string; content?: string }
    if (typeof relPath !== 'string' || !relPath.trim() || typeof content !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing path or content' })
      return
    }

    // Validate content before saving if it's a schema-backed file
    const fileName = relPath.split('/').pop()

    if (fileName === 'COMMUNITIES.md') {
      const { communities } = parseGroups(content)
      const validation = validateCommunities(communities)
      if (!validation.valid) {
        // Enhance error messages with actual names
        const enhancedErrors = validation.errors.map(err => {
          const match = err.field.match(/^communities\.(\d+)\.?(.*)/)
          if (match) {
            const idx = parseInt(match[1])
            let subfield = match[2]
            const community = communities[idx]
            const name = community?.name || `#${idx}`

            // Further enhance array field errors (e.g., tags.0 -> tag "value")
            const arrayMatch = subfield?.match(/^(tags|channels)\.(\d+)$/)
            if (arrayMatch && community) {
              const arrayField = arrayMatch[1] as 'tags' | 'channels'
              const arrayIdx = parseInt(arrayMatch[2])
              const value = community[arrayField]?.[arrayIdx]
              if (value) {
                subfield = `${arrayField.slice(0, -1)} "${value}"`
              }
            }

            return {
              ...err,
              field: subfield ? `Community "${name}" → ${subfield}` : `Community "${name}"`
            }
          }
          return err
        })
        res.status(400).json({
          ok: false,
          error: 'Validation failed',
          validationErrors: enhancedErrors
        })
        return
      }
    } else if (fileName === 'GROUPS.md') {
      const { groups } = parseGroups(content)
      const validation = validateGroups(groups)
      if (!validation.valid) {
        // Enhance error messages with actual names
        const enhancedErrors = validation.errors.map(err => {
          const match = err.field.match(/^groups\.(\d+)\.?(.*)/)
          if (match) {
            const idx = parseInt(match[1])
            let subfield = match[2]
            const group = groups[idx]
            const name = group?.name || `#${idx}`

            // Further enhance array field errors (e.g., tags.0 -> tag "value")
            const arrayMatch = subfield?.match(/^(tags|channels)\.(\d+)$/)
            if (arrayMatch && group) {
              const arrayField = arrayMatch[1] as 'tags' | 'channels'
              const arrayIdx = parseInt(arrayMatch[2])
              const value = group[arrayField]?.[arrayIdx]
              if (value) {
                subfield = `${arrayField.slice(0, -1)} "${value}"`
              }
            }

            return {
              ...err,
              field: subfield ? `Group "${name}" → ${subfield}` : `Group "${name}"`
            }
          }
          return err
        })
        res.status(400).json({
          ok: false,
          error: 'Validation failed',
          validationErrors: enhancedErrors
        })
        return
      }
    } else if (fileName === 'IDENTITY.md') {
      const identity = parseIdentity(content)
      const validation = validateIdentity(identity)
      if (!validation.valid) {
        res.status(400).json({
          ok: false,
          error: 'Validation failed',
          validationErrors: validation.errors
        })
        return
      }
    }

    if (createOnly) {
      const result = createWorkspaceFile(relPath, content)
      if (result === 'exists') return res.status(409).json({ error: 'A document already exists at this path. Choose another name.' })
      if (result === 'invalid') return res.status(400).json({ error: 'Cannot create a document at that path' })
      if (result === 'failed') return res.status(500).json({ error: 'Failed to create document. Please try again.' })
    } else {
      const ok = writeWorkspaceFile(relPath, content)
      if (!ok) {
        res.status(403).json({ ok: false, error: 'Path not allowed or not a markdown file' })
        return
      }
    }

    // Auto-commit the change to git
    try {
      const git = simpleGit(getWorkspacePath())
      const isRepo = await git.checkIsRepo()

      if (isRepo) {
        // `--`: a document named `--pathspec-from-file=x.md` is a path, not an option.
        await git.add(['--', relPath])
        const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0]
        const commitMessage = `docs: Update ${relPath}\n\nEdited via ClawMax Dashboard at ${timestamp}`
        await git.commit(commitMessage)
        console.log(`[Git] Auto-committed: ${relPath}`)
      }
    } catch (err) {
      // Log but don't fail the save operation
      console.error('[Git] Failed to auto-commit:', err)
    }

    res.status(createOnly ? 201 : 200).json({ ok: true })
  }
}
