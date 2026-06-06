---
name: clawmax-workspace-ls
description: |
  First-party ClawMax helper for listing the current workspace directory structure.
  Useful for verifying agent file access, checking what files exist, and debugging
  workspace state in templates, workflows, and support flows.
emoji: "📂"
tags:
  - clawmax
  - workspace
  - debug
  - helper
---

# ClawMax Workspace Directory Listing

This first-party ClawMax skill lets you inspect the current workspace directory structure.

## Usage

Run `ls -la` or `find` on the workspace directories to see:
- Agent configurations (`AGENTS/`)
- Workflow definitions (`WORKFLOWS/`)
- Organization files (`ORG/`)
- Custom skills (`SKILLS/custom/`)
- System files (`SYSTEM/`)

## Example Commands

```bash
# List workspace root
ls -la "$OPENCLAW_WORKSPACE/"

# List all agents
ls -la "$OPENCLAW_WORKSPACE/AGENTS/"

# List all workflows
ls -la "$OPENCLAW_WORKSPACE/WORKFLOWS/"

# Find all markdown files
find "$OPENCLAW_WORKSPACE" -name "*.md" -maxdepth 3

# Check agent identity
cat "$OPENCLAW_WORKSPACE"/AGENTS/*/IDENTITY.md
```

## When to Use

- After template apply: verify agents and workflows were created
- During debugging: check file permissions and structure
- For system tests: validate workspace state
