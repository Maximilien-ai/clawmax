# Resend Setup Handoff for `1.7.4`

> Archived release-specific handoff.

## Goal

Give both Dashboard/Web and CLI/runtime owners the same contract for managed Resend support.

## Required Runtime Env

```bash
RESEND_API_KEY=...
RESEND_DEFAULT_FROM=agent@send.clawmax.ai
RESEND_DEFAULT_FROM_NAME=ClawMax Agent
RESEND_DEFAULT_REPLY_TO=
```

## What The Dashboard Uses

- `RESEND_API_KEY`
  Used as the default managed Resend key when a workspace-specific override is not present.
- `RESEND_DEFAULT_FROM`
  Default sender domain base for Resend mail.
- `RESEND_DEFAULT_FROM_NAME`
  Default display name for non-agent-specific sends.
- `RESEND_DEFAULT_REPLY_TO`
  Optional default reply-to.

## Current Sender Behavior

- Partner test-email path uses the managed default sender.
- Agent chat Resend bridge uses an agent-scoped sender on the same domain.
  Example:
  - `fake-agent@send.clawmax.ai`
  - `resend-agent@send.clawmax.ai`
- Direct agent sends also use basic bridge-side anti-spam throttling.

## Web Team Notes

- The Partner UI should stay minimal for `1.7.4`.
- Do not expose sender-edit fields yet.
- Show that Resend is managed by the current runtime/workspace key source.
- Test-email remains the owner validation path.
- Agent-driven email is expected to work through `clawmax-resend`, not through a raw email composer UI.

## CLI / Runtime Team Notes

- Ensure `RESEND_API_KEY` is available in managed runtimes where Resend should be preconfigured.
- Ensure `send.clawmax.ai` stays verified in Resend for the shipped environment.
- Do not hardcode `onboarding@resend.dev` in managed builds.
- If a workspace override key exists, it should continue to win over the runtime default.
- Agent sessions should receive the managed key path already exported by dashboard execution.

## Validation Checklist

1. Partner test email succeeds from the dashboard.
2. Direct agent prompt can send an email through `clawmax-resend`.
3. Combined prompt can do work first, then email the result.
4. Explicit attachment prompt can send a workspace file.
5. Repeated sends from the same agent to the same recipient hit the throttle instead of spamming.

## Follow-Up After `1.7.4`

- clearer sender/domain readiness errors
- stronger deliverability guidance for attachments
- richer audit/rate-limit UI
- optional recipient allowlists or policy controls for managed environments
