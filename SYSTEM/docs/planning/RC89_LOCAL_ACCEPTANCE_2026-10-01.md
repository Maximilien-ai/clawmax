# RC89 local acceptance — October 1, 2026

Branch: `feat-2.0-maintenance-parity` / PR206. This is an acceptance checklist,
not a declaration that RC89 is qualified or its images exist.

## Engineering gate

### Twenty-agent browser group diagnosis (October 1, afternoon Pacific)

- Owner observed successful replies interspersed with four apparent gateway
  failures. Correlated runtime logs identified model-policy rejection for CEO
  (LM Studio) and competitor-research-assistant, competitor-research-assistant1,
  Jarvis (Ollama), not a connectivity failure for those four requests.
- Under the owner's earlier unrestricted-model instruction, dev's default
  allowlist was cleared with a private config backup. Per-agent policies and
  selected models were preserved. This is an explicit dev-owner action, not an
  automatic permission-widening migration for other instances.
- Error presentation now prioritizes model-policy rejection over gateway wrapper
  text, including repeated client presentation. Focused suites: 13 client and 40
  server tests passed; TypeScript passed. Fix commit: `77cb9911`.
- CEO's synthetic LM Studio retry returned exactly LOCAL_OK in 58,498 ms.
  The three Ollama agents instead exposed missing-provider-auth errors. Both local
  servers answer model-list requests and the selected models exist; discovery is
  not inference acceptance. The documented non-secret local auth marker was
  configured only for the verified loopback Ollama endpoint, but hot-reload
  retries still failed. A controlled idle gateway restart reported ready;
  post-restart Jarvis still failed with missing-provider-auth in 8,143 ms. A plain
  restart is not sufficient. Next: trace provider auth resolution/native profile
  registration without weakening remote-provider authentication. Ollama agents
  remain blocked; do not request another full-group acceptance yet.

### Dev-only 2026.9.7 migration checkpoint (October 1, late morning Pacific)

- Owner authorized backed-up, stopped-runtime `doctor --fix --non-interactive`.
  The isolated 2026.9.7 candidate completed with exit 0; repository pin remains
  2026.9.5. Full state and external workspace documents have private local backups.
- Read-only SQLite inspection found 298 agent databases at schema 24, zero read
  failures. Configuration still contains 263 agents (different inventory scopes).
- Restored eight agent model selections changed by Doctor, plus original model
  catalog and heartbeat/system-agent ownership settings. An upgrade must not
  silently substitute user-selected models.
- Historical transcript header/filename mismatches remain deferred. No history
  was deleted to force success. The resend-agent workspace TOOLS.md symlink was
  materialized with its original repository target preserved; its subsequent
  merge was refused by Doctor's POSIX-reader protection and remains unresolved.
- Candidate gateway reported ready and Dashboard started using matching CLI and
  native-auth package paths. Gateway subsequently reported critical RSS pressure
  (3.18 GiB), later 2.56 GiB; startup success is not stability acceptance.
- First post-migration Astro synthetic chat failed in 14,263 ms with
  `codex app-server request timed out`. A settled-runtime retry passed in
  6,853 ms. Keep the cold-start failure open; do not claim consistent readiness.
- Briefing-writer then passed two same-session direct turns in 5,573 / 3,437 ms.
  Temporary two-agent group returned exact synthetic replies from both Astro
  Guide and briefing-writer within the first 10-second observation window.
  Saved-group verification also passed: Astro observed at 10 seconds and
  briefing-writer at 20 seconds, both exact synthetic replies without errors.
  Two additional direct briefing-writer turns passed in 5,291 / 2,821 ms.
  The active-turn registry was empty afterward. Saved diagnostic group:
  `rc89-saved-check-1790882676799`; retained for inspection, not user business data.
  Larger groups, browser cancellation/reopening, provider matrix, restart and
  sustained-memory acceptance remain pending. Later RSS warning was 2.19 GiB.
- This is dev-only diagnostic evidence, not image qualification or authorization
  to migrate another instance. Rollback requires restoring state, not just binary.

### Provider chat release gate (updated October 1, 2026, Pacific)

Core providers: **OpenAI, Anthropic/Claude, Ollama, and LM Studio**.
Provider credentials/catalog checks and gateway health alone are not chat acceptance.

1. Dev: verify nonempty chat responses, repeated turns, model/provider switching,
   saved selection, and restart persistence for each core provider. Cover all
   Personal workspace agents where possible; record every unverified agent and
   explicit exception rather than claiming blanket success. Do not overwrite
   agents' intended models merely to run the matrix.
2. After Dev acceptance and engineering gates, build the candidate and have CLI
   deploy the exact image digest to Test10 (cloud) and MBP14 (on-prem). Repeat
   provider chat, migration/preservation, restart, and stability checks. Local
   model endpoints must be reachable from the deployed runtime; cloud localhost
   is not the operator's laptop. Record configured endpoint topology without secrets.
3. Once both targets pass, hand off to Mike and Praveen for additional models and
   providers, including Gemini and xAI. No default promotion or broad rollout
   based on Dev success alone.

Evidence per check: environment, source SHA/image digest, runtime version,
agent/model/provider, credential source label (never key bytes), timestamp,
bounded response outcome, latency, and gateway restart/memory observations.
Separate direct-provider success from Dashboard-to-agent success. Distinguish
invalid credentials, exhausted quota, temporary throttling, model/context errors,
and runtime unavailability; do not classify them from unrelated log timestamps.

