# AI Builder Progress — May 26, 2026

## Completed

- Builder sessions can now:
  - save to DocHub as markdown
  - download as markdown
  - optionally share remotely when the deployment enables AI Builder sharing
- Builder feedback can optionally share through the same remote contract path
- Builder now surfaces whether sharing is:
  - remote-capable
  - local-only by default
- workspace first-run tour expanded to 10 guided steps:
  - workspace switcher
  - BYOK
  - notifications
  - Builder
  - agents
  - communications
  - workflows
  - skills
  - templates
  - system controls
- `Don't show again` for the workspace tour is now global across new empty workspaces
- finishing the tour lands the user on `Builder`
- system tour step now highlights:
  - Keys & Secrets
  - Activity & Budget
  - System & Logs
  while keeping `Keys & Secrets` selected as the active destination
- Builder eval corpus expanded again for:
  - existing-agent workflow follow-through
  - create-skill follow-through
  - finance/company scope
  - refine existing template
  - explicit single-agent admin prompts
  - ambiguous refine-vs-create prompts
- Activity/Budget now separates built-in agent usage/cost presentation from user-agent usage
- `/api/metering` now enriches agent rows with built-in/system identity from workspace metadata instead of relying on client-side agent lookups
- built-in/system agents can now use a separate workspace-level `systemPreferredModel`
- Builder/system AI generation also honors the workspace system model when it matches the active execution provider

## Validation

- `npx tsc --noEmit`
- `npx ts-node --transpileOnly server/lib/metering.test.ts`
- `npx ts-node --transpileOnly server/lib/workspace-integrations.test.ts`
- `npx ts-node --transpileOnly server/lib/agent-default-model.test.ts`
- `npx ts-node --transpileOnly server/lib/ai-generator.test.ts`
- `npx ts-node --transpileOnly client/src/lib/onboardingTour.test.ts`
- `npx ts-node --transpileOnly client/src/lib/builderSession.test.ts`
- `npx ts-node --transpileOnly server/lib/ai-builder-share.test.ts`
- `npx ts-node --transpileOnly client/src/lib/meteringPresentation.test.ts`
- `npx ts-node --transpileOnly server/lib/ai-builder.test.ts`
- `./SYSTEM/test-with-server.sh`

Latest wrapper result:

- `111 passed, 0 failed`

## Next Focus

- more real-prompt Builder eval growth and routing fixes
- manual Builder QA before merge to `main`
- Builder export/share naming and DocHub polish
