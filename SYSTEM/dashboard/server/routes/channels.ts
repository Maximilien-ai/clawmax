import { Router } from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { updateGroupTags, updateGroupMembers, parseGroupsWithMembers, getWorkspacePath, createGroup, deleteGroup, listAgents } from '../lib/workspace'
import { safeEnv } from '../lib/safe-env'
import { getMessages, addMessage, clearMessages, getArchives, getArchivedMessages } from '../lib/messages'
import { listWorkflows, resolveParticipants } from '../lib/workflows'
import { traceAgentChat } from '../lib/opik'
import { isGatewayConfigured } from '../lib/gateway-rpc'
import { resolveAgentExecutionConfig, withTemporaryAgentAuthProfiles } from '../lib/agent-execution'

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
// Get message counts for all groups and communities (for unread indicators)
router.get('/message-counts', (req, res) => {
  try {
    const counts: Record<string, number> = {}

    // Count group messages
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
    if (fs.existsSync(groupsPath)) {
      const { groups } = parseGroupsWithMembers(fs.readFileSync(groupsPath, 'utf-8'))
      for (const group of groups) {
        const messages = getMessages('group', group.name)
        counts[`group:${group.name}`] = messages.length
      }
    }

    // Count community messages
    const commPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    if (fs.existsSync(commPath)) {
      const content = fs.readFileSync(commPath, 'utf-8')
      const communityNames = Array.from(content.matchAll(/^###\s+(.+)$/gm)).map(m => m[1].trim())
      for (const name of communityNames) {
        const messages = getMessages('community', name)
        counts[`community:${name}`] = messages.length
      }
    }

    res.json({ counts })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

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
async function callAgent(agentId: string, message: string, _sessionId: string, byokKeys?: { openai?: string; anthropic?: string }): Promise<string> {
  const resolvedAgent = resolveAgentExecutionConfig(agentId)
  const providerKeys = { openai: byokKeys?.openai, anthropic: byokKeys?.anthropic }

  return withTemporaryAgentAuthProfiles(agentId, providerKeys, resolvedAgent.model, resolvedAgent.provider, () => {
    return new Promise((resolve, reject) => {
      const args = ['agent', '--agent', agentId, '--message', message, '--json', '--local']
      const env = { ...safeEnv() }
      if (byokKeys?.openai) env.OPENAI_API_KEY = byokKeys.openai
      if (byokKeys?.anthropic) env.ANTHROPIC_API_KEY = byokKeys.anthropic
      const proc = spawn('openclaw', args, { env })

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
      console.log(`[callAgent] ${agentId}: exit code=${code}, stdout len=${stdout.length}, stderr len=${stderr.length}`)
      // Only reject if exit code is non-zero AND there's nothing parseable anywhere
      if (code !== 0 && !stdout.trim() && !stderr.includes('{')) {
        reject(new Error(`Agent command failed (code ${code}): ${stderr.slice(0, 200)}`))
        return
      }

      try {
        // CLI may output JSON to stdout or stderr (with warning lines); try both
        let jsonText = stdout.trim()
        if (!jsonText || !jsonText.startsWith('{')) {
          // Try extracting JSON from stderr (CLI may mix warnings with JSON)
          const start = stderr.indexOf('{')
          const end = stderr.lastIndexOf('}')
          if (start >= 0 && end > start) jsonText = stderr.slice(start, end + 1)
        }
        // Also try extracting JSON from stdout if it has non-JSON prefix lines
        if (jsonText && !jsonText.startsWith('{')) {
          const start = jsonText.indexOf('{')
          const end = jsonText.lastIndexOf('}')
          if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1)
        }

        console.log(`[callAgent] ${agentId}: stdout=${stdout.slice(0, 300)}, stderr=${stderr.slice(0, 300)}`)

        let responseText = ''
        if (jsonText && jsonText.startsWith('{')) {
          // Sanitize control characters inside JSON string values (agent responses may have raw newlines)
          const sanitized = jsonText.replace(/[\x00-\x1f\x7f]/g, (ch) => {
            if (ch === '\n') return '\\n'
            if (ch === '\r') return '\\r'
            if (ch === '\t') return '\\t'
            return ''
          })
          const result = JSON.parse(sanitized)
          const payloads = result?.payloads || result?.result?.payloads || []
          responseText = payloads
            .map((p: any) => p?.text || '')
            .filter((t: string) => t.trim())
            .join('\n\n')

          if (responseText) {
            const meta = result?.result?.meta || result?.meta || {}
            const agentMeta = meta.agentMeta || {}
            traceAgentChat(agentId, message, responseText, {
              model: agentMeta.model,
              provider: agentMeta.provider,
              inputTokens: agentMeta.usage?.input || agentMeta.promptTokens,
              outputTokens: agentMeta.usage?.output,
              cacheReadTokens: agentMeta.usage?.cacheRead,
              durationMs: meta.durationMs,
            })
          }
          const actualSessionId = result?.meta?.agentMeta?.sessionId || result?.result?.meta?.agentMeta?.sessionId
          if (actualSessionId) {
            try {
              const sessPath = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'sessions')
              fs.mkdirSync(sessPath, { recursive: true })
            } catch {}
          }
        } else if (stdout.trim()) {
          // Gateway mode may return plain text without --json wrapper
          responseText = stdout.trim()
        }
        if (!responseText) {
          console.log(`[callAgent] ${agentId}: empty response, stdout=${stdout.slice(0, 200)}, stderr=${stderr.slice(0, 200)}`)
        }

        resolve(responseText)
      } catch (parseErr) {
        console.error(`[callAgent] ${agentId}: parse error:`, parseErr, `stdout=${stdout.slice(0, 300)}, stderr=${stderr.slice(0, 300)}`)
        // If we have any stdout text at all, return it as-is rather than failing
        if (stdout.trim()) {
          resolve(stdout.trim())
        } else {
          reject(new Error(`Invalid JSON from agent: ${(stdout || stderr).slice(0, 200)}`))
        }
      }
    })

    proc.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
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

// Rename community
router.patch('/communities/:name/rename', (req, res) => {
  const { name } = req.params
  const { newName } = req.body as { newName?: string }

  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    res.status(400).json({ ok: false, error: 'newName is required' })
    return
  }

  const oldName = decodeURIComponent(name)
  const trimmedNewName = newName.trim()

  if (oldName === trimmedNewName) {
    res.status(400).json({ ok: false, error: 'New name must be different' })
    return
  }

  try {
    const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
    if (!fs.existsSync(communitiesPath)) {
      res.status(404).json({ ok: false, error: 'Communities file not found' })
      return
    }

    let content = fs.readFileSync(communitiesPath, 'utf-8')
    const { communities } = parseGroupsWithMembers(content)

    // Check if old community exists
    if (!communities.find(c => c.name === oldName)) {
      res.status(404).json({ ok: false, error: 'Community not found' })
      return
    }

    // Check if new name conflicts
    if (communities.find(c => c.name === trimmedNewName)) {
      res.status(409).json({ ok: false, error: `Community "${trimmedNewName}" already exists` })
      return
    }

    // Replace community name in header
    const oldHeader = new RegExp(`^### ${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
    content = content.replace(oldHeader, `### ${trimmedNewName}`)

    // Update references in GROUPS.md (community field)
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
    if (fs.existsSync(groupsPath)) {
      let groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const communityFieldRegex = new RegExp(`^- \\*\\*Community:\\*\\* ${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gm')
      groupsContent = groupsContent.replace(communityFieldRegex, `- **Community:** ${trimmedNewName}`)
      fs.writeFileSync(groupsPath, groupsContent, 'utf-8')
    }

    fs.writeFileSync(communitiesPath, content, 'utf-8')
    res.json({ ok: true, oldName, newName: trimmedNewName })
  } catch (err: any) {
    console.error('Failed to rename community:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

// Rename group
router.patch('/groups/:name/rename', (req, res) => {
  const { name } = req.params
  const { newName } = req.body as { newName?: string }

  if (!newName || typeof newName !== 'string' || newName.trim() === '') {
    res.status(400).json({ ok: false, error: 'newName is required' })
    return
  }

  const oldName = decodeURIComponent(name)
  const trimmedNewName = newName.trim()

  if (oldName === trimmedNewName) {
    res.status(400).json({ ok: false, error: 'New name must be different' })
    return
  }

  try {
    const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
    if (!fs.existsSync(groupsPath)) {
      res.status(404).json({ ok: false, error: 'Groups file not found' })
      return
    }

    let content = fs.readFileSync(groupsPath, 'utf-8')
    const { groups } = parseGroupsWithMembers(content)

    // Check if old group exists
    if (!groups.find(g => g.name === oldName)) {
      res.status(404).json({ ok: false, error: 'Group not found' })
      return
    }

    // Check if new name conflicts
    if (groups.find(g => g.name === trimmedNewName)) {
      res.status(409).json({ ok: false, error: `Group "${trimmedNewName}" already exists` })
      return
    }

    // Replace group name in header
    const oldHeader = new RegExp(`^### ${oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
    content = content.replace(oldHeader, `### ${trimmedNewName}`)

    fs.writeFileSync(groupsPath, content, 'utf-8')
    res.json({ ok: true, oldName, newName: trimmedNewName })
  } catch (err: any) {
    console.error('Failed to rename group:', err)
    res.status(500).json({ ok: false, error: err.message })
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
  const { content, mentions, from, byok } = req.body as { content?: string; mentions?: string[]; from?: string; byok?: { openai?: string; anthropic?: string } }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)

  // Save message (use provided 'from' or default to 'User')
  const message = addMessage('community', decodedName, {
    from: from || 'User',
    content,
    mentions: mentions || []
  })

  res.json({ ok: true, message })

  // Call mentioned agents asynchronously (don't block response)
  if (mentions && mentions.length > 0) {
    console.log(`[Group Chat] Calling ${mentions.length} agents for community "${decodedName}":`, mentions)

    // Call agents sequentially with delay to avoid gateway contention
    ;(async () => {
      const communityContext = `[Community chat: "${decodedName}" — from: ${from || 'User'}]\n\n${content}`

      for (let i = 0; i < mentions.length; i++) {
        const agentId = mentions[i]
        if (i > 0) await new Promise(r => setTimeout(r, 3000))
        try {
          const agentSessionId = `community:${decodedName}:${agentId}`
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          let response = await callAgent(agentId, communityContext, agentSessionId, byok)

          // Retry once if empty response
          if (!response || !response.trim()) {
            console.log(`[Group Chat] Agent ${agentId} returned empty — retrying after 2s`)
            await new Promise(r => setTimeout(r, 2000))
            response = await callAgent(agentId, communityContext, agentSessionId, byok)
          }

          console.log(`[Group Chat] Agent ${agentId} responded:`, response)
          if (response && response.trim()) {
            addMessage('community', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
            console.log(`[Group Chat] Added ${agentId} response to history`)
          } else {
            console.log(`[Group Chat] Agent ${agentId} returned empty response after retry`)
            addMessage('community', decodedName, {
              from: agentId,
              content: '*(Agent did not return a response. Try mentioning them directly with @)*',
              mentions: []
            })
          }
        } catch (err) {
          console.error(`[Group Chat] Failed to get response from agent ${agentId}:`, err)
          addMessage('community', decodedName, {
            from: agentId,
            content: `*(Error: ${err instanceof Error ? err.message.slice(0, 100) : 'failed to respond'})*`,
            mentions: []
          })
        }
      }
    })().catch(err => console.error('[Group Chat] Error calling agents:', err))
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
  const { content, mentions, from, byok } = req.body as { content?: string; mentions?: string[]; from?: string; byok?: { openai?: string; anthropic?: string } }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)

  // Save message (use provided 'from' or default to 'User')
  const message = addMessage('group', decodedName, {
    from: from || 'User',
    content,
    mentions: mentions || []
  })

  res.json({ ok: true, message })

  // Call mentioned agents asynchronously (don't block response)
  if (mentions && mentions.length > 0) {
    console.log(`[Group Chat] Calling ${mentions.length} agents for group "${decodedName}":`, mentions)

    // Call agents sequentially with delay to avoid gateway contention
    ;(async () => {
      // Build context-aware message so agents know they're in a group
      const groupContext = `[Group chat: "${decodedName}" — from: ${from || 'User'}]\n\n${content}`

      for (let i = 0; i < mentions.length; i++) {
        const agentId = mentions[i]
        // Small delay between agents to avoid gateway race
        if (i > 0) await new Promise(r => setTimeout(r, 3000))
        try {
          const agentSessionId = `group:${decodedName}:${agentId}`
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          let response = await callAgent(agentId, groupContext, agentSessionId, byok)

          // Retry once if empty response (common with 2nd+ agent due to gateway timing)
          if (!response || !response.trim()) {
            console.log(`[Group Chat] Agent ${agentId} returned empty — retrying after 2s`)
            await new Promise(r => setTimeout(r, 2000))
            response = await callAgent(agentId, groupContext, agentSessionId, byok)
          }

          console.log(`[Group Chat] Agent ${agentId} responded:`, response)
          if (response && response.trim()) {
            addMessage('group', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
            console.log(`[Group Chat] Added ${agentId} response to history`)
          } else {
            console.log(`[Group Chat] Agent ${agentId} returned empty response after retry`)
            addMessage('group', decodedName, {
              from: agentId,
              content: '*(Agent did not return a response. Try mentioning them directly with @)*',
              mentions: []
            })
          }
        } catch (err) {
          console.error(`[Group Chat] Failed to get response from agent ${agentId}:`, err)
          addMessage('group', decodedName, {
            from: agentId,
            content: `*(Error: ${err instanceof Error ? err.message.slice(0, 100) : 'failed to respond'})*`,
            mentions: []
          })
        }
      }
    })().catch(err => console.error('[Group Chat] Error calling agents:', err))
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

// GET /api/communities/:name/workflows — get workflows targeting this community
router.get('/communities/:name/workflows', (req, res) => {
  const { name } = req.params
  const communityName = decodeURIComponent(name)

  try {
    const agents = listAgents()
    const allWorkflows = listWorkflows()

    const communityWorkflows = allWorkflows.filter(workflow => {
      return workflow.targeting.communities.some(c => c.toLowerCase() === communityName.toLowerCase())
    }).map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled,
      schedule: wf.schedule,
    }))

    res.json({ workflows: communityWorkflows })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get community workflows', message: error.message })
  }
})

// GET /api/groups/:name/workflows — get workflows targeting this group
router.get('/groups/:name/workflows', (req, res) => {
  const { name } = req.params
  const groupName = decodeURIComponent(name)

  try {
    const agents = listAgents()
    const allWorkflows = listWorkflows()

    const groupWorkflows = allWorkflows.filter(workflow => {
      return workflow.targeting.groups.some(g => g.toLowerCase() === groupName.toLowerCase())
    }).map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      enabled: wf.enabled,
      schedule: wf.schedule,
    }))

    res.json({ workflows: groupWorkflows })
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get group workflows', message: error.message })
  }
})

export default router
