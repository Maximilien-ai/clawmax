# Hardening + Simplification 1.8.0 Completed Checkpoints

Archived from `SYSTEM/docs/planning/HARDENING_SIMPLIFICATION_1_8_X.md` on June 10, 2026.

## Completed Checkpoints

- System-test workspace isolation hardening completed for the 1.8.0 pass. Full integration with validation reached `308/308` after this checkpoint.
- Runtime + Gateway recovery hardening completed for the 1.8.0 pass. Added Doctor gateway recovery route tests and gateway probe handshake tests.
- Resend + Cognee regression safety completed for the 1.8.0 pass. Added partner runtime regression tests and partner plugin status regression tests.
- Workflow empty-state loading jitter fixed and covered. This shipped into `1.8.0-test-rc2`.
- Mobile/light/dark dropdown audit completed for current touched surfaces. Workspace switcher and BYOK partner controls were hardened, with dropdown helper tests extended to `9` cases.
- Notification presentation simplification completed for the 1.8.0 pass. Extracted category/search/open-action/footer-label rules into `notificationPresentation.ts` and added a visible `Notification presentation helper tests` lane with `6` cases.
- Agent card presentation helper consolidation completed. Extracted tag preview, group-count, and budget-threshold rules into `agentList.ts` and added a visible `Agent card presentation helper tests` lane with `7` cases.

## Latest Known Green Checkpoint

- Full integration suite: `315/315` passing.

## Deferred From Completed Sections

- Make system-test cleanup more idempotent for partially deleted workspaces.
- Add clearer workspace setup failure output when create fails but activation later appears to succeed.
- Broader workspace-scoped API isolation audit.
- Durable gateway service/supervision changes requiring CLI/runtime coordination.
- Deeper Cognee memory behavior tests once the plugin contract is clearer.
- Email delivery audit/rate-limit UI beyond current backend guardrails.
