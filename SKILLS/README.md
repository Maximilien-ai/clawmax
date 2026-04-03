# Skills Directory

This directory holds workspace-local ClawMax skills.

## Structure

- `custom/`
  - user-created or imported skills that belong to this workspace
  - each skill should live in its own folder
  - a skill folder typically includes:
    - `SKILL.md` — the human-readable skill instructions
    - optional implementation files such as `index.ts`, assets, or helper scripts

## Current Convention

ClawMax treats `SKILLS/custom/` as the main workspace skill area.

Example:

```text
SKILLS/
└── custom/
    └── workspace-ls/
        └── SKILL.md
```

## Notes

- bundled/system skills may also exist outside this directory in repo-managed locations
- this folder is for workspace-level additions, imports, and experiments
- keep each skill self-contained in its own subdirectory
