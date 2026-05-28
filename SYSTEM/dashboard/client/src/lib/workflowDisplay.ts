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
