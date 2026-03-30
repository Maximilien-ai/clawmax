# Workspaces

This directory contains ClawMax workspace data — agents, workflows, groups, communities, and runtime state.

## Structure

```
WORKSPACES/
├── default/              # Default workspace (created by setup.sh)
│   ├── AGENTS/           # Agent configurations (IDENTITY.md, SOUL.md, etc.)
│   ├── WORKFLOWS/        # Workflow definitions (.md files with YAML frontmatter)
│   ├── ORG/              # Organization files (COMMUNITIES.md, GROUPS.md)
│   ├── TEMPLATES/        # Workspace-local templates (optional)
│   ├── SKILLS/custom/    # Workspace custom skills
│   └── SYSTEM/           # Runtime state (notifications, agent-state)
└── README.md             # This file
```

## Multiple Workspaces

You can create additional workspaces from the dashboard workspace switcher. Each workspace is completely independent — its own agents, workflows, and configuration.

## Git & Version Control

By default, workspace data is **not committed to git** (excluded via `.gitignore`). This is intentional — workspace data includes runtime state, execution history, and potentially sensitive agent conversations.

**To version-control your workspace:**

1. Remove the workspace exclusion from `.gitignore`:
   ```
   # Comment out or remove this line in .gitignore:
   # WORKSPACES/
   ```

2. Add your workspace selectively:
   ```bash
   git add WORKSPACES/default/AGENTS/*/IDENTITY.md
   git add WORKSPACES/default/WORKFLOWS/*.md
   git add WORKSPACES/default/ORG/
   ```

3. Consider excluding runtime files:
   ```gitignore
   # Keep in .gitignore even when tracking workspaces:
   WORKSPACES/*/SYSTEM/notifications.json
   WORKSPACES/*/SYSTEM/agent-state.json
   WORKSPACES/*/.dashboard-token
   ```

## Backups

To back up a workspace, copy or zip the entire directory:
```bash
tar -czf workspace-backup.tar.gz WORKSPACES/default/
```
