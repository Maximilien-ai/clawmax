# Dependency maintenance — November 16

Stable remains **v1.9.9**; active development is **2.0.0** with Node 24.22.0
and OpenClaw 2026.9.7. No RC98 image, deployment or fleet update is claimed.
Owner authorization: merge every compatible Dependabot update, retain normal
review/CI/security gates, and verify the combined Dashboard with the full suite.

## Accepted fixes already merged

- [#191](https://github.com/Maximilien-ai/clawmax/pull/191): owner accepted the
  compatible-provider defaults, key removal/restoration and runtime-policy fix.
  Merged as `662d23ae` after exact-head CI and local CodeQL regression checks.
- [#194](https://github.com/Maximilien-ai/clawmax/pull/194): owner accepted native
  history persistence and Clear/History/Continue. Merged as `5fbce719` after the
  base update and required CI rerun. That update changed no file bytes.
- Combined bug source `a42ccb05` passed **582/582** local integration,
  validation and coverage checks; caller registry remained unchanged. Real
  keyless LM Studio/Qwen provisioning, chat and conversation lifecycle passed.
  [External acceptance checklist](PRAVEEN_BUG_ACCEPTANCE_2026-11-15.md).

## Merge order and current dependency work

1. [#424 — Resend 6.37.0](https://github.com/Maximilien-ai/clawmax/pull/424).
   Merged as `08b4779d` from tested checkpoint `39d896a7`, including both accepted fixes. Lint,
   server typing, production build, clean locked install and dependency-tree
   validation pass. Three new tests exercise the actual installed SDK through
   the production OTP route: successful delivery, provider rejection and a
   network failure. Every request is intercepted; no email is sent. The auth
   suite is now 15 cases. Existing auth edge, Resend command/helper and
   integration route suites also pass. Full local validation passed **582/582**, with the caller registry unchanged.
   [Required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43949931099)
   and [CodeQL](https://github.com/Maximilien-ai/clawmax/actions/runs/43949924658)
   passed. The CI run took approximately **44 minutes**.
2. [#421 — compatible grouped updates](https://github.com/Maximilien-ai/clawmax/pull/421).
   Keep dotenv 18.0.10, marked 18.1.3, pdfmake 0.3.14, TypeScript ESLint parser
   8.72.1, concurrently 10.0.7, ESLint 10.14.0 and Vite 8.3.7. Retain the
   existing OpenTelemetry family: the proposed API/exporter/SDK peers conflict.
   [#418](https://github.com/Maximilien-ai/clawmax/issues/418) retains that
   coordinated migration. Future tracing updates get their own visible
   Dependabot group, using the documented
   [group inclusion/exclusion options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).
   Stronger exact Vite manifest/lock assertions, lint, server typing, build,
   tracing config, real Markdown/PDF and eight production-component browser
   cases pass (desktop/mobile, light/dark). A synthetic PDF is also generated
   with network access disabled and rendered for inspection. The unchanged
   PDF task-list defect is tracked separately as
   [#426](https://github.com/Maximilien-ai/clawmax/issues/426); pre-render
   document definitions match the main baseline exactly. This PR now includes merged #424 for the final combined full run and CI.

Normal branch rules require an approving review and current-base `test` success.
Auto-merge is disabled in this repository, so Dashboard performs each normal
merge after validation; no admin bypass or settings change is authorized or used.
A base-only merge with identical file-tree identity may reuse local/source-scan
receipts, while required current-head CI still reruns. Expected CI is **26–43
minutes** (most recent Resend run: approximately **44 minutes**) and full
local integration/validation/coverage **12–15 minutes**.

## Held major migrations — do not manually merge failing heads

| PR | Verified blocker | Required next work |
| --- | --- | --- |
| [#422 Tailwind 4](https://github.com/Maximilien-ai/clawmax/pull/422) | Production build fails because the PostCSS plugin moved | Migrate CSS/PostCSS together and audit all affected desktop/mobile, light/dark surfaces |
| [#423 React 19](https://github.com/Maximilien-ai/clawmax/pull/423) | Peer resolution fails: React/types 19, DOM/runtime types 18 | Align the four packages, compare typing with the baseline, then validate UI behavior |
| [#425 TypeScript 7](https://github.com/Maximilien-ai/clawmax/pull/425) | Parser supports TypeScript <6.1, rejecting 7.0.2 | Establish a supported compiler/parser/ts-node combination before lint/type/build/runtime validation |

All three PRs are labelled `chore` and `triaged`, with failure evidence and next
steps posted. These are compatibility migrations, not safe install-only merges.
Dashboard owns assessment after the current RC98 stability batch; no force or
legacy-peer install workaround, silent closure or owner manual merge is requested.
The owner may explicitly prioritize a separately validated migration later.

## Audit evidence and handoff

- #424: `npm run security:audit` exits 0; raw `npm audit --json` exits 1 for
  **10 Moderate / 0 Low / 0 High / 0 Critical**, across **577** reported
  dependencies (320 production, 258 development, 33 optional; counts overlap).
  Evidence: `/private/tmp/clawmax-424-audit.json` and `-audit-policy.log`.
- #421 combined checkpoint, including merged #424: the same policy passes;
  raw audit reports **10 Moderate / 0 Low / 0 High / 0 Critical** across **577**
  dependencies (320 production, 258 development, 33 optional). All 14 tracing
  lock entries match merged main exactly. Clean install, full dependency tree,
  focused Markdown/PDF/tracing/OTP suites, lint, server types and build pass.
  Evidence: `/private/tmp/clawmax-421-audit.json`, `-audit-policy.log`,
  `-combined-focused.log` and `-combined-otp.log`.
- Dashboard owns the residual Moderate findings before stable 2.0. This is
  dependency-regression evidence, not a complete security audit. CodeQL's
  workflow success and its PR comparison are checked separately before merge.
- No independent human acceptance is requested for the compatible dependency
  batches. Engineering owns their unit/integration/browser/security checks.
  Final CI, full-suite and merge receipts go on the existing PRs without
  evidence-only commits that restart CI.
- #292 OpenCode and retained history/security issues #420/#196/#216/#418/#419
  remain outside this dependency batch. No feedback reports are closed and no
  customer emails are claimed by this document.
