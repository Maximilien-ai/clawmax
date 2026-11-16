import type { SecretRequirement } from './localSecrets'
import { findMissingRequiredWorkflowFields, type WorkflowInputDeclaration } from '../../../server/lib/workflow-required-fields'

type WorkflowLike = {
  id?: string
  name?: string
  content?: string
  inputs?: WorkflowInputDeclaration[]
}

type OrganizationTemplateLike = {
  secretRequirements?: SecretRequirement[]
  workflows?: WorkflowLike[]
}

export function organizationTemplateRequiresCustomization(template: OrganizationTemplateLike): boolean {
  if ((template.secretRequirements || []).some((requirement) => requirement.required)) {
    return true
  }
  // The same rule the apply wizard and the server's customization check use.
  return (template.workflows || []).some((workflow) => findMissingRequiredWorkflowFields(workflow.content || '', workflow.inputs).length > 0)
}

export function organizationTemplateCanApplyNow(template: OrganizationTemplateLike): boolean {
  return !organizationTemplateRequiresCustomization(template)
}
