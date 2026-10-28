/**
 * Which `- **Label:** value` fields in a workflow's markdown must be filled before an organization
 * template is applied. The apply wizard and the server's customization check share this rule, so the
 * form marks exactly the fields the server would reject.
 *
 * A field still holding its template placeholder is required unless its label or placeholder says
 * "optional", or the workflow's structured `inputs` declare it with `required: false`.
 */

export interface WorkflowInputDeclaration {
  name?: string
  label?: string
  required?: boolean
}

// [ \t] rather than \s: a field left blank must not borrow the next line as its value.
const FIELD_LINE = /^-[ \t]+\*\*([^\r\n]+?):\*\*[ \t]*([^\r\n]*)$/gm

export function readWorkflowFields(content: string): Array<{ label: string; value: string }> {
  return Array.from((content || '').matchAll(FIELD_LINE), match => ({ label: match[1].trim(), value: match[2].trim() }))
    .filter(field => Boolean(field.label))
}

export function isWorkflowPlaceholderValue(value: string): boolean {
  const trimmed = value.trim()
  return (
    !trimmed ||
    /^\[[^\]]*\]$/.test(trimmed) ||
    /^\{\{[^}]+\}\}$/.test(trimmed) ||
    trimmed === '...' ||
    trimmed === '…'
  )
}

function inputKey(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
}

export function isWorkflowFieldOptional(label: string, placeholder: string, inputs?: WorkflowInputDeclaration[]): boolean {
  // Declared inputs name the field by label ("Event type") or camelCase name ("eventType").
  const key = inputKey(label)
  const declared = (Array.isArray(inputs) ? inputs : []).find((input) => inputKey(input?.label) === key || inputKey(input?.name) === key)
  if (typeof declared?.required === 'boolean') return !declared.required
  return /\boptional\b/i.test(label) || /\boptional\b/i.test(placeholder)
}

/** Labels of required fields that still hold a placeholder, in document order. */
export function findMissingRequiredWorkflowFields(content: string, inputs?: WorkflowInputDeclaration[]): string[] {
  const missing: string[] = []
  for (const { label, value } of readWorkflowFields(content)) {
    if (isWorkflowPlaceholderValue(value) && !isWorkflowFieldOptional(label, value, inputs)) missing.push(label)
  }
  return missing
}
