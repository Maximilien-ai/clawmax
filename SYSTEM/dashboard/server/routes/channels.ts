import { Router } from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { updateGroupTags, updateGroupMembers, parseGroupsWithMembers, getWorkspacePath, createGroup, deleteGroup } from '../lib/workspace'
import { getMessages, addMessage, clearMessages, getArchives, getArchivedMessages } from '../lib/messages'

const router = Router()

// List all communities
router.get('/communities', (req, res) => {
  try {
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    if (!fs.existsSync(communitiesPath)) {
      res.json({ communities: [] })
      return
    }
    const content = fs.readFileSync(communitiesPath, 'utf-8')
    const { communities } = parseGroupsWithMembers(content)
    res.json({ communities })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// List all groups
router.get('/groups', (req, res) => {
  try {
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
    if (!fs.existsSync(groupsPath)) {
      res.json({ groups: [] })
      return
    }
    const content = fs.readFileSync(groupsPath, 'utf-8')
    const { groups } = parseGroupsWithMembers(content)
    res.json({ groups })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Create a new community
router.post('/communities', (req, res) => {
  const { name, description, tags, members, channels } = req.body as {
    name?: string
    description?: string
    tags?: string[]
    members?: string[]
    channels?: string[]
  }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ ok: false, error: 'name is required' })
    return
  }

  const success = createGroup('community', name.trim(), {
    description,
    tags,
    members,
    channels
  })

  if (success) {
    res.json({ ok: true })
  } else {
    res.status(400).json({ ok: false, error: 'Failed to create community (may already exist)' })
  }
})

// Create a new group
router.post('/groups', (req, res) => {
  const { name, description, tags, members, community, channels } = req.body as {
    name?: string
    description?: string
    tags?: string[]
    members?: string[]
    community?: string
    channels?: string[]
  }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ ok: false, error: 'name is required' })
    return
  }

  const success = createGroup('group', name.trim(), {
    description,
    tags,
    members,
    community,
    channels
  })

  if (success) {
    res.json({ ok: true })
  } else {
    res.status(400).json({ ok: false, error: 'Failed to create group (may already exist)' })
  }
})

// Delete a community
router.delete('/communities/:name', (req, res) => {
  const { name } = req.params
  const success = deleteGroup('community', decodeURIComponent(name))

  if (success) {
    res.json({ ok: true })
  } else {
    res.status(404).json({ ok: false, error: 'Community not found' })
  }
})

// Delete a group
router.delete('/groups/:name', (req, res) => {
  const { name } = req.params
  const success = deleteGroup('group', decodeURIComponent(name))

  if (success) {
    res.json({ ok: true })
  } else {
    res.status(404).json({ ok: false, error: 'Group not found' })
  }
})

