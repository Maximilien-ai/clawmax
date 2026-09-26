import { getWorkspaceManager } from './workspace-manager'
import { getAgentSkills } from './skills'
import { deliverAvailableBriefs } from './brief-delivery'
import { executeClawmaxResendSend } from './clawmax-resend-command'
import { createNotification } from './notifications'

let timer: NodeJS.Timeout | undefined
let busy = false
export function startDevBriefDeliveryWorker() {
  if (timer || process.env.CLAWMAX_DEV_HOST_SKILL_CHAT !== '1') return
  timer = setInterval(() => { void tick() }, 15_000)
  timer.unref()
}
async function tick() {
  if (busy || process.env.CLAWMAX_DEV_HOST_SKILL_CHAT !== '1') return
  busy = true
  try {
    const manager = getWorkspaceManager()
    const id = process.env.CLAWMAX_DEV_HOST_WORKSPACE_ID || ''
    if (!id) return
    await manager.withWorkspace(id, async () => {
      const workspace = manager.getWorkspace(id)
      if (!workspace) return
      try { await deliverAvailableBriefs(workspace.path, {
        authorize: config => {
          if (!getAgentSkills(config.reporterId).includes('clawmax-resend')) throw new Error('Reporter Skill unavailable')
        },
        send: (config, body) => executeClawmaxResendSend({ agentId: config.reporterId, workspaceRoot: workspace.path, workspaceLabel: workspace.name, to: config.recipient, subject: 'Operations briefs', body, attachmentPaths: [] }),
        notify: receipt => { createNotification({
          type: receipt.status === 'sent' ? 'workflow-progress' : 'agent-error',
          title: receipt.status === 'sent' ? 'Operations Reporter emailed your briefs' : 'Brief email needs review',
          message: receipt.status === 'sent' ? `${receipt.runIds.length} brief(s) submitted to ${receipt.recipient}.` : 'Email acceptance could not be confirmed. Check Resend before retrying; no automatic resend will occur.',
          entityType: 'agent', entityId: receipt.reporterId, fingerprint: `brief-delivery:${receipt.id}`,
        }) },
      }) } catch {
        createNotification({ type: 'agent-error', title: 'Brief delivery is blocked', message: 'Check the reporting configuration, Reporter Skill assignment, and delivery receipts. No email was automatically retried.', fingerprint: 'brief-delivery:blocked' })
      }
    })
  } catch { /* No private provider diagnostics or report content in logs. */ }
  finally { busy = false }
}
