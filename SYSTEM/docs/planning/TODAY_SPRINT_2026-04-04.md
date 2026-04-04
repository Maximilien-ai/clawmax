# Today Sprint: April 4, 2026

> Time budget: 6 hours
> Repo state reviewed: local backlog/docs + live GitHub issues
> Planning bias: finish one high-risk runtime bug, then one contained integration fix, then use remaining time for validation/doc follow-through

## Current Open Issues

- `#94` High: temp chat/runtime can resolve duplicate agent ids against the wrong workspace
- `#8` High: Anthropic per-agent auth store still depends on shell env and logs confusing fallback errors
- `#95` Medium: event-planning templates need real-user validation and one refinement pass
- `#11` Medium: true clean-room setup run still incomplete
- `#32` Medium: cron should migrate from `node-cron` to OpenClaw native cron, but still needs a product/technical decision

## New Repro Candidate

- **Phantom workflow residue after archive/delete + reapply** — reported behavior: after archiving/deleting agents in one workspace, then creating a new workspace and applying the same team/template, running workflows can surface phantom earlier workflow variants. Treat as repro-needed until confirmed, then promote to a tracked issue immediately.

## New Runtime Evidence To Resume From

- **Gateway connection failure during activity/usage polling** — repeated server logs: `Gateway WebSocket error: connect ECONNREFUSED 127.0.0.1:18789`
- **Budget exceeded during Lu.ma retry** — server log showed workspace budget exceedance and agent pause while rerunning the decomposed Lu.ma workflows
- **Model/provider precedence likely broken during execution** — Lu.ma agents were configured for `ollama/qwen...`, but observed execution appeared to use Anthropic despite no dashboard `.env` provider keys and no shell provider exports, with only BYOK keys present in the browser
- **Implication** — need a focused runtime audit across gateway/local fallback, resolved agent model/provider, and BYOK precedence in workflow execution

## Backlog Signals

- `#94` is the clearest product risk because it can leak stale runtime/session behavior across workspaces during ad-hoc chat.
- `#8` is the next most actionable bug because it is narrow, user-visible, and likely fixable in one sitting.
- `#95` matters, but it is partly research/validation work rather than a clean engineering close.
- `#11` is useful, but a true clean-room run is hard to finish reliably inside a 6-hour coding sprint.
- `#32` should not be started today unless the decision is already made; it has architecture risk and unclear scope.

## Sprint Goal

Ship the highest-value reliability work that can plausibly be completed today without opening a broad architecture thread.

## Plan

### 1. Primary: close or materially de-risk `#94` (3 hours)

- Trace temp chat/group chat runtime agent resolution path
- Reproduce the duplicate-agent-id failure against workspace-scoped agents
- Fix workspace-aware runtime/session lookup so active workspace agents win consistently
- Run targeted tests or a focused repro validation

**Definition of done**
- temp chat uses the active workspace agent/runtime even when identical agent ids exist elsewhere
- model/provider metadata matches the active workspace
- no stale cross-workspace session leakage in the tested path

### 2. Secondary: fix `#8` if `#94` lands cleanly (1.5 hours)

- Audit Anthropic key lookup between dashboard, gateway, and embedded fallback
- Make `.env` and expected runtime sources behave consistently
- Remove misleading fallback error noise when behavior is actually valid
- Add or extend a focused regression test if the seam is testable

**Definition of done**
- Anthropic-backed agents work without requiring a separate shell export when configured through supported env/config paths
- logs reflect actual failure vs expected fallback

### 3. Tertiary: `#95` refinement pass, not full validation close (1 hour)

- Review the three event templates for kickoff-field clarity and scaling assumptions
- Tighten wording/fields based on obvious friction points
- Leave the issue open unless there is real user validation evidence today

**Definition of done**
- templates are cleaner and easier to validate with a real user later
- backlog/docs reflect that this was a refinement pass, not final validation

### 4. Buffer: release hygiene or test follow-up (0.5 hour)

- update `CHANGELOG.md`, `BACKLOG.md`, `STATUS.md`, or issue comments as needed
- capture any unresolved risks discovered during `#94` or `#8`

## Explicit Non-Goals Today

- do not start `#32` cron migration
- do not try to fully close `#11` unless a truly fresh environment is available and the first two items finish early
- do not expand into broad launch-checklist work unless blocked on engineering tasks

## Recommended Execution Order

1. Start with `#94`
2. If `#94` is fixed and validated, move immediately to `#8`
3. Use remaining time on `#95` refinement only
4. End with docs/issue updates

## Cut Line

If `#94` is still unresolved after roughly 3.5 hours, stop broadening scope and spend the remaining time getting it into one of these states:

- merged fix with validation, or
- smaller safe partial fix plus a precise repro note and next-step handoff

## Success Criteria For Today

- Best case: `#94` fixed, `#8` fixed, `#95` lightly refined
- Good day: `#94` fixed and validated, with clear notes on `#8`
- Acceptable fallback: `#94` narrowed to one concrete failing seam with a partial patch and regression coverage
