---
name: workspace-ls
description: |
  Lists the current workspace directory structure. Useful for verifying
  agent file access, checking what files exist, and debugging workspace state.
  Use this skill when you need to see the workspace layout or verify
  files were created correctly.
emoji: "📂"
tags:
  - test
  - debug
  - workspace
---

# Workspace Directory Listing

This skill lets you inspect your workspace directory structure.

## Usage

Run `ls -la` or `find` on the workspace directories to see:
- Agent configurations (AGENTS/)
- Workflow definitions (WORKFLOWS/)
- Organization files (ORG/)
- Custom skills (SKILLS/custom/)
- System files (SYSTEM/)

## Example Commands

```bash
# List workspace root
ls -la $OPENCLAW_WORKSPACE/

# List all agents
ls -la $OPENCLAW_WORKSPACE/AGENTS/

# List all workflows
ls -la $OPENCLAW_WORKSPACE/WORKFLOWS/

# Find all .md files
find $OPENCLAW_WORKSPACE -name "*.md" -maxdepth 3

# Check agent identity
cat $OPENCLAW_WORKSPACE/AGENTS/*/IDENTITY.md
```

## When to Use

- After template apply: verify agents and workflows were created
- During debugging: check file permissions and structure
- For system tests: validate workspace state
