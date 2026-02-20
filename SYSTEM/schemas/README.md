# Schema Validation System

This directory contains JSON Schema definitions for validating OpenClaw workspace markdown files. Validation is automatically enforced when editing documents through the dashboard.

## Schemas

### `communities.schema.json`
Validates `ORG/COMMUNITIES.md` files.

**Required fields:**
- `name` - Community name (non-empty string)
- `description` - Purpose description (non-empty string)

**Optional fields:**
- `tags` - Array of lowercase tags (alphanumeric, dash, underscore only)
- `channels` - Array of communication channels (whatsapp, slack, discord, email, teams)

### `groups.schema.json`
Validates `ORG/GROUPS.md` and `AGENTS/*/GROUPS.md` files.

**Required fields:**
- `name` - Group name (non-empty string)
- `description` - Purpose description (non-empty string)

**Optional fields:**
- `tags` - Array of lowercase tags (alphanumeric, dash, underscore only)
- `community` - Parent community name
- `channels` - Array of communication channels (whatsapp, slack, discord, email, teams)

### `identity.schema.json`
Validates `AGENTS/*/IDENTITY.md` files.

**Required fields:**
- `name` - Agent ID (lowercase, alphanumeric, dash, underscore only)

**Optional fields:**
- `creature` - Agent's role or persona
- `vibe` - Personality or working style
- `emoji` - Single emoji representing the agent
- `whatsapp` - Phone number in E.164 format or empty string
- `tags` - Array of lowercase tags (alphanumeric, dash, underscore only)

## Validation Behavior

When saving documents via the dashboard:

1. **Auto-validation** - Files matching schema names (COMMUNITIES.md, GROUPS.md, IDENTITY.md) are automatically validated
2. **Parse-then-validate** - Markdown is parsed into structured data, then validated against JSON schema
3. **Detailed errors** - Validation failures return specific error messages with field names
4. **Prevent bad saves** - Invalid documents cannot be saved through the dashboard

## Validation Error Examples

```json
{
  "ok": false,
  "error": "Validation failed",
  "validationErrors": [
    {
      "field": "communities.0.tags.2",
      "message": "Invalid format: must match pattern",
      "value": "Invalid_Tag!"
    },
    {
      "field": "communities.1.description",
      "message": "Cannot be empty"
    }
  ]
}
```

## Adding New Schemas

To add validation for a new document type:

1. **Create schema file**: `SYSTEM/schemas/yourfile.schema.json`
2. **Add validator function**: In `SYSTEM/dashboard/server/lib/validator.ts`:
   ```typescript
   export function validateYourFile(data: any): ValidationResult {
     return validate('yourfile', data)
   }
   ```
3. **Add parser** (if needed): In `SYSTEM/dashboard/server/lib/workspace.ts`:
   ```typescript
   export function parseYourFile(content: string): any {
     // Parse markdown to structured data
   }
   ```
4. **Hook into save endpoint**: In `SYSTEM/dashboard/server/index.ts`:
   ```typescript
   else if (fileName === 'YOURFILE.md') {
     const data = parseYourFile(content)
     const validation = validateYourFile(data)
     if (!validation.valid) {
       res.status(400).json({
         ok: false,
         error: 'Validation failed',
         validationErrors: validation.errors
       })
       return
     }
   }
   ```

## Technical Details

- **Library**: [ajv](https://ajv.js.org/) - JSON Schema validator
- **Standard**: JSON Schema Draft-07
- **Cache**: Schemas are loaded once and cached in memory
- **Strict mode**: Disabled to allow flexible schema definitions
