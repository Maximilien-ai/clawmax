export function getWorkflowDisplayName(workflowName: string, pipelineTitle?: string): string {
  const fullName = `${workflowName || ''}`.trim()
  if (!fullName) return fullName

  const title = `${pipelineTitle || ''}`.trim()
  const withoutPipeline = title && title !== 'Pipeline' && fullName.startsWith(`${title} · `)
    ? fullName.slice(`${title} · `.length).trim()
    : fullName

  const slashParts = withoutPipeline.split('/').map((part) => part.trim()).filter(Boolean)
  if (slashParts.length > 1) {
    return slashParts[slashParts.length - 1]
  }

  return withoutPipeline
}

type WorkflowNameRef = {
  id: string
  name: string
}

type WorkflowHandoffRef = {
  workflowId: string
  workflowName?: string
  upstreamWorkflowId: string
  label?: string
  outputKey: string
  summary?: string
  artifactPath?: string
  missing?: boolean
}

export function buildWorkflowHandoffDisplay(
  handoffs: WorkflowHandoffRef[],
  workflows: WorkflowNameRef[],
  pipelineTitle?: string,
) {
  const workflowNameById = new Map(
    workflows.map((workflow) => [workflow.id, workflow.name]),
  )

  return handoffs.map((handoff, index) => {
    const upstreamFullName = workflowNameById.get(handoff.upstreamWorkflowId) || handoff.upstreamWorkflowId
    const downstreamFullName = workflowNameById.get(handoff.workflowId) || handoff.workflowName || handoff.workflowId
    return {
      key: `${handoff.upstreamWorkflowId}-${handoff.workflowId}-${handoff.outputKey}-${index}`,
      upstreamWorkflowId: handoff.upstreamWorkflowId,
      upstreamWorkflowName: upstreamFullName,
      upstreamDisplayName: getWorkflowDisplayName(upstreamFullName, pipelineTitle) || handoff.upstreamWorkflowId,
      downstreamWorkflowId: handoff.workflowId,
      downstreamWorkflowName: downstreamFullName,
      downstreamDisplayName: getWorkflowDisplayName(downstreamFullName, pipelineTitle) || handoff.workflowId,
      outputKey: handoff.outputKey,
      label: `${handoff.label || handoff.outputKey || 'handoff'}`.trim(),
      summary: handoff.summary,
      artifactPath: handoff.artifactPath,
      missing: !!handoff.missing,
    }
  })
}
