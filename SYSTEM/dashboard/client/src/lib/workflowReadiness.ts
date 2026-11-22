export function scheduleGuidance(schedule: string, enabled: boolean, pipelinePaused: boolean) {
  if (pipelinePaused) return 'Pipeline paused. Resume the pipeline to allow new runs.'
  if (!schedule || schedule.trim().toLowerCase() === 'manual') {
    return enabled ? 'Runs on demand. Use Run to start it.' : 'Resume this workflow to run it on demand.'
  }
  return enabled ? 'Waiting for the next scheduled run.' : 'Enable this workflow to schedule runs.'
}

export async function resumeWorkflows(ids: string[], request: typeof fetch = fetch) {
  const results = await Promise.allSettled(ids.map(async id => {
    const response = await request(`/api/workflows/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    })
    if (!response.ok) throw new Error('Workflow update failed')
  }))
  return ids.filter((_, index) => results[index].status === 'rejected')
}
