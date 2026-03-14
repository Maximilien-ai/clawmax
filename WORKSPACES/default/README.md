# Default Workspace

This is the default workspace for ClawMax. It starts empty to give you a clean slate.

## Structure

```
default/
├── AGENTS/      # Your agent configurations
├── WORKFLOWS/   # Your workflow definitions
├── ORG/         # Organization files (GROUPS.md, COMMUNITIES.md, etc.)
├── SYSTEM/      # System messages and logs
└── TEMPLATES/   # Workspace-local templates (optional)
```

## Getting Started

1. **Import a team template** from the Dashboard:
   - Go to Templates → Organizations
   - Click "Small Startup Team" or "Engineering Team"
   - Click "Apply Template" to populate this workspace

2. **Create agents manually** using the Dashboard:
   - Go to Agents tab
   - Click "New Agent"
   - Configure and save

3. **Access global system templates**:
   - All workspaces share access to `TEMPLATES/` at the repo root
   - These include pre-built agent and organization templates

## Note

This workspace is intentionally empty. Use the ClawMax Dashboard to populate it with agents, workflows, and organization structure.
