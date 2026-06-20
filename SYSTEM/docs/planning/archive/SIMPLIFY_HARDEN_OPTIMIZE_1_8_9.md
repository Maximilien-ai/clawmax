# Simplify + Harden + Optimize Sprint: 1.8.9

> Started: June 17, 2026
> Completed: June 20, 2026
> Branch: `main`
> Baseline: `v1.8.8`
> Outcome: promoted as `v1.8.9`

## Completed Scope

- fixed model-authentication/runtime UX so waiting-for-input notifications open the real conversation context and auth/runtime failures are more diagnosable
- hardened workflow runs and chat for OpenAI-compatible/local execution paths so stale auth/session state does not poison retries as easily
- fixed Builder metadata so generated agent `AI Description` no longer stores a raw prompt/chat turn
- restored agent chat history/current-session visibility for explicit sessions and local reply recovery
- stabilized normal dashboard local chat sessions and fixed the streamed-reply panel crash
- improved workflow-failure notification deep links so `Open` lands on the failed execution run
- hardened WhatsApp linking against the `linked` / `done` race
- added day separators for older chat history and reset/refetch behavior for notifications on workspace switch

## Verification Notes

- the sprint ended with green focused regression lanes for:
  - chat route/runtime behavior
  - workflow conversation-target preservation
  - notifications route deep-link payloads
  - WhatsApp pairing
  - chat timeline rendering
- the release line was validated through the `1.8.9-test-rc7` image before promotion prep
