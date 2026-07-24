import type { GenericPluginRecord } from './plugins'

export interface ReviewExportReviewer {
  name: string
  email: string
}

export interface ReviewExportInstance {
  deploymentKind?: string
  instanceLabel?: string | null
  version?: string
  hostname?: string
  machineName?: string | null
  platform?: string
  workspace?: string
}

export interface ReleaseReviewExport {
  release: string
  reviewer: ReviewExportReviewer
  instance: ReviewExportInstance
  exportedAt: string
  records: GenericPluginRecord[]
  recentErrors: string[]
}

function markdownCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')
    .trim()
}

function fieldString(record: GenericPluginRecord, key: string): string {
  const value = record.fields[key]
  return typeof value === 'string' ? value.trim() : ''
}

function fieldList(record: GenericPluginRecord, key: string): string[] {
  const value = record.fields[key]
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

export function sanitizeReviewLogLine(line: string): string {
  return line
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    .replace(/\b(api[_-]?key|token|password|secret)\b(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[REDACTED]')
    .replace(/\b(sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b/g, '[REDACTED]')
    .slice(0, 1000)
}

export function isReviewErrorLine(line: string): boolean {
  return /\b(error|fatal|exception|failed|failure|panic)\b/i.test(line)
}

export function buildReleaseReviewFilename(release: string, exportedAt: string): string {
  const safeRelease = release.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'release'
  const timestamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-')
  return `clawmax-${safeRelease}-review-${timestamp}.md`
}

export function buildReleaseReviewMarkdown(input: ReleaseReviewExport): string {
  const records = input.records.filter((record) => fieldString(record, 'release') === input.release)
  const counts = { passed: 0, failed: 0, blocked: 0, pending: 0 }
  for (const record of records) {
    const outcome = fieldString(record, 'outcome')
    if (outcome === 'passed' || outcome === 'failed' || outcome === 'blocked') counts[outcome] += 1
    else counts.pending += 1
  }

  const instanceName = input.instance.instanceLabel || input.instance.machineName || input.instance.hostname || 'Unknown'
  const lines = [
    `# ClawMax ${markdownCell(input.release)} Release Review`,
    '',
    '## Review Details',
    '',
    `- Reviewer: ${markdownCell(input.reviewer.name || 'Not provided')}`,
    `- Email: ${markdownCell(input.reviewer.email || 'Not provided')}`,
    `- Exported: ${markdownCell(input.exportedAt)}`,
    `- Environment: ${markdownCell(input.instance.deploymentKind || 'unknown')}`,
    `- Instance: ${markdownCell(instanceName)}`,
    `- Dashboard version: ${markdownCell(input.instance.version || 'unknown')}`,
    `- Host: ${markdownCell(input.instance.hostname || 'unknown')}`,
    `- Platform: ${markdownCell(input.instance.platform || 'unknown')}`,
    `- Workspace: ${markdownCell(input.instance.workspace || 'unknown')}`,
    '',
    '## Summary',
    '',
    `- Total: ${records.length}`,
    `- Passed: ${counts.passed}`,
    `- Failed: ${counts.failed}`,
    `- Blocked: ${counts.blocked}`,
    `- Pending: ${counts.pending}`,
    '',
    '## Checklist',
    '',
    '| Outcome | Check | Area | Notes | Evidence | Updated |',
    '| --- | --- | --- | --- | --- | --- |',
    ...records.map((record) => {
      const outcome = fieldString(record, 'outcome') || 'pending'
      return `| ${markdownCell(outcome.toUpperCase())} | ${markdownCell(record.name)} | ${markdownCell(fieldString(record, 'area'))} | ${markdownCell(fieldString(record, 'notes'))} | ${markdownCell(fieldList(record, 'evidence').join(', '))} | ${markdownCell(record.updatedAt || record.createdAt || '')} |`
    }),
    '',
    '## Recent Runtime Errors',
    '',
    ...(input.recentErrors.length > 0
      ? input.recentErrors.map((line) => `- \`${markdownCell(sanitizeReviewLogLine(line))}\``)
      : ['No recent error lines were available when this review was exported.']),
    '',
  ]

  return lines.join('\n')
}
