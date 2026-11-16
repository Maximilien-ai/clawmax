import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { templateStoragePath } from './template-storage-path'

export function saveWorkflowBrief(root: string, workflowId: string, name: string, runId: string, text: string) {
  if (!/^[a-z0-9-]+$/.test(workflowId) || !/^[a-f0-9-]{36}$/.test(runId)) throw new Error('Invalid brief identity')
  const content = text.trim()
  if (!content || Buffer.byteLength(content) > 64 * 1024) throw new Error('Workflow brief unavailable')
  const title = name.replace(/[\r\n]/g, ' ').slice(0, 160)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'workflow'
  const artifactPath = `ORG/reports/${slug}-${workflowId.slice(-12)}/latest-brief.md`
  const file = templateStoragePath(root, artifactPath)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const markdown = `# ${title} — Brief\n\nRun: ${runId}\n\n${content}\n`
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, markdown, { flag: 'wx', mode: 0o600 })
    fs.renameSync(temporary, file)
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary) }
  return { title: `${title} — Brief`, content: markdown, artifactPath }
}
