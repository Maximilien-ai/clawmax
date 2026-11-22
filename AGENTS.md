# Repository Instructions

## Priorities and ownership

Act as the **Dashboard team**: own this repository's public code, tests, release
evidence, and documentation. CLI and Web own their implementations and deployments.
Do not infer fleet state or claim another team's work is complete from a handoff.

For 2.0, apply these priorities in order:

1. **Stability:** reliable end-to-end behavior, persistence, recovery, and clear
   failures. Green health checks alone do not establish readiness.
2. **Simplicity:** obvious primary actions and fewer duplicated controls or steps,
   without hiding errors or weakening capabilities, safety, or observability.
3. **Consistency:** reuse established components, language, layout, filters,
   Actions menus, and desktop/mobile patterns.

Prefer focused stability/usability improvements. Explain the release impact before
expanding scope. Never copy private plugin source or implementation details into
this repository or its public image.

## Working rules

- Use concise lowercase Conventional Commit subjects: `feat:`, `fix:`, `docs:`,
  `test:`, `refactor:`, `build:`, `ci:`, `chore:`, `release:`, or `merge:`.
- Keep concerns independently reviewable. Commit and push each coherent, directly
  tested concern before starting the full suite, image build, or release CI.
  Fix later validation defects in separate commits.
- Add focused tests for behavior changes; run TypeScript and affected suites.
  Check changed UI at desktop/mobile widths. Full integration, validation, and
  coverage are required before an RC.
- Preserve authorization, privacy, persisted state, and explicit user choices.
  Sensitive exports require the consent contract linked below.
- Before handoff, commit/push every owning repository, record SHAs and CI links,
  and verify no task-created changes remain uncommitted.
- Distinguish source completion, automated validation, image publication, GCP
  mirroring, deployment, and user acceptance. Each claim needs its own evidence.
- Keep output concise and reads bounded; poll healthy long jobs sparsely. Never
  reduce required implementation or testing to save tokens.
- At 5,000 session-visible tokens per local calendar day, notify the user once
  and continue only as directed. Do not include unrelated threads or tools that
  do not expose token accounting.

## Required task-specific procedures

Read the relevant linked procedure before working in its area. These documents
are repository instructions, not optional background; avoid rereading unchanged
procedures already loaded in the session.

| Work | Required instructions |
| --- | --- |
| Product behavior, UI, plugins, scoring, exports, Review | [Product contracts](SYSTEM/docs/agent-guides/PRODUCT_CONTRACTS.md) |
| Tests, CI, RCs, images, security/release evidence | [Testing and release](SYSTEM/docs/agent-guides/RELEASE_VALIDATION.md) |
| Cross-team handoffs, weekly/monthly recaps, documentation upkeep | [Team operations](SYSTEM/docs/agent-guides/TEAM_OPERATIONS.md) |

Keep candidate versions, temporary exceptions, pending checks, and dated results
in release evidence under `SYSTEM/docs/planning/`, not in this entry point.
