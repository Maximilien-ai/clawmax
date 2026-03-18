import * as cron from 'node-cron'
import { listWorkflows, triggerWorkflow, updateWorkflow } from './workflows'

interface ScheduledJob {
  task: any
  workflowId: string
  schedule: string
}

const activeJobs = new Map<string, ScheduledJob>()

/**
 * Start the workflow scheduler. Scans all enabled workflows and
 * schedules them using node-cron. Called once on server startup.
 */
export function startScheduler() {
  console.log('[Scheduler] Starting workflow scheduler...')
  syncAllWorkflows()
  console.log(`[Scheduler] ${activeJobs.size} workflow(s) scheduled`)
}

/**
 * Sync all workflows — schedule enabled ones, unschedule disabled ones.
 * Called on startup and whenever a workflow is created/updated/deleted.
 */
export function syncAllWorkflows() {
  const workflows = listWorkflows()

  // Track which workflows are still active
  const activeIds = new Set<string>()

  for (const workflow of workflows) {
    if (workflow.enabled && workflow.schedule !== 'manual') {
      activeIds.add(workflow.id)
      scheduleWorkflow(workflow.id, workflow.schedule)
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

function scheduleWorkflow(workflowId: string, schedule: string) {
  const existing = activeJobs.get(workflowId)

  // Skip if already scheduled with same cron
  if (existing && existing.schedule === schedule) return

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
    const result = triggerWorkflow(workflowId)
    if (result.success) {
      console.log(`[Scheduler] Workflow ${workflowId} triggered, execution: ${result.executionId}`)
    } else {
      console.error(`[Scheduler] Workflow ${workflowId} failed: ${result.error}`)
      // If it hit maxRuns, unschedule it
      if (result.error?.includes('max runs')) {
        unscheduleWorkflow(workflowId)
      }
    }
  })

  activeJobs.set(workflowId, { task, workflowId, schedule })
  console.log(`[Scheduler] Scheduled ${workflowId}: ${schedule}`)
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
