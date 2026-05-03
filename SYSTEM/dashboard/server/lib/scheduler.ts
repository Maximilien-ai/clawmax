import * as cron from 'node-cron'
import { listWorkflows, triggerWorkflow, updateWorkflow, resolveParticipants, syncWorkflowToCron } from './workflows'
import { listAgents } from './workspace'

interface ScheduledJob {
  task: any
  workflowId: string
  schedule: string
  timezone: string
}

const activeJobs = new Map<string, ScheduledJob>()
export const DEFAULT_WORKFLOW_TIMEZONE = 'UTC'

export function normalizeWorkflowTimezone(timezone?: string): string {
  return `${timezone || ''}`.trim() || DEFAULT_WORKFLOW_TIMEZONE
}

export function getWorkflowScheduleOptions(timezone?: string) {
  return { timezone: normalizeWorkflowTimezone(timezone) }
}

/**
 * Start the workflow scheduler. Scans all enabled workflows and
 * schedules them using node-cron. Called once on server startup.
 */
export function startScheduler() {
  console.log('[Scheduler] Starting workflow scheduler...')
  syncAllWorkflows({ syncCronRegistrations: true })
  console.log(`[Scheduler] ${activeJobs.size} workflow(s) scheduled`)
}

/**
 * Sync all workflows — schedule enabled ones, unschedule disabled ones.
 * Called on startup and whenever a workflow is created/updated/deleted.
 */
export function syncAllWorkflows(options: { syncCronRegistrations?: boolean } = {}) {
  const workflows = listWorkflows()
  const shouldSyncCronRegistrations = options.syncCronRegistrations === true
  const agents = shouldSyncCronRegistrations ? listAgents() : []

  // Track which workflows are still active
  const activeIds = new Set<string>()

  for (const workflow of workflows) {
    if (shouldSyncCronRegistrations) {
      const participants = resolveParticipants(workflow, agents).map((participant) => participant.agentId)
      const syncResult = syncWorkflowToCron(workflow, participants)
      const nextCronJobId = syncResult.cronJobId
      if (!syncResult.ok && workflow.enabled && workflow.schedule !== 'manual') {
        console.warn(`[Scheduler] Failed to sync gateway cron for ${workflow.id}: ${syncResult.error}`)
      } else if ((workflow.cronJobId || undefined) !== nextCronJobId) {
        updateWorkflow(workflow.id, { cronJobId: nextCronJobId })
      }
    }

    if (workflow.enabled && workflow.schedule !== 'manual') {
      activeIds.add(workflow.id)
      scheduleWorkflow(workflow.id, workflow.schedule, workflow.timezone)
    } else {
      unscheduleWorkflow(workflow.id)
    }
  }

  // Remove jobs for deleted workflows
  for (const [id] of activeJobs) {
    if (!activeIds.has(id)) {
      unscheduleWorkflow(id)
    }
  }
}

function scheduleWorkflow(workflowId: string, schedule: string, timezone?: string) {
  const existing = activeJobs.get(workflowId)
  const normalizedTimezone = normalizeWorkflowTimezone(timezone)

  // Skip if already scheduled with same cron
  if (existing && existing.schedule === schedule && existing.timezone === normalizedTimezone) return

  // Remove old job if schedule changed
  if (existing) {
    existing.task.stop()
    activeJobs.delete(workflowId)
  }

  // Validate cron expression
  if (!cron.validate(schedule)) {
    console.warn(`[Scheduler] Invalid cron for workflow ${workflowId}: ${schedule}`)
    return
  }

  const task = cron.schedule(schedule, () => {
    console.log(`[Scheduler] Triggering workflow: ${workflowId}`)
    // Note: cron triggers don't have BYOK keys — they use system/user-default keys from .env
    const result = triggerWorkflow(workflowId, { manual: false })
    if (result.success) {
      console.log(`[Scheduler] Workflow ${workflowId} triggered, execution: ${result.executionId}`)
    } else {
      console.error(`[Scheduler] Workflow ${workflowId} failed: ${result.error}`)
      // If it hit maxRuns, unschedule it
      if (result.error?.includes('max runs')) {
        unscheduleWorkflow(workflowId)
      }
    }
  }, getWorkflowScheduleOptions(normalizedTimezone))

  activeJobs.set(workflowId, { task, workflowId, schedule, timezone: normalizedTimezone })
  console.log(`[Scheduler] Scheduled ${workflowId}: ${schedule} (${normalizedTimezone})`)
}

function unscheduleWorkflow(workflowId: string) {
  const existing = activeJobs.get(workflowId)
  if (existing) {
    existing.task.stop()
    activeJobs.delete(workflowId)
    console.log(`[Scheduler] Unscheduled ${workflowId}`)
  }
}

/**
 * Stop all scheduled jobs. Called on graceful shutdown.
 */
export function stopScheduler() {
  for (const [id, job] of activeJobs) {
    job.task.stop()
  }
  activeJobs.clear()
  console.log('[Scheduler] All jobs stopped')
}
