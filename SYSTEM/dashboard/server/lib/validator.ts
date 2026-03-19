import Ajv, { ValidateFunction } from 'ajv'
import fs from 'fs'
import path from 'path'
import { SCHEMAS_DIR } from './paths'

const ajv = new Ajv({ allErrors: true, strict: false })

// Schema cache
const schemas: Record<string, ValidateFunction> = {}

/**
 * Load and compile a JSON schema
 */
function loadSchema(schemaName: string): ValidateFunction {
  if (schemas[schemaName]) {
    return schemas[schemaName]
  }

  const schemaPath = path.join(SCHEMAS_DIR, `${schemaName}.schema.json`)
  try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
    const schema = JSON.parse(schemaContent)
    const validate = ajv.compile(schema)
    schemas[schemaName] = validate
    return validate
  } catch (err) {
    console.error(`Failed to load schema ${schemaName}:`, err)
    throw new Error(`Schema ${schemaName} not found or invalid`)
  }
}

export interface ValidationError {
  field: string
  message: string
  value?: any
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validate parsed data against a schema
 */
export function validate(schemaName: string, data: any): ValidationResult {
  const validateFn = loadSchema(schemaName)
  const valid = validateFn(data)

  if (valid) {
    return { valid: true, errors: [] }
  }

  const errors: ValidationError[] = (validateFn.errors || []).map(err => {
    const field = err.instancePath || err.schemaPath || 'root'
    let message = err.message || 'Validation error'

    // Make error messages more user-friendly
    if (err.keyword === 'pattern') {
      message = `Invalid format: ${message}`
    } else if (err.keyword === 'minLength') {
      message = 'Cannot be empty'
    } else if (err.keyword === 'enum') {
      message = `Must be one of: ${(err.params as any).allowedValues?.join(', ')}`
    } else if (err.keyword === 'uniqueItems') {
      message = 'Contains duplicate values'
    }

    return {
      field: field.replace(/^\//, '').replace(/\//g, '.'),
      message,
      value: err.data
    }
  })

  return { valid: false, errors }
}

/**
 * Validate communities data
 */
export function validateCommunities(communities: any[]): ValidationResult {
  return validate('communities', { communities })
}

/**
 * Validate groups data
 */
export function validateGroups(groups: any[]): ValidationResult {
  return validate('groups', { groups })
}

/**
 * Validate agent identity data
 */
export function validateIdentity(identity: any): ValidationResult {
  return validate('identity', identity)
}

/**
 * Validate agents list from openclaw.json
 */
export function validateAgents(agentsData: any): ValidationResult {
  return validate('agents', agentsData)
}

/**
 * Validate agent TOOLS.md content
 */
export function validateTools(content: string): ValidationResult {
  return validate('tools', { content })
}

/**
 * Validate agent SOUL.md content
 */
export function validateSoul(content: string): ValidationResult {
  return validate('soul', { content })
}

/**
 * Validate agent MANDATE.md content
 */
export function validateMandate(content: string): ValidationResult {
  return validate('mandate', { content })
}
