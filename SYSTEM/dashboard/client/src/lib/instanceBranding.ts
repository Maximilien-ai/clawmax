export type InstanceBrandingDeploymentKind = 'local' | 'onprem' | 'cloud'

export function normalizeInstanceLabel(label: string | null | undefined): string {
  return typeof label === 'string' ? label.trim() : ''
}

export function getInstanceDocumentTitle(label: string | null | undefined): string {
  const normalized = normalizeInstanceLabel(label)
  return normalized ? `ClawMax · ${normalized}` : 'ClawMax'
}

export function usesCloudInstanceAccent(deploymentKind: InstanceBrandingDeploymentKind | undefined): boolean {
  return deploymentKind === 'cloud'
}
