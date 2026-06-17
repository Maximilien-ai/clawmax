# Simplify + Harden + Optimize Sprint: 1.8.9

> Started: June 17, 2026
> Branch: `simplify-harden-optimize-1-8-9`
> Baseline: `v1.8.8`

## Goal

Use `1.8.9` to close the next set of user-visible hardening gaps without opening new feature scope:

- fix the remaining model-authentication failure UX so operators can tell whether the problem is a bad key, stale auth profile, cooldown state, or provider/runtime mismatch
- fix waiting-for-input actions so `Open conversation` lands in the actual conversation context where input is needed, not just the agent’s generic chat
- continue the highest-signal `1.8.x` closure work that is still open in backlog:
  - provider/runtime error normalization follow-through
  - remaining workflow/channel target mismatch follow-through
  - remaining file-open / DocHub polish where context is still weak
  - template/workflow audit follow-through for hidden lane/subdirectory assumptions

## Scope

### Section 1: Model Authentication Hardening

- [ ] audit the current auth-failure path for model execution across:
  - agent chat
  - workflow start / restart / rerun
  - notifications
  - logs / workflow result summaries
- [ ] distinguish clearly between:
  - invalid key / 401
  - missing key
  - stale per-agent auth profile
  - provider auth issue / cooldown carry-over
  - provider/runtime mismatch
- [ ] improve the user-facing wording so operators do not see raw fallback noise when a cleaner diagnosis is possible
- [ ] add focused regression coverage for the main auth-state buckets

### Section 2: Waiting-For-Input Context Routing

- [ ] audit the notification / blocker / waiting-for-input actions that currently say `Open conversation`
- [ ] route that action to the real context where the agent needs input:
  - direct agent chat when the request originated there
  - group/community conversation when the request originated there
  - workflow-associated conversation when the request is part of a workflow run
- [ ] preserve enough context that the user can see the prior request and surrounding thread immediately
- [ ] keep a safe fallback to the agent chat only when no richer context exists
- [ ] add regression coverage for context routing from the waiting-for-input surface

### Section 3: Provider / Runtime Error Normalization Follow-Through

- [ ] continue removing raw fallback-chain text from user-visible surfaces
- [ ] keep the same wording across:
  - auth / missing key
  - quota / rate limit
  - cooldown / timeout
  - unsupported model / config mismatch
  - session takeover / concurrency
- [ ] verify the same language appears in workflow rerun/restart flows as well as normal execution

### Section 4: Workflow / Channel Target Mismatch Follow-Through

- [ ] keep auditing templates/workflows where an agent can still hit errors like `Unknown channel`
- [ ] verify channel/community/group routing uses real created surfaces, not display labels or stale assumptions
- [ ] add or extend validation where a template can be proven to target the wrong communication surface before apply/run

### Section 5: File-Open / DocHub Edge Cases

- [ ] continue tightening the remaining context-poor file-open surfaces
- [ ] prefer safe no-open or explicit fallback over misleading DocHub jumps
- [ ] prioritize:
  - workflow-result outputs
  - notifications with low-context file references
  - any waiting-for-input or blocker surfaces that also carry file references

### Section 6: Template / Workflow Audit Follow-Through

- [ ] continue the audit for:
  - hidden/helper subdirectory assumptions
  - weak lane ownership assumptions
  - workflow success criteria that do not re-check on-disk outputs
- [ ] keep changes conservative and backed by validation tests
- [ ] continue selective public-sync follow-through only where the local public repos are clean enough to accept the change safely

## Priority Order

1. model authentication hardening
2. waiting-for-input context routing
3. provider/runtime error normalization follow-through
4. workflow/channel target mismatch follow-through
5. file-open / DocHub edge cases
6. template/workflow audit follow-through

## Testing Rule

- [ ] every user-visible fix adds or extends explicit regression coverage
- [ ] auth-state work must include route/helper tests, not just manual validation
- [ ] waiting-for-input routing must include navigation/state tests
- [ ] full `SYSTEM/test-with-server.sh integration --with-validation` must pass before cutting `1.8.9-test-rc1`

## Release Rule

Do not cut `1.8.9-test-rc1` unless:

- focused tests are green
- full integration validation is green
- manual checks confirm both:
  - auth-failure UX is materially clearer
  - waiting-for-input opens in the correct conversation context
