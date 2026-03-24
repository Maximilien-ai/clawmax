# Test Template

**Version**: 1.0.0
**Type**: Minimal Testing Fixture

## Overview

A minimal organization template designed for testing ClawMax functionality. This template provides the bare minimum components needed to validate agent creation, group communication, community coordination, and workflow execution.

## What's Included

### Agents (2)
- **test1** - Test Assistant
- **test2** - Test Engineer

### Groups (1)
- **test-group** - Basic group for agent communication

### Communities (1)
- **test-community** - Basic community for multiagent coordination

### Workflows (1)
- **test-workflow** - Simple manual workflow for validation (disabled by default)

## Use Cases

- Testing template import functionality
- Validating agent creation and provisioning
- Testing group and community creation
- Workflow validation
- Integration testing
- Quick smoke tests

## Installation

1. Go to **Templates** → **Organizations** in the dashboard
2. Click **Import** on the "Test Template"
3. Confirm the import
4. Check the **Agents** tab to see test1 and test2

## Testing Workflow

After importing:

1. **Verify Agents**: Check that test1 and test2 appear in the Agents page
2. **Check Group**: Verify "test-group" exists in Groups
3. **Check Community**: Verify "test-community" exists in Communities
4. **Test Workflow**: Manually trigger "test-workflow" to validate execution

## Cleanup

To remove the test template:

1. Delete test1 and test2 agents
2. Delete test-group group
3. Delete test-community community
4. Delete test-workflow workflow

Or simply switch to a different workspace.

## Notes

- This template is intentionally minimal - it's a testing fixture, not a production template
- The workflow is disabled by default to prevent automatic execution
- All components are tagged with "test" for easy identification
- No skills are assigned to agents by default
