import { Router } from 'express'
import { updateGroupTags } from '../lib/workspace'

const router = Router()

// Update community tags
router.patch('/communities/:name/tags', (req, res) => {
  const { name } = req.params
  const { tags } = req.body as { tags?: string[] }

  if (!Array.isArray(tags)) {
    res.status(400).json({ ok: false, error: 'tags must be an array' })
    return
  }

  const success = updateGroupTags('community', decodeURIComponent(name), tags)
  if (success) {
    res.json({ ok: true })
  } else {
    res.status(404).json({ ok: false, error: 'Community not found' })
  }
})

// Update group tags
router.patch('/groups/:name/tags', (req, res) => {
  const { name } = req.params
  const { tags } = req.body as { tags?: string[] }

  if (!Array.isArray(tags)) {
    res.status(400).json({ ok: false, error: 'tags must be an array' })
    return
  }

  const success = updateGroupTags('group', decodeURIComponent(name), tags)
  if (success) {
    res.json({ ok: true })
  } else {
    res.status(404).json({ ok: false, error: 'Group not found' })
  }
})

export default router
