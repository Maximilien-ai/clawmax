# RC93 CodeQL triage after RC92 integration

Status: open for Dashboard security review before the RC93 candidate.
Owner: Dashboard. Deadline: before selecting and publishing RC93.

RC92 remains an internal test candidate. [Integration PR #236](https://github.com/Maximilien-ai/clawmax/pull/236) merged as `c499b7a98748cfa75a1dd909c14df73ffe66461e` on October 21, 2026. Its CodeQL PR gate reported seven open findings: **three critical and four high**. The subsequent [main CodeQL workflow](https://github.com/Maximilien-ai/clawmax/actions/runs/39695208130) completed successfully; workflow success does not close these alerts or establish a security assessment.

## Findings and preliminary source review

| Alerts | CodeQL rule | Source path | What to verify for RC93 |
| --- | --- | --- | --- |
| [610](https://github.com/Maximilien-ai/clawmax/security/code-scanning/610), [611](https://github.com/Maximilien-ai/clawmax/security/code-scanning/611), [612](https://github.com/Maximilien-ai/clawmax/security/code-scanning/612) | `js/command-line-injection`, critical | `server/lib/agent-runtime.ts` | Trace every caller that selects the executable path. The current calls use `execFile` or `spawn` with argument arrays, but the path can come from an operator environment override or PATH. Prove whether any tenant-controlled input can change it, constrain that path if needed, and test execution without a shell. |
| [69](https://github.com/Maximilien-ai/clawmax/security/code-scanning/69) | `js/path-injection`, high | `server/lib/agent-runtime.ts` | Check whether the binary path returned by `which` can escape the intended operator-controlled runtime boundary, especially in local mode. Confirm cloud-mode rejection and test an untrusted override/PATH scenario. |
| [706](https://github.com/Maximilien-ai/clawmax/security/code-scanning/706), [707](https://github.com/Maximilien-ai/clawmax/security/code-scanning/707) | `js/path-injection`, high | `server/lib/native-chat-history.ts` | The legacy JSONL reader checks `sessionId` against an alphanumeric/underscore/hyphen allowlist and `databasePath` validates `agentId`; SQL session IDs are bound. Verify all exported entry points and the source of `home`, keep the resolved file inside the intended agent sessions directory, and retain traversal regression tests. |
| [579](https://github.com/Maximilien-ai/clawmax/security/code-scanning/579) | `js/weak-cryptographic-algorithm`, high | `server/lib/agent-execution.ts` | SHA-1 currently shortens a session key to an eight-hex-character suffix. It is not used as a secret or password hash, but a collision could conflate session identity. Assess collision and migration behavior before replacing it; preserve persisted chat access across restart and upgrade. |

The source observations above are preliminary, not dismissals or proof that the paths are safe. The alert states were `open` when queried on October 21. No exploit reproduction or complete security audit has been recorded.

## Acceptance for RC93

- Trace actual input authority for each reported sink, including local and cloud deployment modes, and record whether an untrusted actor can reach it.
- Fix any reachable path or command execution hazard with focused error, authorization, persistence, and regression tests. Use a bounded CodeQL dismissal with evidence only for findings proven inapplicable.
- For any session-key change, test old-to-new lookup, collision behavior, and restart persistence with existing stored sessions.
- Re-run focused tests, TypeScript, CodeQL PR analysis, and the full RC suite before RC93 image publication. Record the residual open alert count by severity and owner.

This triage does not change the published RC92 image or authorize a production rollout.
