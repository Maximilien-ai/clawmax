# RC102 workflow and agent acceptance

Development revision `b3a2a3b2`. The [isolated dev instance](http://localhost:35125/workflows) has a manual **RC102 managed handoff** workflow with agents **rc102-research** and **rc102-writer**. Set a development provider in BYOK for live generation. Keep issues open until the complete issue has engineering evidence and user acceptance.

| Check | Expected result |
| --- | --- |
| Managed workflow (#338) | Run the seeded workflow. Its instructions ask the owner for a unique phrase and the writer to quote it. The writer starts after the researcher finishes and includes that phrase. A failed researcher prevents writer dispatch. |
| Stop (#249) | Stop an active Claude Code or Droid workflow. Reopen its history and verify cancellation. Automated tests also cover stopping each runtime while queued. |
| Run results (#437, #438) | A workflow participant returning no text or configured with a model the installed OpenClaw rejects for text generation shows a failed step in history. A missing explicitly required output blocks the workflow and its dependents. |
| Creation (#331, #441) | Open Create with AI with a saved default, verify the model, create an agent, and confirm the agent list and workspace count update without reloading. |
| Model change (#440) | Change a test agent's model, reload, and check the selection and chat history. Record any 502 with the time and endpoint only. |
| Provisioning cleanup (#315) | Engineering checks an empty directory created by a failed attempt is released and a pre-existing directory or one containing data is preserved. |

## Engineering evidence

- 84 workflow cases and 20 agent-config route cases passed. Workflow runtime checks cover running/queued cancellation for Claude and Droid, unsupported-model rejection, disabled runtime rejection, ordered handoff, and an upstream failure.
- 24 default-model helper tests and the wizard flow tests passed. Chrome opened Create Agent with AI and displayed Generate with AI at 1440 px and 390 px in an isolated workspace.
- On the seeded writer, a valid model update returned HTTP 200 and an image-only model returned HTTP 400. A fresh identity API read showed the prior model in both metadata and live config.
- The standard Dashboard TypeScript command passed. The separate client project reported 272 diagnostics in both the pre-refresh snapshot and the updated project, with identical messages when line positions were excluded.

- Chrome retained the saved model during a simulated discovery failure and showed newly created agents without reloading at 1440 px and 390 px (#331, #441).
- Full integration with validation on `9f1b54fb` passed 586/586 top-level checks. Coverage passed the 80% minimum for statements (82.53%), branches (81.06%), functions (85.67%) and lines (82.53%).

## Outstanding engineering verification

- Verify model-change failures with a gateway disconnect and retained history (#440).
- Verify child-model and harness availability and authorization (#437, #439).
- Provide confirmed, owner-assisted recovery for pre-receipt conversations after identity or model changes (#420).

### Model-change failure investigation

An isolated route diagnostic forced the session-reset helper to fail after a valid configuration update. The Dashboard returned HTTP 500 and the new identity marker remained on disk. This reproduces a partial write on the configuration route. The reported event 502 remains uncorrelated. Cover the model and configuration edit paths, including a reset that fails after moving one session file, before accepting #440. On-prem upgrade testing should use an existing agent with known conversation history.

November 25 follow-up: PUT configuration and PATCH model now defer workspace edits until session reset succeeds. Both routes restored the original roster and preserved the workspace files byte-for-byte under a forced reset failure. The route suite passed 22 cases, the agent-model suite passed 47, and the Dashboard TypeScript check passed. The event 502 and upgraded-instance history still require verification.

### Logs batch

- #359 preserves ISO timestamps including offset and fractional seconds, and legacy timestamps. Untimed continuation lines have no occurrence time. Explicit agent fields populate the agent filter.
- #360 keeps the same stream through pause/resume. Chrome with a controlled log stream at 1440 and 390 px passed two pause/resume cycles per width. The download contained the historical line once and both identical new events in order. The six log helper tests and standard Dashboard TypeScript check passed.

### Activity and metering batch

- #361: Chrome at 1440 and 390 px received simulated activity and metering HTTP 503s, recovered to populated metering, retained $1.48 through a failed refresh with a stale notice, then recovered to genuine empty results. Provider request and parse failures now propagate as errors.
- #362: The metering API reconciles scoped observations by trace ID before deriving header totals and breakdowns. It reports an observed window of up to 10,000 traces per cache key since startup. The focused metering suite passed 50 cases, including disjoint, overlapping and replayed windows, and the budget suite passed eight. Standard Dashboard TypeScript passed.

### Long replies after reload (#216)

The native SQLite fixture preserved the complete compressed reply on two history reads and after Clear/Continue. The history endpoint returned HTTP 500 with an explicit error for corrupt, oversized, and missing event bodies. The native store suite, 92 agent-route cases, 77 execution cases, eight turn-registry cases and Dashboard TypeScript passed. The turn suite verified a failed turn cannot replay the previous answer. For combined dev acceptance, reload an agent chat with a known long reply and check its final paragraph; this can share the existing model/history check. Changed-identity legacy recovery remains tracked separately in #420.

### CLI provisioning recovery (#312)

The Dashboard startup config repair removes the three reported CLI-only names from a migrated default allowlist while preserving provider-qualified entries. If no qualified entry remains, the repair refuses the write and asks the operator to select an allowed provider/model. The dedicated OpenClaw 2026.9.7 Gateway smoke reproduced the native validator error, repaired the file, passed native validation, and passed authenticated Gateway health without issuing a Gateway stop. Rerun with `node SYSTEM/test-isolated-gateway.mjs --model-policy-repair-smoke-only`. All 11 config tests and Dashboard TypeScript passed. This complements the three-model creation regression at 27251548.

### Droid tool compatibility (#313)

Verified Factory's macOS arm64 Droid 0.247.0 binary against its published SHA-256. Its tool catalog confirmed all four automation mutation/run tools disabled by the corrected invocation. The reported version uses that invocation for chat and workflows; the packaged 0.158.0 retains its tested restrictions. Dashboard TypeScript and 92 runtime adapter tests passed. A real turn reached authentication and returned zero turns in the isolated profile. One successful turn on an authenticated 0.247.0 instance remains pending.