/** Call an agent with a message and return the response */
async function callAgent(agentId: string, message: string, sessionId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['agent', '--agent', agentId, '--session-id', sessionId, '--message', message, '--json']
    const proc = spawn('openclaw', args, { env: process.env })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('Agent timeout'))
    }, 60000) // 1 min timeout per agent

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

    proc.on('close', (code: number) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`Agent command failed: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        const responseText = result?.result?.payloads?.[0]?.text || ''
        const actualSessionId = result?.result?.meta?.agentMeta?.sessionId

        // Save session mapping if we got one
        if (actualSessionId) {
          try {
            const HOME = process.env.HOME || ''
            const sessionsPath = path.join(HOME, '.openclaw', 'agents', agentId, 'sessions', 'sessions.json')
            let sessions: Record<string, any> = {}
            if (fs.existsSync(sessionsPath)) {
              sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
            }
            sessions[sessionId] = { sessionId: actualSessionId, updatedAt: Date.now() }
            fs.mkdirSync(path.dirname(sessionsPath), { recursive: true })
            fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2))
          } catch (e) {
            console.error('Failed to update sessions.json:', e)
          }
        }

        resolve(responseText)
      } catch {
        reject(new Error(`Invalid JSON from agent: ${stdout}`))
      }
    })

    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

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

// Update community members
router.patch('/communities/:name/members', (req, res) => {
  const { name } = req.params
  const { members } = req.body as { members?: string[] }

  if (!Array.isArray(members)) {
    res.status(400).json({ ok: false, error: 'members must be an array' })
    return
  }

  const success = updateGroupMembers('community', decodeURIComponent(name), members)
  if (success) {
    res.json({ ok: true })
  } else {
    res.status(404).json({ ok: false, error: 'Community not found' })
  }
})

// Update group members
router.patch('/groups/:name/members', (req, res) => {
  const { name } = req.params
  const { members } = req.body as { members?: string[] }

  if (!Array.isArray(members)) {
    res.status(400).json({ ok: false, error: 'members must be an array' })
    return
  }

  const groupName = decodeURIComponent(name)
  const success = updateGroupMembers('group', groupName, members)

  if (!success) {
    res.status(404).json({ ok: false, error: 'Group not found' })
    return
  }

  // Auto-add members to parent community if group belongs to one
  try {
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
    if (fs.existsSync(groupsPath)) {
      const content = fs.readFileSync(groupsPath, 'utf-8')
      const { groups } = parseGroupsWithMembers(content)
      const group = groups.find(g => g.name === groupName)

      if (group?.community) {
        // Get current community members
        const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
        if (fs.existsSync(communitiesPath)) {
          const commContent = fs.readFileSync(communitiesPath, 'utf-8')
          const { communities } = parseGroupsWithMembers(commContent)
          const community = communities.find(c => c.name === group.community)

          if (community) {
            // Merge new members with existing community members
            const existingMembers = community.members || []
            const updatedMembers = [...new Set([...existingMembers, ...members])]

            // Only update if there are new members to add
            if (updatedMembers.length > existingMembers.length) {
              updateGroupMembers('community', group.community, updatedMembers)
            }
          }
        }
      }
    }
  } catch (err) {
    // Don't fail the request if community auto-add fails
    console.error('Failed to auto-add members to parent community:', err)
  }

  res.json({ ok: true })
})

// Get messages for a community
router.get('/communities/:name/messages', (req, res) => {
  const { name } = req.params
  const messages = getMessages('community', decodeURIComponent(name))
  res.json({ messages })
})

// Send message to a community
router.post('/communities/:name/messages', async (req, res) => {
  const { name } = req.params
  const { content, mentions } = req.body as { content?: string; mentions?: string[] }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)

  // Save user message
  const message = addMessage('community', decodedName, {
    from: 'User',
    content,
    mentions: mentions || []
  })

  res.json({ ok: true, message })

  // Call mentioned agents asynchronously (don't block response)
  if (mentions && mentions.length > 0) {
    const sessionId = `community:${decodedName}:group-chat`
    console.log(`[Group Chat] Calling ${mentions.length} agents for community "${decodedName}":`, mentions)

    // Call agents in parallel
    Promise.all(
      mentions.map(async (agentId) => {
        try {
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          const response = await callAgent(agentId, content, sessionId)
          console.log(`[Group Chat] Agent ${agentId} responded:`, response)
          if (response && response.trim()) {
            // Add agent response to message history
            addMessage('community', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
            console.log(`[Group Chat] Added ${agentId} response to history`)
          } else {
            console.log(`[Group Chat] Agent ${agentId} returned empty response`)
          }
        } catch (err) {
          console.error(`[Group Chat] Failed to get response from agent ${agentId}:`, err)
        }
      })
    ).catch(err => console.error('[Group Chat] Error calling agents:', err))
  }
})

// Get messages for a group
router.get('/groups/:name/messages', (req, res) => {
  const { name } = req.params
  const messages = getMessages('group', decodeURIComponent(name))
  res.json({ messages })
})

// Send message to a group
router.post('/groups/:name/messages', async (req, res) => {
  const { name } = req.params
  const { content, mentions } = req.body as { content?: string; mentions?: string[] }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)

  // Save user message
  const message = addMessage('group', decodedName, {
    from: 'User',
    content,
    mentions: mentions || []
  })

  res.json({ ok: true, message })

  // Call mentioned agents asynchronously (don't block response)
  if (mentions && mentions.length > 0) {
    const sessionId = `group:${decodedName}:group-chat`
    console.log(`[Group Chat] Calling ${mentions.length} agents for group "${decodedName}":`, mentions)

    // Call agents in parallel
    Promise.all(
      mentions.map(async (agentId) => {
        try {
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          const response = await callAgent(agentId, content, sessionId)
          console.log(`[Group Chat] Agent ${agentId} responded:`, response)
          if (response && response.trim()) {
            // Add agent response to message history
            addMessage('group', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
            console.log(`[Group Chat] Added ${agentId} response to history`)
          } else {
            console.log(`[Group Chat] Agent ${agentId} returned empty response`)
          }
        } catch (err) {
          console.error(`[Group Chat] Failed to get response from agent ${agentId}:`, err)
        }
      })
    ).catch(err => console.error('[Group Chat] Error calling agents:', err))
  }
})

// Clear messages (archives them first)
router.delete('/communities/:name/messages', (req, res) => {
  const { name } = req.params
  const result = clearMessages('community', decodeURIComponent(name))
  res.json({ ok: true, ...result })
})

router.delete('/groups/:name/messages', (req, res) => {
  const { name } = req.params
  const result = clearMessages('group', decodeURIComponent(name))
  res.json({ ok: true, ...result })
})

// Get archives list
router.get('/communities/:name/archives', async (req, res) => {
  const { name } = req.params
  const archives = await getArchives('community', decodeURIComponent(name))
  res.json({ archives })
})

router.get('/groups/:name/archives', async (req, res) => {
  const { name } = req.params
  const archives = await getArchives('group', decodeURIComponent(name))
  res.json({ archives })
})

// Get archived messages
router.get('/communities/:name/archives/:filename', (req, res) => {
  const { name, filename } = req.params
  const messages = getArchivedMessages('community', decodeURIComponent(name), filename)
  res.json({ messages })
})

router.get('/groups/:name/archives/:filename', (req, res) => {
  const { name, filename } = req.params
  const messages = getArchivedMessages('group', decodeURIComponent(name), filename)
  res.json({ messages })
})

// Delete archive
router.delete('/communities/:name/archives/:filename', (req, res) => {
  const { name, filename } = req.params
  const { deleteArchivedMessages } = require('../lib/messages')
  const success = deleteArchivedMessages('community', decodeURIComponent(name), filename)
  res.json({ ok: success })
})

router.delete('/groups/:name/archives/:filename', (req, res) => {
  const { name, filename } = req.params
  const { deleteArchivedMessages } = require('../lib/messages')
  const success = deleteArchivedMessages('group', decodeURIComponent(name), filename)
  res.json({ ok: success })
})

export default router
