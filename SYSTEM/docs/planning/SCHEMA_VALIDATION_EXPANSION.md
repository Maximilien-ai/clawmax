# Schema Validation Expansion Plan

## Current State (Completed ✅)
- ✅ COMMUNITIES.md - Community definitions
- ✅ GROUPS.md - Group definitions
- ✅ IDENTITY.md - Agent identity and metadata

## Priority 1: Critical System Files (High Impact)
These files control core system behavior. Invalid data could break the system.

### AGENTS.md (Agent Directory)
**Risk**: High - Controls which agents exist and are active
**Schema needs**:
- Agent ID format validation
- Status field (active/inactive/archived)
- Required metadata fields
**Impact if invalid**: System might not find agents, dashboard could break

### TOOLS.md (Agent Capabilities)
**Risk**: Medium-High - Defines what tools agents can use
**Schema needs**:
- Tool name format
- Permission levels
- Required vs optional tools
**Impact if invalid**: Agents might not function, security issues

## Priority 2: Operational Files (Medium Impact)
These affect agent behavior but won't crash the system.

### SOUL.md (Agent Personality/Instructions)
**Risk**: Medium - Free-form but has structured sections
**Schema needs**:
- Required sections (Purpose, Personality, etc.)
- Minimum content length
- Format validation for structured parts
**Impact if invalid**: Agent might behave unexpectedly

### USER.md (User Context)
**Risk**: Medium - User information and preferences
**Schema needs**:
- Name format
- Contact info validation
- Preferences structure
**Impact if invalid**: Poor user experience, communication issues

## Priority 3: Optional/Low Risk (Low Impact)
These are mostly free-form or non-critical.

### HEARTBEAT.md
**Risk**: Low - Timestamp file, auto-generated
**Schema**: Not needed - system controlled

### TODOs.md / COMPLETED.md
**Risk**: Low - Free-form task lists
**Schema**: Not needed - user content

### BOOTSTRAP.md
**Risk**: Low - Onboarding instructions
**Schema**: Not needed - informational

### Memory files (memory/*.md)
**Risk**: Low - Free-form journal entries
**Schema**: Not needed - historical data

## Recommended Implementation Order

1. **Phase 1** (Next sprint):
   - AGENTS.md schema - Validates agent registry
   - Prevents broken agent configurations

2. **Phase 2** (Following sprint):
   - TOOLS.md schema - Ensures tool configurations are valid
   - SOUL.md schema - Basic structure validation

3. **Phase 3** (Future):
   - USER.md schema - User profile validation
   - Consider adding optional schemas for documentation consistency

## Schema Design Principles

1. **Minimal but effective**: Only validate what's truly needed
2. **Allow flexibility**: Free-form sections should stay free-form
3. **Clear errors**: Error messages must guide users to fix issues
4. **Non-breaking**: Invalid files should warn, not crash system
5. **Progressive enhancement**: Add validation incrementally

## Files That Should NOT Have Schemas

- Memory journals (`memory/*.md`) - Personal notes
- Planning docs (`SYSTEM/docs/planning/*.md`) - Evolving documents
- README files - Documentation
- Ad-hoc markdown files - User created content
