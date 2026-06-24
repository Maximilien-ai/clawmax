import fs from 'fs'
import path from 'path'

type Area =
  | 'workflows'
  | 'notifications'
  | 'chat-communication'
  | 'docs-navigation'
  | 'templates-builder'
  | 'agents-provisioning'
  | 'runtime-integrations'
  | 'workspace-state'
  | 'skills-plugins'
  | 'release-infra'
  | 'other'

type TestEntry = {
  path: string
  domain: 'client' | 'server' | 'system' | 'other'
  area: Area
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue
      }
      files.push(...walk(full))
      continue
    }
    files.push(full)
  }
  return files
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

function isTestFile(relPath: string): boolean {
  return (
    /\.test\.ts$/.test(relPath) ||
    /\.test\.sh$/.test(relPath)
  )
}

function detectDomain(relPath: string): TestEntry['domain'] {
  if (relPath.startsWith('SYSTEM/dashboard/client/')) return 'client'
  if (relPath.startsWith('SYSTEM/dashboard/server/')) return 'server'
  if (relPath.startsWith('SYSTEM/dashboard/test/') || relPath.startsWith('SYSTEM/dashboard/docker-entrypoint')) return 'system'
  return 'other'
}

function detectArea(relPath: string): Area {
  const base = path.basename(relPath).toLowerCase()
  const full = relPath.toLowerCase()

  if (/workflow|cron-next-run|scheduler/.test(base) || /workflow/.test(full)) return 'workflows'
  if (/notification/.test(base) || /notification/.test(full)) return 'notifications'
  if (/chat|communication|channel/.test(base) || /(chat|communication|channels)/.test(full)) return 'chat-communication'
  if (/doc|markdownlinks|workspacefiles|promptattachments/.test(base) || /(dochub|docs|workspace-doc|workspace-file|markdown)/.test(full)) return 'docs-navigation'
  if (/template|builder|onboarding|discoverysuggestions/.test(base) || /(template|builder|onboarding)/.test(full)) return 'templates-builder'
  if (/agent/.test(base) || /(agents|addagent|agent-)/.test(full)) return 'agents-provisioning'
  if (/gateway|partner|integration|byok|auth|opik|metering|openclaw|host-agent|cloud-maintenance|dashboard-env|safe-env|model-discovery|github-auth/.test(base) || /(gateway|partner|integration|byok|auth|opik|metering|openclaw|host-agent|cloud-maintenance|dashboard-env|safe-env|model-discovery|github-auth)/.test(full)) return 'runtime-integrations'
  if (/workspace|systemrefresh|appnavigationstate|workspace-order|workspace-dashboard/.test(base) || /(workspace|systemrefresh)/.test(full)) return 'workspace-state'
  if (/skill|plugin/.test(base) || /(skill|plugin)/.test(full)) return 'skills-plugins'
  if (/docker|installer|setup|uninstall|update|version/.test(base) || /(docker|entrypoint|release|version)/.test(full)) return 'release-infra'
  return 'other'
}

function buildInventory(): TestEntry[] {
  return walk(path.join(REPO_ROOT, 'SYSTEM'))
    .map((absPath) => toPosix(path.relative(REPO_ROOT, absPath)))
    .filter(isTestFile)
    .map((relPath) => ({
      path: relPath,
      domain: detectDomain(relPath),
      area: detectArea(relPath),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function summarize(entries: TestEntry[]) {
  const byArea = new Map<Area, number>()
  const byDomain = new Map<string, number>()
  for (const entry of entries) {
    byArea.set(entry.area, (byArea.get(entry.area) || 0) + 1)
    byDomain.set(entry.domain, (byDomain.get(entry.domain) || 0) + 1)
  }
  return {
    byArea: Array.from(byArea.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    byDomain: Array.from(byDomain.entries()).sort((a, b) => a[0].localeCompare(b[0])),
  }
}

function formatMarkdown(entries: TestEntry[]): string {
  const summary = summarize(entries)
  const lines: string[] = []
  lines.push('# 1.9.1 Test Inventory Snapshot')
  lines.push('')
  lines.push(`- Generated: ${new Date().toISOString()}`)
  lines.push(`- Total test files inventoried: ${entries.length}`)
  lines.push('')
  lines.push('## By Domain')
  lines.push('')
  for (const [domain, count] of summary.byDomain) {
    lines.push(`- \`${domain}\`: ${count}`)
  }
  lines.push('')
  lines.push('## By Area')
  lines.push('')
  for (const [area, count] of summary.byArea) {
    lines.push(`- \`${area}\`: ${count}`)
  }
  lines.push('')
  lines.push('## Potentially Thin / High-Risk Areas To Review First')
  lines.push('')
  lines.push('- `docs-navigation`: many navigation helpers are covered, but low-context file-open behavior still tends to regress across multiple surfaces.')
  lines.push('- `workspace-state`: stale cross-workspace state is historically risky and still has relatively few targeted tests compared with the number of surfaces it affects.')
  lines.push('- `notifications`: route/helper coverage exists, but end-to-end resolution, lifecycle cleanup, and grouped presentation are still easy to regress.')
  lines.push('- `workflows`: strong helper coverage exists, but workflow success-vs-thread-delivery and upstream-failure surfacing still deserve more scenario coverage.')
  lines.push('- `agents-provisioning`: agent routes are fairly well tested, but Builder/Add Agent metadata persistence and template/apply edge cases remain high-signal regression targets.')
  lines.push('')
  lines.push('## Inventory')
  lines.push('')
  for (const entry of entries) {
    lines.push(`- [${entry.area}] [${entry.domain}] \`${entry.path}\``)
  }
  lines.push('')
  return lines.join('\n')
}

function main() {
  const entries = buildInventory()
  const markdown = formatMarkdown(entries)
  const outputPath = path.join(REPO_ROOT, 'SYSTEM', 'docs', 'testing', 'TEST_INVENTORY_1_9_1.md')
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, markdown, 'utf-8')
  process.stdout.write(markdown)
}

main()
