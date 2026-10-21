import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { devBriefReporterAvailable } from './dev-brief-delivery-worker'
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-ready-'))
const skills = require('./skills'), resend = require('./resend-partner')
const originalSkills = skills.getAgentSkills, originalKey = resend.getWorkspaceResendApiKey
const originalDev = process.env.CLAWMAX_DEV_HOST_SKILL_CHAT, originalNode = process.env.NODE_ENV
try {
  fs.mkdirSync(path.join(root, 'SYSTEM'))
  fs.writeFileSync(path.join(root, 'SYSTEM/brief-delivery.json'), JSON.stringify({ version: 1, enabled: true, recipient: 'owner@example.test', reporterId: 'reporter', enabledAt: '2026-01-01', workflowIds: ['tr-1234567890abcdef-workflow-123456789abc'] }))
  process.env.CLAWMAX_DEV_HOST_SKILL_CHAT = '1'; process.env.NODE_ENV = 'development'
  skills.getAgentSkills = () => ['clawmax-resend']; resend.getWorkspaceResendApiKey = () => 'synthetic-key'
  assert(devBriefReporterAvailable(root, 'reporter'))
  assert(!devBriefReporterAvailable(root, 'other-agent'))
  skills.getAgentSkills = () => []
  assert(!devBriefReporterAvailable(root, 'reporter'))
  skills.getAgentSkills = () => ['clawmax-resend']; resend.getWorkspaceResendApiKey = () => undefined
  assert(!devBriefReporterAvailable(root, 'reporter'))
  resend.getWorkspaceResendApiKey = () => 'synthetic-key'; process.env.NODE_ENV = 'production'
  assert(!devBriefReporterAvailable(root, 'reporter'))
  console.log('Reporter availability: exact Agent, assigned Skill, credentials and dev boundary passed')
} finally {
  skills.getAgentSkills = originalSkills; resend.getWorkspaceResendApiKey = originalKey
  if (originalDev === undefined) delete process.env.CLAWMAX_DEV_HOST_SKILL_CHAT; else process.env.CLAWMAX_DEV_HOST_SKILL_CHAT = originalDev
  if (originalNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNode
  fs.rmSync(root, { recursive: true, force: true })
}
