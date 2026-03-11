#!/usr/bin/env ts-node
/**
 * Cleanup script to remove archived agents from COMMUNITIES.md and GROUPS.md
 * This handles agents that were archived before the cleanup code was added
 */

import * as fs from 'fs'
import * as path from 'path'

const WORKSPACE_PATH = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')
const AGENTS_DIR = path.join(WORKSPACE_PATH, 'AGENTS')
const ARCHIVE_DIR = path.join(AGENTS_DIR, 'archive')
const COMMUNITIES_PATH = path.join(WORKSPACE_PATH, 'ORG', 'COMMUNITIES.md')
const GROUPS_PATH = path.join(WORKSPACE_PATH, 'ORG', 'GROUPS.md')

function getArchivedAgents(): string[] {
  const archived: string[] = []

  if (!fs.existsSync(ARCHIVE_DIR)) {
    return archived
  }

  const entries = fs.readdirSync(ARCHIVE_DIR, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) {
      archived.push(entry.name)
    }
  }

  return archived
}

function removeAgentFromMembersList(content: string, agentId: string): string {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match Members line (with or without leading dash)
    if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
      const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
      if (membersMatch) {
        const prefix = membersMatch[1]
        const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== agentId)
        lines[i] = prefix + membersList.join(', ')
      }
    }
  }

  return lines.join('\n')
}

function main() {
  const archivedAgents = getArchivedAgents()

  if (archivedAgents.length === 0) {
    console.log('No archived agents found')
    return
  }

  console.log(`Found ${archivedAgents.length} archived agent(s): ${archivedAgents.join(', ')}`)

  let communitiesUpdated = 0
  let groupsUpdated = 0

  // Clean up COMMUNITIES.md
  if (fs.existsSync(COMMUNITIES_PATH)) {
    let content = fs.readFileSync(COMMUNITIES_PATH, 'utf-8')
    const originalContent = content

    for (const agentId of archivedAgents) {
      content = removeAgentFromMembersList(content, agentId)
    }

    if (content !== originalContent) {
      fs.writeFileSync(COMMUNITIES_PATH, content, 'utf-8')
      communitiesUpdated = 1
      console.log('✅ Updated COMMUNITIES.md')
    } else {
      console.log('✓ COMMUNITIES.md already clean')
    }
  }

  // Clean up GROUPS.md
  if (fs.existsSync(GROUPS_PATH)) {
    let content = fs.readFileSync(GROUPS_PATH, 'utf-8')
    const originalContent = content

    for (const agentId of archivedAgents) {
      content = removeAgentFromMembersList(content, agentId)
    }

    if (content !== originalContent) {
      fs.writeFileSync(GROUPS_PATH, content, 'utf-8')
      groupsUpdated = 1
      console.log('✅ Updated GROUPS.md')
    } else {
      console.log('✓ GROUPS.md already clean')
    }
  }

  if (communitiesUpdated || groupsUpdated) {
    console.log(`\n✅ Cleanup complete! Removed archived agents from member lists.`)
  } else {
    console.log(`\n✓ No cleanup needed - all member lists are already clean.`)
  }
}

main()
