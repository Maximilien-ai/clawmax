# Simplify + Harden + Optimize Sprint: 1.9.3

> Planned: June 30, 2026
> Baseline: `1.9.2-test-rc1` validation in progress

## Goal

Use `1.9.3` as the focused chat-archives cleanup release after the `1.9.2` diagnostics and DocHub follow-through, while closing the most visible new cloud/mobile regressions discovered during `1.9.2` validation.

- fix the visible chat archive regressions reported in `#158`
- restore proper continue / resume behavior for archived conversations from `#159`
- keep the scope centered on chat archive correctness, not a broad chat rewrite
- add explicit regression coverage for archive parsing, listing, restore, and resume behavior
- fix the Templates mobile layout overflow regression seen on cloud Safari/iPhone
- fix the Workflows first-load stall where the page can sit loading until a workspace switch/revisit

## Scope

### Section 1: Chat Archive List Correctness

- [ ] fix archive timestamps that currently collapse to `12/31/1969`
- [ ] stop rendering `.trajectory.jsonl` and similar runtime files as empty archive rows
- [ ] ensure archive titles come from the real archived conversation content, not injected runtime/system context
- [ ] normalize archive metadata parsing so incomplete/malformed archive files fail safely instead of polluting the list
- [ ] verify archive sorting and display remain stable across local, cloud, and on-prem runtimes

### Section 2: Archived Conversation Restore / Resume

- [ ] add or harden the restore endpoint for archived chats
- [ ] allow users to continue/resume a past archived conversation instead of forcing a fresh thread every time
- [ ] keep copy/download/delete working after restore support lands
- [ ] preserve safe behavior for archived sessions with missing or incompatible runtime metadata
- [ ] make resume failures actionable when the archived thread cannot be restored exactly

### Section 3: Chat / Thread Follow-Through

- [ ] re-audit archive-related thread state once restore lands
- [ ] keep runtime/session noise from overshadowing the primary archive error state
- [ ] verify archived/live session boundaries are clear in the UI
- [ ] check whether any shared chat/document navigation chips need archive-aware path handling

### Section 4: Coverage Direction

- [ ] add direct regression coverage for archive list parsing and filtering
- [ ] add direct regression coverage for restore/resume endpoints and client behavior
- [ ] use `--coverage` at meaningful checkpoints to ensure archive/runtime code, not only helper lanes, is moving
- [ ] prefer real chat archive/server coverage over generic lane-count growth

### Section 5: New 1.9.2 Validation Regressions

- [ ] fix Templates page mobile overflow so filter/action chips and cards do not force horizontal spill on iPhone/Safari-sized viewports
- [ ] add a direct regression for Templates mobile control wrapping or overflow-safe behavior
- [ ] fix Workflows first-load behavior when cloud/workspace/doc initialization races leave the page stuck until switching away and back
- [ ] add direct regression coverage for the Workflows initial-load state so the first visit succeeds without a workspace switch workaround

## Out of Scope

- [ ] no broad chat UX redesign
- [ ] no unrelated workflow/archive cleanup outside the chat archive path
- [ ] no OpenClaw version bump
- [ ] no generic docs-only scope unless needed to explain new archive behavior

## Guardrails

- [ ] every user-visible archive fix adds explicit regression coverage
- [ ] preserve cloud/on-prem compatibility for archive storage and retrieval
- [ ] do not regress active/live chat while fixing archived chat behavior
- [ ] keep `1.9.3` tight and product-visible