Current diagnostic: pinned OpenClaw 2026.9.5 gateway exhausted its JavaScript heap.
Native Codex session discovery is temporarily disabled on Dev with owner approval
and a private config backup; Codex remains enabled and history is retained. This
is not a verified permanent fix. Dashboard's credential bridge was selecting an
older global package; the backend now has matching executable/package settings,
and fail-closed source guards plus regression tests await owner-run validation.
OpenClaw 2026.9.7 is a fallback upgrade candidate, not the selected pin. Qualify
state migration and backup/restore before any upgrade; binary rollback alone is
not a database rollback. Local test suites remain owner-run.

Direct OpenAI diagnostic on October 1: synthetic `Reply with exactly OK` using
GPT-5.5 and `store:false` returned HTTP 200, completed, exact `OK` for both the
Astro Guide native-store key (1,926 ms) and Dashboard-configured key (1,278 ms).
The credentials differ; neither key is recorded here. This disproves an active
quota/authentication failure for these two small requests, not every request or
the browser's separately supplied BYOK value. Dashboard-to-agent chat acceptance
is still pending. Gateway authenticated health passed with discovery disabled;
long-duration stability and the provider matrix remain unverified.

After the failed 20-agent group run settled and the active-turn registry was
empty, three sequential isolated Dashboard SSE chats to Astro Guide completed
with the requested synthetic `ASTRO_OK` response and no error event: 21,395 ms,
5,962 ms, and 3,785 ms. Configured primary remained `openai/gpt-5.4`; the response
events do not expose the actual selected/fallback model, so primary-model use is
not proven. These probes supplied the previously validated native-store OpenAI
key through BYOK and each used a fresh diagnostic session. Same-session follow-up,
browser-supplied credentials, concurrent/group execution, and long-duration
stability remain acceptance gaps. Do not describe this as a repaired group path:
logs show config hot reload colliding with secrets.reload and triggering runtime
publication failures and deferred restarts during the earlier bulk run.

Additional probe: briefing-writer passed two same-session direct turns (5,120 ms,
2,579 ms), but the two-agent temporary group with Astro Guide failed for both.
Inspection found group execution spawning global `openclaw` rather than the
selected runtime. Source now resolves the pinned executable and uses explicit
model arguments without temporary model-config mutation; regression assertions
were added. Retest was blocked by another gateway heap-exhaustion crash with
native Codex discovery disabled. No all-agent/group acceptance is claimed, and
the discovery toggle is not a sufficient stability workaround. Next gate is a
backed-up dev-only evaluation of 2026.9.7 with migration compatibility review.

2026.9.7 evaluation: isolated npm install reports `c074824`; config validation
passes. Full OpenClaw-state copy completed with the dev backend stopped and no
active turns; config and shared database copies compare equal. Advisory Doctor
reports one blocking TOOLS.md migration for resend-agent: the legacy test-1.7.x
workspace file is a symlink into the repository. It also reports 263 tool-schema
warnings; sampled agent-store findings require stopped-runtime session-identity
migration from schema 21. No broad repair, symlink replacement, or candidate
gateway startup has been performed. Explicit handling of the linked file and
verified database migration are prerequisites to continuing dev acceptance.

Repair the isolated pinned OpenClaw 2026.9.5 dependency cache, verify a real CLI
command beyond `--version`, then run:

```sh
DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Record the tested SHA, result, coverage and CI. The wrapper's test workspace is
disposable; start normal dev separately afterward. Do not leave a synthetic test
workspace running as the owner's dev environment or advertise it as real data.

## Short owner acceptance

Use a disposable workspace for mutations; do not paste keys into evidence.

1. **Chat and Doctor:** send a short message to AstroGuide; expect a nonempty
   response or a bounded actionable failure, not an indefinite spinner. Verify
   model selection and inspect Doctor's specific proposed repairs and outcome.
2. **BYOK:** save a valid configured provider key; verify a bounded result and
   subsequent chat. In a disposable configuration, reject an invalid key with a
   useful error; service unavailability must not be reported as valid. Restore
   the valid configuration. Do not rotate or invalidate production credentials.
3. **Search:** Ctrl/Cmd+K, partial-name search, and correct navigation for a known
   workspace, agent, workflow, group, community, skill, template and plugin object.
   Switch workspaces while searching; no stale cross-workspace results. Check
   a narrow/mobile window for usable trigger, focus and no header overflow.
4. **Skills and switching:** opening Skills from an agent should default to
   Available; assign a disposable skill and confirm Assigned remains accessible.
   Switch workspaces repeatedly; preserve selection and show readable failures,
   never an HTML/JSON parsing error.
5. **Partners:** inspect Cognee and AgentForge configuration without errors.
   Configuration alone must not enable activity export or count as user consent.

These checks are intended to reveal gaps, not assert every behavior is complete.

## Personal clearing — separate disposable instance only

Do not clear the owner's real Personal workspace for acceptance. Seed disposable
agents, workflows, groups and documents, with another workspace as a preservation
control. Cancel each confirmation once, then confirm with `CLEAR PERSONAL`.
Personal must remain selectable and empty; the other workspace and shared
credentials must remain unchanged. Restart, create a new Personal agent and chat.
The runtime keeper may remain outside Personal. Shared-auth ownership, linked
storage and legacy ambiguous rosters deliberately refuse cleanup.

See [the detailed clearing contract](PERSONAL_WORKSPACE_CLEAR_ACCEPTANCE.md).

## Remaining release gates

- Packaged stopped-runtime migration, complete persisted inventory and truthful
  authenticated readiness; interruption/active-owner and preservation evidence.
- Remaining local UX and joint CLI operations acceptance, not just test totals.
- Reviewed/merged source and green CI, then exact public and matching combined
  images on both architectures with smoke tests and identity verification.
- CLI cloud/on-prem upgrade, restart, persistence and chat acceptance on explicitly
  authorized targets, with backups and rollback; Mike and Mac mini remain distinct.

No broad rollout or default-image promotion is authorized by local acceptance.
