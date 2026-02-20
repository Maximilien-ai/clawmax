import { Router } from 'express'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { updateGroupTags } from '../lib/workspace'
import { getMessages, addMessage } from '../lib/messages'

const router = Router()

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

    // Call agents in parallel
    Promise.all(
      mentions.map(async (agentId) => {
        try {
          const response = await callAgent(agentId, content, sessionId)
          if (response && response.trim()) {
            // Add agent response to message history
            addMessage('community', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
          }
        } catch (err) {
          console.error(`Failed to get response from agent ${agentId}:`, err)
        }
      })
    ).catch(err => console.error('Error calling agents:', err))
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

    // Call agents in parallel
    Promise.all(
      mentions.map(async (agentId) => {
        try {
          const response = await callAgent(agentId, content, sessionId)
          if (response && response.trim()) {
            // Add agent response to message history
            addMessage('group', decodedName, {
              from: agentId,
              content: response,
              mentions: []
            })
          }
        } catch (err) {
          console.error(`Failed to get response from agent ${agentId}:`, err)
        }
      })
    ).catch(err => console.error('Error calling agents:', err))
  }
})

export default router
