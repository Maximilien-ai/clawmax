import type { SecretRequirement } from './localSecrets'

type WorkflowLike = {
  id?: string
  name?: string
  content?: string
}

type OrganizationTemplateLike = {
  secretRequirements?: SecretRequirement[]
  workflows?: WorkflowLike[]
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim()
  return /^\[[^\]]*\]$/.test(trimmed) || /^\{\{[^}]+\}\}$/.test(trimmed)
}

export function organizationTemplateRequiresCustomization(template: OrganizationTemplateLike): boolean {
  if ((template.secretRequirements || []).some((requirement) => requirement.required)) {
    return true
  }

  const fieldRegex = /^-\s+\*\*(.+?):\*\*\s+(.+)$/gm

  for (const workflow of template.workflows || []) {
    const content = workflow.content || ''
    let match: RegExpExecArray | null
    while ((match = fieldRegex.exec(content)) !== null) {
      const label = (match[1] || '').trim()
      const value = (match[2] || '').trim()
      const optional = /\boptional\b/i.test(label) || /\boptional\b/i.test(value)
      if (!optional && isPlaceholderValue(value)) {
        return true
      }
    }
  }

  return false
}

export function organizationTemplateCanApplyNow(template: OrganizationTemplateLike): boolean {
  return !organizationTemplateRequiresCustomization(template)
}
