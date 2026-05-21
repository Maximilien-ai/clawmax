import { Router } from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { updateGroupTags, updateGroupMembers, parseGroupsWithMembers, getWorkspacePath, getAgentsDir, createGroup, deleteGroup, listAgents, deleteAgent, parseGroups } from '../lib/workspace'
import { userExecutionEnv } from '../lib/safe-env'
import { getMessages, addMessage, clearMessages, getArchives, getArchivedMessages, directMessageKey, type Message } from '../lib/messages'
import { normalizeChatMessage } from '../lib/chat-normalization'
import { listWorkflows, resolveParticipants, deleteWorkflow } from '../lib/workflows'
import { getConfiguredDashboardInstanceId, traceAgentChat } from '../lib/opik'
import { isGatewayConfigured, isGatewayRunning } from '../lib/gateway-rpc'
import { deleteTeams, listTeams } from '../lib/teams'
import { findImpactedTopLevelTeamsForCommunityDelete } from '../lib/organization-delete'
import {
  resolveAgentExecutionConfig,
  runExclusiveAgentExecution,
  scopeSessionIdToModel,
  withTemporaryAgentAuthProfiles,
} from '../lib/agent-execution'
import { readWorkspaceIntegrationConfig } from '../lib/workspace-integrations'
import { getAuthenticatedSession } from '../lib/github-auth'

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
  const communityName = decodeURIComponent(name)
  const cascade = req.query.cascade === '1' || req.query.cascade === 'true' || req.query.cascade === 'all'

  if (cascade) {
    try {
      const allAgents = listAgents().filter((agent: any) => !agent.archived)
      const agentsDir = getAgentsDir()
      const parsedCommunitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
      const parsedGroupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
      const parsedCommunities = fs.existsSync(parsedCommunitiesPath)
        ? parseGroupsWithMembers(fs.readFileSync(parsedCommunitiesPath, 'utf-8')).communities
        : []
      const parsedGroups = fs.existsSync(parsedGroupsPath)
        ? parseGroupsWithMembers(fs.readFileSync(parsedGroupsPath, 'utf-8')).groups
        : []
      const communityGroups = parsedGroups.filter((group) => group.community === communityName)
      const groupNames = new Set(communityGroups.map((group) => group.name))
      const teams = listTeams()
      const impactedTeamPlans = findImpactedTopLevelTeamsForCommunityDelete({
        communityName,
        teams,
        groups: parsedGroups,
        communities: parsedCommunities,
        workflows: listWorkflows(),
      })
      const teamIdsToDelete = Array.from(new Set(impactedTeamPlans.flatMap((plan) => plan.teamIds)))
      const agents = allAgents.filter((agent) => {
        const indexedMembership =
          (agent.communities || []).some((community: any) => {
            if (typeof community === 'string') return community === communityName
            return community?.name === communityName
          })
          || (agent.groups || []).some((group: any) => {
            const groupName = typeof group === 'string' ? group : group?.name
            return !!groupName && groupNames.has(groupName)
          })

        if (indexedMembership) return true

        try {
          const agentDir = path.join(agentsDir, agent.id)
          const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')
          if (fs.existsSync(communitiesPath)) {
            const parsed = parseGroups(fs.readFileSync(communitiesPath, 'utf-8')).communities
            if (parsed.some((community) => community.name === communityName)) return true
          }

          const groupsPath = path.join(agentDir, 'GROUPS.md')
          if (fs.existsSync(groupsPath)) {
            const parsed = parseGroups(fs.readFileSync(groupsPath, 'utf-8')).groups
            if (parsed.some((group) => groupNames.has(group.name) || group.community === communityName)) return true
          }
        } catch {}

        return false
      })
      const agentIds = new Set(agents.map((agent) => agent.id))

      const workflowsToDelete = listWorkflows().filter((workflow) => {
        const targetsCommunity = (workflow.targeting?.communities || []).includes(communityName)
        const targetsGroup = (workflow.targeting?.groups || []).some((group) => groupNames.has(group))
        const targetsAgent = (workflow.targeting?.agents || []).some((agentId) => agentIds.has(agentId))
        const participantMatch = resolveParticipants(workflow, allAgents as any[]).some((participant) => agentIds.has(participant.agentId))
        return targetsCommunity || targetsGroup || targetsAgent || participantMatch
      })

      const workflowResults = workflowsToDelete.map((workflow) => ({ workflowId: workflow.id, result: deleteWorkflow(workflow.id) }))
      const groupResults = communityGroups.map((group) => ({ groupName: group.name, deleted: deleteGroup('group', group.name) }))
      const agentResults = agents.map((agent) => ({ agentId: agent.id, result: deleteAgent(agent.id, true, false) }))
      const communityDeleted = deleteGroup('community', communityName)
      const deletedTeamIds = communityDeleted ? deleteTeams(teamIdsToDelete) : []

      if (!communityDeleted) {
        res.status(404).json({ ok: false, error: 'Community not found' })
        return
      }

      const workflowFailures = workflowResults.filter((item) => !item.result.success).map((item) => item.workflowId)
      const groupFailures = groupResults.filter((item) => !item.deleted).map((item) => item.groupName)
      const agentFailures = agentResults.filter((item) => item.result.errors.length > 0).map((item) => ({
        agentId: item.agentId,
        errors: item.result.errors,
      }))

      const remainingCommunitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
      const remainingGroupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
      const remainingCommunities = fs.existsSync(remainingCommunitiesPath)
        ? parseGroupsWithMembers(fs.readFileSync(remainingCommunitiesPath, 'utf-8')).communities
        : []
      const remainingGroups = fs.existsSync(remainingGroupsPath)
        ? parseGroupsWithMembers(fs.readFileSync(remainingGroupsPath, 'utf-8')).groups
        : []
      const remainingCommunity = remainingCommunities.some((community) => community.name === communityName)
      const remainingGroupsForCommunity = remainingGroups.filter((group) => group.community === communityName).map((group) => group.name)
      const remainingAgents = listAgents()
        .filter((agent) => agentIds.has(agent.id))
        .map((agent) => agent.id)
      const remainingWorkflows = listWorkflows()
        .filter((workflow) => workflowsToDelete.some((candidate) => candidate.id === workflow.id))
        .map((workflow) => workflow.id)
      const remainingTeams = listTeams()
        .filter((team) => teamIdsToDelete.includes(team.id))
        .map((team) => team.id)

      const hadVerificationFailure =
        remainingCommunity ||
        remainingGroupsForCommunity.length > 0 ||
        remainingAgents.length > 0 ||
        remainingWorkflows.length > 0 ||
        remainingTeams.length > 0

      const ok =
        workflowFailures.length === 0 &&
        groupFailures.length === 0 &&
        agentFailures.length === 0 &&
        !hadVerificationFailure

      const payload = {
        ok,
        cascade: true,
        deleted: {
          community: communityName,
          groups: groupResults.filter((item) => item.deleted).map((item) => item.groupName),
          agents: agentResults.map((item) => item.agentId),
          workflows: workflowResults.filter((item) => item.result.success).map((item) => item.workflowId),
          teams: deletedTeamIds,
        },
        failures: {
          groups: groupFailures,
          agents: agentFailures,
          workflows: workflowFailures,
        },
        remaining: {
          community: remainingCommunity ? communityName : null,
          groups: remainingGroupsForCommunity,
          agents: remainingAgents,
          workflows: remainingWorkflows,
          teams: remainingTeams,
        },
      }

      if (!ok) {
        res.status(409).json(payload)
        return
      }

      res.json(payload)
      return
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message || 'Failed to cascade delete community' })
      return
    }
  }

  const success = deleteGroup('community', communityName)

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
async function callAgent(
  agentId: string,
  message: string,
  sessionId: string,
  byokKeys?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string },
  actor?: { userId?: string; login?: string; email?: string | null }
): Promise<string> {
  const resolvedAgent = resolveAgentExecutionConfig(agentId)
  const integrationConfig = readWorkspaceIntegrationConfig()
  const useOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
  const executionEnv = userExecutionEnv({
    openai: useOpenAiCompatible ? undefined : byokKeys?.openai,
    anthropic: byokKeys?.anthropic,
    gemini: byokKeys?.gemini,
    ollamaBaseUrl: byokKeys?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byokKeys?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byokKeys?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byokKeys?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  const effectiveSessionId = scopeSessionIdToModel(sessionId, resolvedAgent.model)
  const useLocal = !isGatewayRunning().running
  const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationConfig.ollamaDefaultModel)
  const hasOpenAiCompatiblePath = !!(executionEnv.OPENAI_BASE_URL || integrationConfig.openaiCompatibleBaseUrl)
  if (resolvedAgent.provider === 'ollama' && !hasOllamaPath) {
    throw new Error(`Agent ${agentId} is configured for ${resolvedAgent.model || 'ollama'}, but no Ollama runtime is configured`)
  }
  if (resolvedAgent.provider === 'openai-compatible' && !hasOpenAiCompatiblePath) {
    throw new Error(`Agent ${agentId} is configured for ${resolvedAgent.model || 'openai-compatible'}, but no OpenAI-compatible Base URL is configured`)
  }

  return runExclusiveAgentExecution(agentId, () => withTemporaryAgentAuthProfiles(agentId, {
    openai: executionEnv.OPENAI_API_KEY,
    anthropic: executionEnv.ANTHROPIC_API_KEY,
    gemini: executionEnv.GEMINI_API_KEY,
    ollamaBaseUrl: executionEnv.OLLAMA_BASE_URL,
    openaiCompatibleApiKey: useOpenAiCompatible ? executionEnv.OPENAI_API_KEY : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? executionEnv.OPENAI_BASE_URL : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byokKeys?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  }, resolvedAgent.model, resolvedAgent.provider, () => {
    return new Promise((resolve, reject) => {
      const args = ['agent', '--agent', agentId, '--session-id', effectiveSessionId, '--message', message, '--json', ...(useLocal ? ['--local'] : [])]
      const proc = spawn('openclaw', args, { env: executionEnv })

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
        console.log(`[callAgent] ${agentId}: stdout=${stdout.slice(0, 500)}`)
        console.log(`[callAgent] ${agentId}: stderr=${stderr.slice(0, 500)}`)

        // Extract JSON from stdout or stderr — the CLI may mix warning lines with JSON in stderr
        // Strategy: try each line starting with '{' as a JSON candidate, longest first
        function tryParseJson(text: string): any | null {
          // Collect all positions where '{' appears at the start of a line
          const lines = text.split('\n')
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim()
            if (line.startsWith('{')) {
              // Try parsing from this line to the end (JSON may span multiple lines)
              const candidate = lines.slice(i).join('\n').trim()
              // Trim trailing non-JSON garbage after last }
              const lastBrace = candidate.lastIndexOf('}')
              if (lastBrace < 0) continue
              const trimmed = candidate.slice(0, lastBrace + 1)
              try {
                return JSON.parse(trimmed)
              } catch {
                // Try sanitizing control chars inside string values
                let sanitized = ''
                let inStr = false
                let esc = false
                for (let j = 0; j < trimmed.length; j++) {
                  const ch = trimmed[j]
                  const cc = trimmed.charCodeAt(j)
                  if (esc) { sanitized += ch; esc = false; continue }
                  if (ch === '\\' && inStr) { sanitized += ch; esc = true; continue }
                  if (ch === '"') { inStr = !inStr; sanitized += ch; continue }
                  if (inStr && cc <= 0x1f) {
                    if (ch === '\n') sanitized += '\\n'
                    else if (ch === '\r') sanitized += '\\r'
                    else if (ch === '\t') sanitized += '\\t'
                    continue
                  }
                  sanitized += ch
                }
                try { return JSON.parse(sanitized) } catch {}
              }
            }
          }
          return null
        }

        let result = tryParseJson(stdout) || tryParseJson(stderr)

        let responseText = ''
        if (result) {
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
              actorUserId: actor?.userId,
              actorLogin: actor?.login,
              actorEmail: actor?.email,
              dashboardInstanceId: getConfiguredDashboardInstanceId(),
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
        responseText = normalizeChatMessage(responseText)
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
  }))
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
  const { content, mentions, from, byok } = req.body as { content?: string; mentions?: string[]; from?: string; byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string } }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)
  const session = getAuthenticatedSession(req)

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
      const communityContext = `[You are participating in a ClawMax community named "${decodedName}". Respond normally in this shared chat when addressed. Do not look for or mention a separate session label. Message from ${from || 'User'}:]\n\n${content}`

      for (let i = 0; i < mentions.length; i++) {
        const agentId = mentions[i]
        if (i > 0) await new Promise(r => setTimeout(r, 3000))
        try {
          const agentSessionId = `community:${decodedName}:${agentId}`
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          let response = await callAgent(agentId, communityContext, agentSessionId, byok, session || undefined)

          // Retry once if empty response
          if (!response || !response.trim()) {
            console.log(`[Group Chat] Agent ${agentId} returned empty — retrying after 2s`)
            await new Promise(r => setTimeout(r, 2000))
            response = await callAgent(agentId, communityContext, agentSessionId, byok, session || undefined)
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
  const { content, mentions, from, byok } = req.body as { content?: string; mentions?: string[]; from?: string; byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string } }

  if (!content || typeof content !== 'string') {
    res.status(400).json({ ok: false, error: 'content is required' })
    return
  }

  const decodedName = decodeURIComponent(name)
  const session = getAuthenticatedSession(req)

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
      const groupContext = `[You are participating in a ClawMax group named "${decodedName}". Respond normally in this shared chat when addressed. Do not look for or mention a separate session label. Message from ${from || 'User'}:]\n\n${content}`

      for (let i = 0; i < mentions.length; i++) {
        const agentId = mentions[i]
        // Small delay between agents to avoid gateway race
        if (i > 0) await new Promise(r => setTimeout(r, 3000))
        try {
          const agentSessionId = `group:${decodedName}:${agentId}`
          console.log(`[Group Chat] Calling agent ${agentId} with message: "${content}"`)
          let response = await callAgent(agentId, groupContext, agentSessionId, byok, session || undefined)

          // Retry once if empty response (common with 2nd+ agent due to gateway timing)
          if (!response || !response.trim()) {
            console.log(`[Group Chat] Agent ${agentId} returned empty — retrying after 2s`)
            await new Promise(r => setTimeout(r, 2000))
            response = await callAgent(agentId, groupContext, agentSessionId, byok, session || undefined)
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

// ============================================================================
// Agent-to-Agent Direct Messaging
// ============================================================================

// GET /api/direct-messages/:from/:to — get direct messages between two agents
router.get('/direct-messages/:from/:to', (req, res) => {
  const { from, to } = req.params
  const key = directMessageKey(from, to)
  const messages = getMessages('direct', key)
  res.json({ messages, from, to })
})

// POST /api/direct-messages/:from/:to — send a direct message from one agent to another
router.post('/direct-messages/:from/:to', async (req, res) => {
  const { from, to } = req.params
  const { content, callAgent: shouldCallAgent } = req.body as { content?: string; callAgent?: boolean }

  if (!content) {
    return res.status(400).json({ error: 'content is required' })
  }

  const key = directMessageKey(from, to)
  const session = getAuthenticatedSession(req)

  // Add the sender's message
  const msg = addMessage('direct', key, { from, content, mentions: [to] })

  // Optionally call the receiving agent to generate a response
  if (shouldCallAgent) {
    try {
      const dmContext = `[Direct message from ${from}]\n\n${content}`
      const response = await callAgent(to, dmContext, `direct:${key}`, undefined, session || undefined)
      if (response && response.trim()) {
        addMessage('direct', key, { from: to, content: response, mentions: [from] })
      }
    } catch (err) {
      console.error(`[DM] Failed to get response from ${to}:`, err)
    }
  }

  // Return all messages in the conversation
  const messages = getMessages('direct', key)
  res.json({ ok: true, message: msg, messages })
})

// GET /api/direct-messages — list all active direct message conversations
router.get('/direct-messages', (_req, res) => {
  // Scan the direct messages directory for conversations
  const messagesDir = path.join(getWorkspacePath(), 'SYSTEM', 'messages', 'direct')
  const conversations: Array<{ agents: string[]; lastMessage?: string; lastTimestamp?: number; messageCount: number }> = []

  try {
    if (fs.existsSync(messagesDir)) {
      const files = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'))
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf-8'))
          const messages: Message[] = Array.isArray(data) ? data : data.messages || []
          if (messages.length > 0) {
            const agentSet = new Set<string>()
            for (const message of messages) {
              if (message?.from) {
                agentSet.add(message.from)
              }
              for (const mention of message?.mentions || []) {
                if (mention) {
                  agentSet.add(mention)
                }
              }
            }
            const agents = Array.from(agentSet).sort()
            const last = messages[messages.length - 1]
            if (agents.length >= 2) {
              conversations.push({
                agents,
                lastMessage: last?.content?.slice(0, 100),
                lastTimestamp: last?.timestamp,
                messageCount: messages.length,
              })
            }
          }
        } catch {}
      }
    }
  } catch {}

  conversations.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
  res.json({ conversations })
})

export default router
