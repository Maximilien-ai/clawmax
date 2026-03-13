#!/usr/bin/env ts-node
/**
 * Migration script: Add "Live Configuration" section to all IDENTITY.md files
 * This adds the current model from openclaw.json to each agent's IDENTITY.md
 */

import * as fs from 'fs'
import * as path from 'path'

const HOME = process.env.HOME || ''
const AGENTS_DIR = path.join(HOME, '.openclaw', 'workspace', 'AGENTS')
const CONFIG_PATH = path.join(HOME, '.openclaw', 'openclaw.json')

async function main() {
  console.log('🔧 Migrating IDENTITY.md files to include Live Configuration...\n')

  // Read openclaw.json
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  const agentList = config?.agents?.list || []

  // Get all agent directories
  const agentDirs = fs.readdirSync(AGENTS_DIR).filter(name => {
    const fullPath = path.join(AGENTS_DIR, name)
    return fs.statSync(fullPath).isDirectory()
  })

  let migrated = 0
  let skipped = 0

  for (const agentId of agentDirs) {
    const identityPath = path.join(AGENTS_DIR, agentId, 'IDENTITY.md')

    if (!fs.existsSync(identityPath)) {
      console.log(`⏭️  Skipping ${agentId}: no IDENTITY.md`)
      skipped++
      continue
    }

    let content = fs.readFileSync(identityPath, 'utf-8')

    // Check if Live Configuration section already exists
    if (content.includes('## Live Configuration')) {
      console.log(`⏭️  Skipping ${agentId}: Live Configuration already exists`)
      skipped++
      continue
    }

    // Find agent in config
    const liveAgent = agentList.find((a: any) => a.id === agentId)
    const liveModel = liveAgent?.model || 'unknown'

    // Add Live Configuration section after Creation Metadata
    const liveConfigSection = `

## Live Configuration

> **Note:** This section shows the agent's current runtime configuration from \`openclaw.json\`.
> The API always returns live values, so cloning will use the current model, not the creation model.

- **Model:** ${liveModel}
- **Workspace:** ${liveAgent?.workspace || 'N/A'}
- **Agent Dir:** ${liveAgent?.agentDir || 'N/A'}
`

    // Insert after Creation Metadata section
    const metadataEndPattern = /## Creation Metadata[\s\S]*?(?=\n##|\n---|$)/i
    const match = content.match(metadataEndPattern)

    if (match) {
      const insertPosition = match.index! + match[0].length
      content = content.slice(0, insertPosition) + liveConfigSection + content.slice(insertPosition)
    } else {
      // If no Creation Metadata, add at the end
      content += liveConfigSection
    }

    // Write back
    fs.writeFileSync(identityPath, content)
    console.log(`✅ Migrated ${agentId}: model=${liveModel}`)
    migrated++
  }

  console.log(`\n📊 Migration complete:`)
  console.log(`   ✅ Migrated: ${migrated}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
}

main().catch(console.error)
