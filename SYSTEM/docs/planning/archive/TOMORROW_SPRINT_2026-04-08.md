# Sprint: April 8, 2026

> Primary theme: convert strong demo feedback into product polish and the next obvious creation/discovery wins
> Delivery target: remove immediate demo friction, improve template apply clarity, and set up the next wave of skills/template work

## Current Context

- Qualcomm / HackerSquad demo feedback was positive, especially around:
  - skills import and assignment
  - partner integrations
  - templates as a starting point
- The strongest asks were not abstract roadmap ideas. They were concrete product friction:
  - Skills page stale after agent creation
  - skill import failure on a repo missing `index.ts`
  - group conflicts when multiple templates reuse the same channels
  - long silent gaps during template apply
- OTP cloud delivery remains active with CLI. They can finish the final live verification path on the latest dashboard fix.

## Primary Outcome

Ship the highest-signal, lowest-risk improvements surfaced by the demo:

1. make skills assignment feel immediate and resilient
2. make template apply safer and more understandable in multi-team workspaces
3. turn template editing into a near-term active track instead of a vague backlog item

## Priority Order

### 1. Skills immediate-fix pass

- fix stale Skills page agent list after creating a new agent
- support importing skills that have `SKILL.md` and `index.js` but no `index.ts`
  - warn instead of hard-failing
  - generate a minimal `index.ts` if the importer requires it

### 2. Template apply conflict + progress pass

- detect group/community name collisions during template apply
- let the user:
  - keep the conflict
  - rename the incoming group
  - remap to an existing group if supported cleanly
- add finer-grained progress/toast updates between:
  - agent creation
  - group/community creation
  - workflow creation
  - finalization

### 3. Template editing plan to implementation handoff

- define the first real template-editing flow:
  - start from an existing template
  - edit manually and via AI refinement
  - preview/save as a new template or update a workspace/local copy
- if time allows, begin the first thin slice instead of only planning it

## Secondary If Time Allows

### Skills discovery / AI creation

- design the next-step skill discovery surface:
  - lexical + semantic search
  - close matches
  - inline Shipables / external-catalog suggestions
- scope AI skill creation:
  - simplest possible scaffold-first experience

### New template packs

- job search team
- robotics / Qualcomm AI Hub / Arduino-oriented team
- richer Jarvis-style assistant/operator team

These should not outrank the immediate UX/product friction above.

## Non-Goals

- do not start broad template-pack expansion before fixing template apply clarity
- do not overbuild a generic semantic-search system in one pass
- do not let template editing sprawl into a full new template IDE in the first slice

## Watch Items

- OTP issue `#102` should remain open until CLI confirms real email delivery after redeploy
- workspace auto-switch remains a watch item until it survives more daily use
- mobile responsiveness issues found during demos should remain queued, but not outrank the more direct product blockers above unless new demos require it immediately

## Success Criteria

- Skills page reflects newly created agents without refresh
- importing a plausible skill repo is more forgiving and less brittle
- template apply no longer silently collides groups without warning
- template apply progress feels alive through the whole run
- template editing has an implementation-ready first slice, not just demand signals
