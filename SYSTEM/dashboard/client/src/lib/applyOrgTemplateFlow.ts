export type ApplyOrgTemplateInitialMode = 'customize' | 'apply-now'
export type ApplyOrgWizardStep = 'preview' | 'prereqs' | 'customize' | 'deploy'
export type ApplyOrgCustomizeStep = 'team' | 'context' | 'secrets' | 'workflows' | 'agents'

export function resolveInitialApplyOrgWizardStep(initialMode: ApplyOrgTemplateInitialMode): ApplyOrgWizardStep {
  return initialMode === 'apply-now' ? 'deploy' : 'preview'
}

export function buildApplyOrgCustomizeSteps(secretRequirementCount: number): Array<{ id: ApplyOrgCustomizeStep; label: string }> {
  return [
    { id: 'team', label: 'Team' },
    { id: 'context', label: 'Context' },
    ...(secretRequirementCount > 0 ? [{ id: 'secrets' as const, label: 'Secrets' }] : []),
    { id: 'workflows', label: 'Workflows' },
    { id: 'agents', label: 'Agents' },
  ]
}
