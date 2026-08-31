# AI Builder, Agent Channels, and Branch Coverage Mini Sprint

> Status: Active
> Execution window: August 31-September 2, 2026
> Target: complete the engineering work and sequential candidate releases in
> two days if CI duration permits; use day three for release spillover,
> external-provider validation, and coverage stabilization
> Updated: August 31, 2026

## Goal

Strengthen AI Builder's explicit creation behavior first, then add Telegram,
Discord, and Slack as real OpenClaw-backed agent communication channels in
ascending order of implementation complexity. Raise measured Dashboard branch
coverage above 71% while adding focused coverage for every behavior changed by
the sprint.

The implementation order is:

1. AI Builder explicit-create behavior and evaluation corpus
2. Telegram
3. Discord
4. Slack Socket Mode
5. Full validation and branch-coverage closure

Each product increment is released before work begins on the next one. For this
plan, `release` means a separately validated 2.0 test release candidate, not a
stable promotion. Stable `2.0.0` remains governed by the active launch plan.

## Baseline And Decisions

### AI Builder

- The routing evaluation corpus currently contains 69 scenarios. It is weighted
  heavily toward team templates, with 43 `team_template` cases and only six
  direct `ai_generate` cases.
- Explicit-create handling exists in both server and client code. The sprint
  should make one shared contract authoritative so those paths cannot drift.
- When the user clearly asks to create an agent, workflow, skill, team, or
  company, the matching `AI Create` action must always remain visible. It does
  not have to replace a better primary recommendation, but it cannot disappear
  because of ranking, fallback, deduplication, or secondary-action limits.
- Reuse, review, edit, update, and refine requests are not creation requests
  unless the prompt separately contains explicit creation intent.

### Agent channels

- OpenClaw owns channel connections and deterministically routes inbound replies
  back through their source channel.
- Channel credentials belong to a workspace-level channel account. Agent
  association is represented by OpenClaw bindings, optionally scoped by
  account, peer, Discord guild, or Slack team. The Agents UI may present this as
  connecting an agent, but must not create an isolated secret copy in every
  agent document.
- Connection and binding are separate states. A connected workspace account can
  exist without an agent binding, and an invalid binding must not be shown as a
  healthy connection.
- Provider tokens are secrets. Store secret references or use the existing
  secret boundary; never return raw tokens from an API, write them to
  `IDENTITY.md`, include them in logs, or expose them through lifecycle evidence.
- Preserve unknown OpenClaw configuration fields and account definitions when
  changing one connection or binding.
- Preserve the valid empty agent-channel selection.

### Channel order

1. **Telegram** is first because ClawMax already has partial setup-script
   support, OpenClaw uses one bot token, and long polling avoids a public
   callback endpoint.
2. **Discord** is second because its default path uses one bot token, but setup
   also requires application permissions, server/user identifiers, and pairing
   or allowlist decisions.
3. **Slack** is third because the simplest suitable path, Socket Mode, still
   requires a bot token, an app-level token, app scopes/events, and more
   connection diagnostics.

Slack HTTP Request URL and relay modes are explicitly deferred. They should not
delay the first useful Slack connection path.

### Coverage

The accepted RC46 report recorded:

- statements/lines: 81.65%
- branches: 70.79% (`11,760 / 16,612`)
- functions: 91.35%

At that exact denominator, 33 additional covered branches reach 71%. Because
this sprint adds new branch paths, the working target is at least **71.2% branch
coverage**, not merely 71.00%. Re-run coverage at the start of implementation
to establish the current post-RC46 baseline.

## Incremental Release Cadence

The expected sequence continues from the currently published RC46:

| Candidate | Contents | Must be published before |
|---|---|---|
| `2.0.0-test-rc47` | AI Builder explicit-create contract and expanded evaluations | Generic channel work begins |
| `2.0.0-test-rc48` | Generic channel foundation and Telegram | Discord work begins |
| `2.0.0-test-rc49` | Discord agent connections and bindings | Slack work begins |
| `2.0.0-test-rc50` | Slack Socket Mode and final branch-coverage closure | Sprint handoff |

Candidate numbers are planning identifiers until the release begins. If another
candidate is published first, advance these numbers while preserving the same
one-increment-per-release order.

Every checkpoint must follow the repository release contract:

1. Finish, directly test, commit, and push the focused concern. Do not begin the
   next product increment with completed work still uncommitted or unreleased.
2. Record the observed or documented CI duration before starting long-running
   validation and poll sparsely at the prescribed checkpoints.
3. Run the complete integration, validation, coverage, and live-execution suite
   against the exact candidate source.
4. Align the ignored local `SYSTEM/dashboard/.env` `CLAWMAX_VERSION` to the
   exact candidate, restart the Dashboard, and verify both the visible version
   and `/api/system`.
5. Dispatch the public `Test Container Image` workflow from the candidate ref
   and verify amd64/arm64 build, packaged identity, registry smoke, and
   persistence.
6. For a public/private combined candidate, dispatch `Private ClawMax Plugins
   Image` with the exact public `base_tag` and matching private `image_tag`.
   Record both CI links and do not call the candidate complete until matching
   combined validation and smoke pass.
7. Record the candidate tag, owning SHA, coverage totals, CI links, image status,
   and any unresolved external-environment evidence in this plan before moving
   to the next increment.

A failed release gate is investigated and fixed in a new focused commit. It is
not bypassed by folding the next channel into the same candidate.

## Two-Day Execution Plan

### Day 1: AI Builder first, then Telegram

#### AI Builder contract

- [x] Consolidate explicit entity/action detection into a shared module used by
  the server recommendation path and client fallback/hydration path.
- [x] Define explicit create intent for agent, workflow, skill, team template,
  and company template.
- [x] Keep every required `AI Create` action visible for compound prompts, even
  when the normal secondary-action limit would hide it.
- [x] Reapply the guarantee after deterministic classification, LLM fallback,
  action hydration, semantic deduplication, and action selection.
- [x] Preserve the original prompt when navigating to the matching AI Create
  surface.
- [x] Keep non-create requests on reuse/refine/review paths unless the user also
  asks to create something new.

#### AI Builder evaluation expansion

- [ ] Add clear creation prompts using `create`, `build`, `design`, `generate`,
  `make`, and `set up` for each supported entity.
- [x] Add short prompts such as `create an agent`, `create a workflow`, and
  `create a skill` as well as detailed domain-specific prompts.
- [x] Add compound prompts requiring multiple visible create actions.
- [x] Add negative controls for `use my agent`, `review this workflow`, `update
  this skill`, `refine the team`, and sentences where an entity word is not the
  object being created.
- [ ] Add ambiguity cases where Builder should ask for confirmation without
  suppressing a clearly requested create action.
- [ ] Test action label, destination, action value, prompt prefill, and template
  target—not only the top-level classified intent.
- [x] Run the focused server routing, route, and client explicit-action suites,
  followed by TypeScript checking.

#### Release checkpoint: AI Builder

- [x] Commit and push the AI Builder test and behavior concerns.
- [x] Run the full candidate gate and publish the AI Builder-only candidate.
- [x] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [x] Begin generic channel work only after the candidate is published and its
  required smoke jobs pass.

RC47 release evidence:

- Source SHA: `339fff4e` (`fix: strengthen AI Builder create suggestions`)
- Candidate tag and image version: `v2.0.0-test-rc47` / `2.0.0-test-rc47`
- Focused validation: explicit-action helper `43/43`, routing suite `114`, route
  suite `19/19`, server TypeScript, and production server/client build
- Full local candidate gate: passed integration, validation, and coverage
- Coverage: statements/lines `81.67%` (`47,696 / 58,399`), branches `70.80%`
  (`11,763 / 16,614`), functions `91.37%` (`1,833 / 2,006`)
- Local identity: visible Dashboard version and `/api/system` both reported
  `2.0.0-test-rc47`
- Public image: [Test Container Image run 33415993384](https://github.com/Maximilien-ai/clawmax/actions/runs/33415993384)
  passed amd64/arm64 builds, manifest publication, and registry smoke
- Combined image: [Private ClawMax Plugins Image run 33418166505](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/33418166505)
  passed private contracts, host runtime acceptance, multi-architecture build,
  and amd64/arm64 registry smoke

#### Generic channel foundation

- [x] Define the supported channel catalog and provider-neutral connection,
  account, binding, and configured-status response types.
- [ ] Add provider-neutral live health/probe response types.
- [x] Add safe OpenClaw config read/update helpers that preserve unrelated and
  unknown fields.
- [x] Add masked credential status and provider-specific validation without
  exposing stored values.
- [x] Add bind, rebind, unbind, connect/update, and disconnect lifecycle
  operations with durable success/failure evidence.
- [ ] Add live provider probes and pairing lifecycle evidence beyond the
  configured direct-message policy.
- [x] Keep WhatsApp behavior working while adapting it to the shared presentation
  contract where practical; do not perform an unrelated WhatsApp rewrite.

#### Telegram vertical slice

- [x] Connect or update a Telegram bot token through the protected secret path.
- [x] Configure the supported default policy and optional numeric owner/user
  allowlist without silently opening the bot publicly.
- [x] Bind the Telegram account, account wildcard, or selected peer to an agent.
- [x] Surface pairing policy, connected, disabled, bound, unbound, and broken
  binding states on the Agents page.
- [ ] Surface live pairing-required and probe-failed states from the running
  OpenClaw provider.
- [x] Support disconnect/revoke without deleting unrelated channel accounts or
  agent bindings.
- [x] Add focused configuration, API, persistence, redaction, error, and UI tests.

#### Release checkpoint: Telegram

- [x] Commit and push the generic channel foundation and Telegram as focused,
  reviewable concerns.
- [x] Run the full candidate gate and publish the Telegram candidate.
- [x] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [x] Begin Discord only after the candidate is published and its required smoke
  jobs pass.

Telegram candidate evidence:

- Source: `e3bab44b` (`v2.0.0-test-rc48`); implementation checkpoint
  `5f181b19`.
- Local integration, validation, and coverage gate: passed with 81.77% lines
  and statements (`48187/58927`), 91.49% functions (`1861/2034`), and 70.91%
  branches (`11896/16776`). The sprint-wide 71.2% branch target remains for the
  coverage-closure phase.
- Local release identity: the rendered dashboard and `/api/system` both
  reported `2.0.0-test-rc48`.
- Public image: [Test Container Image run 33426373895](https://github.com/Maximilien-ai/clawmax/actions/runs/33426373895)
  passed amd64/arm64 builds, manifest publication, packaged-version checks, and
  registry smoke.
- Matching authorized combined image: [Private ClawMax Plugins Image run
  33427999925](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/33427999925)
  passed validation, runtime acceptance, build, and amd64/arm64 registry smoke
  using `base_tag=2.0.0-test-rc48` and `image_tag=2.0.0-test-rc48`.

**Day 1 exit:** explicit-create guarantees are tested end to end, and one agent
can be safely associated with a Telegram connection through the Dashboard
contract. The AI Builder candidate is already published; publish the Telegram
candidate before beginning Discord.

### Day 2: Discord, Slack, and coverage closure

#### Discord

- [x] Configure a Discord bot token using the shared secret boundary.
- [x] Capture and validate the application/server/user information required by
  the selected setup path without assuming every agent uses the same guild.
- [x] Support pairing or explicit allowlists and agent bindings at channel,
  account, guild, and selected-peer scopes supported by the UI.
- [x] Surface missing intents/permissions, pairing-required, connected,
  probe-failed, bound, and unbound states.
- [x] Add focused configuration, API, persistence, redaction, error, and UI tests.

#### Release checkpoint: Discord

- [x] Commit and push Discord behavior and tests as a focused concern.
- [x] Run the full candidate gate and publish the Discord candidate.
- [x] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [x] Begin Slack only after the candidate is published and its required smoke
  jobs pass.

Discord candidate evidence:

- Source: `4edbfd1f` (`v2.0.0-test-rc49`); runtime packaging checkpoint
  `1c1dc8b9` and feature checkpoint `75e1185e`.
- Local integration, validation, and coverage gate: passed with 81.83% lines
  and statements (`48490/59254`), 91.52% functions (`1869/2042`), and 70.96%
  branches (`12007/16919`). The sprint-wide 71.2% branch target remains for the
  coverage-closure phase.
- Local release identity: the rendered dashboard and `/api/system` both
  reported `2.0.0-test-rc49`.
- OpenClaw compatibility: an isolated exact-version Discord plugin probe passed
  profile loading, file-backed SecretRef resolution, application/user/server/
  channel configuration, agent binding, and config validation. A live external
  Discord bot credential smoke remains in the separate provider-validation
  queue.
- Public image: [Test Container Image run 33434406827](https://github.com/Maximilien-ai/clawmax/actions/runs/33434406827)
  passed amd64/arm64 builds, manifest publication, packaged-version checks, and
  registry smoke.
- Matching authorized combined image: [Private ClawMax Plugins Image run
  33436425174](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/33436425174)
  passed validation, runtime acceptance, build, and amd64/arm64 registry smoke
  using `base_tag=2.0.0-test-rc49` and `image_tag=2.0.0-test-rc49`.

#### Slack Socket Mode

- [x] Configure bot and app-level tokens through separate protected secret
  references.
- [x] Validate Socket Mode prerequisites and report actionable missing-token,
  scope, token-mismatch, and connection errors.
- [x] Support named agent/account bindings, token-selected Slack workspace,
  stable channel allowlists, and selected user scopes supported by the UI.
  OpenClaw's account schema does not accept a separate team ID, so ClawMax does
  not invent one; the bot/app token pair determines the workspace and the probe
  reports token/workspace mismatches.
- [x] Surface pairing-required, connected, probe-failed, bound, and unbound
  states.
- [x] Add focused configuration, API, persistence, redaction, error, and UI tests.

Implementation checkpoint (August 31, 2026):

- Runtime packaging SHA: `1a3e04ba` (`build: package Slack channel runtime`).
- Behavior/test SHA: `1e5ae919` (`feat: add Slack agent channels`).
- OpenClaw schema compatibility: an isolated exact-version Slack plugin probe
  passed profile loading, separate file-backed bot/app SecretRefs, Socket Mode
  account validation, stable user/channel allowlists, and agent binding.
- Focused validation: TypeScript passed; 21 server channel tests, 16 client
  presentation assertions, 21 panel assertions, the default-plugin packaging
  test, and all 63 agent-route tests passed. A dedicated external Slack
  app/workspace smoke remains in the provider-validation queue.

#### Shared presentation and lifecycle

- [x] Replace WhatsApp-only actions in agent cards/detail/actions with a generic
  Channels entry that shows each provider independently.
- [x] Preserve the Agents page header, controls, action menus, responsive
  stacking, and grid/detail/list presentations.
- [ ] Ensure connection and binding history remains inspectable after success,
  failure, rebind, disconnect, and restart.
- [ ] Visually audit desktop and mobile layouts, long provider errors, empty
  states, loading/progress states, and disconnect confirmation dialogs.

RC50 local visual evidence (August 31, 2026): Slack's prerequisites, two-token
form, selected user/channel fields, fail-closed defaults, scroll behavior,
sticky footer, empty state, loading state, and inline validation error passed at
1440×1000 and 390×844. The configured disconnect state remains with the
external Slack test-app smoke because local validation did not use provider
credentials; its confirmation path is covered by the panel contract test.

#### Coverage and validation

- [x] Cover new channel branches as part of implementation rather than adding a
  test-only cleanup pass later.
- [x] Add focused missing branches in `server/routes/agents.ts` and
  `server/routes/channels.ts`, especially provider failures, invalid payloads,
  config preservation, and idempotent disconnect/unbind behavior.
- [x] Reach at least 71.2% measured branch coverage while preserving or improving
  lines and functions.
- [x] Run TypeScript and every directly affected unit/contract suite.
- [x] Run the complete integration, validation, and coverage suite after focused
  work is committed.

RC50 local gate evidence (August 31, 2026): `88e407bf` added focused channel
shape, validation, legacy-config, redaction, and probe-classification branches.
The corrected full integration/validation/coverage run passed 475/475 checks
with 81.89% statements/lines (48,633/59,383), 91.54% functions
(1,874/2,047), and 71.29% branches (12,130/17,014). The first run's three
failures came from overriding the dashboard's configured plugin IDs with stale
synthetic names; removing that override restored the intended public/private
catalog boundary and all plugin enablement checks passed.

#### Release checkpoint: Slack and sprint closure

- [x] Commit and push Slack behavior, tests, and any separately reviewable
  coverage-only concern.
- [x] Run the full candidate gate and publish the Slack candidate.
- [x] Record the exact SHA, tag, final coverage totals, and public/combined CI
  links.
- [x] Complete sprint handoff only after the candidate is published and its
  required smoke jobs pass.

RC50 release evidence (August 31, 2026):

- Candidate SHA/tag: `813928b5` / `v2.0.0-test-rc50`.
- Local version: the visible dashboard shell and `/api/system` both reported
  `2.0.0-test-rc50` after the ignored local `.env` was aligned and the
  dashboard restarted.
- Public image: [Test Container Image run
  33446960901](https://github.com/Maximilien-ai/clawmax/actions/runs/33446960901)
  passed amd64/arm64 builds, manifest publication, packaged-version checks, and
  registry smoke in 24m23s.
- Matching authorized combined image: [Private ClawMax Plugins Image run
  33446669527, attempt 2](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/33446669527)
  passed private validation, runtime acceptance, the combined multi-architecture
  build, and amd64/arm64 registry smoke using
  `base_tag=2.0.0-test-rc50` and `image_tag=2.0.0-test-rc50`.
- Release-input correction: superseded public run `33443927208` received the
  full candidate version where the workflow expected only suffix `rc50`, so it
  published a doubly prefixed test tag. Combined attempt 1 consequently could
  not resolve the intended base image. The tagged source did not change; the
  corrected public run and the single combined failed-job rerun above are the
  owning release evidence.

**Day 2 exit:** Telegram, Discord, and Slack Socket Mode are implemented behind
one generic channel contract, AI Builder behavior is strengthened, and the full
engineering suite is green above the branch target. Each increment has its own
published candidate and evidence record. If serial CI duration prevents this
exit, unfinished release checkpoints move to day three without combining
increments.

### Day 3: Contingency And External Evidence

Use day three only if the two-day exit is not met or external credentials are
available for real-provider validation.

- [ ] Resolve defects found by the complete suite or responsive visual audit.
- [x] Finish any sequential candidate release still running or awaiting a
  required public/combined smoke result.
- [ ] Validate Telegram with a dedicated test bot.
- [ ] Validate Discord with a dedicated test application/server.
- [ ] Validate Slack Socket Mode with a dedicated test app/workspace.
- [ ] Verify reconnect and restart persistence for every available provider.
- [ ] Record external-environment results without representing unrun provider
  checks as complete.

## Required Test Matrix

Every provider must cover, as applicable:

| Area | Required evidence |
|---|---|
| Validation | Missing, malformed, and unsupported fields fail with actionable errors |
| Secrets | Tokens are masked in reads and absent from logs, agent files, and lifecycle evidence |
| Config writes | Unrelated channel accounts, bindings, and unknown OpenClaw fields survive updates |
| Binding | Bind, rebind, unbind, account wildcard, and valid empty selection persist across restart |
| Connection | Success, provider rejection, timeout/unavailable probe, and reconnect are visible |
| Pairing/access | Pending, approved/allowed, expired/denied, and unauthorized sender paths are handled |
| Disconnect | Confirmation is required; repeated disconnect/unbind is safe and idempotent |
| UI | Agent grid/detail/list actions and desktop/mobile layouts remain usable |
| Runtime | Inbound routing selects the bound agent and replies stay on the originating channel |

External-provider smoke tests supplement but do not replace deterministic unit,
contract, API, browser, and source-boundary tests.

## Scope Boundaries

- Do not model Slack, Discord, or Telegram as skills. A skill grants a capability;
  a channel connection receives and routes conversations.
- Do not design the generic contract around WhatsApp pairing details.
- Do not add Slack HTTP Request URL or relay modes in this sprint.
- Do not copy private plugin source, manifests, suggested items, or tests into
  this repository.
- Do not persist channel tokens or raw AI Builder prompts as analytics or
  feedback. Existing explicit consent boundaries continue to apply.
- Do not claim live provider compatibility until the matching external smoke
  test has actually run.

## Commit And Handoff Checkpoints

Keep commits focused and push each tested concern before starting the next:

1. `test:` expand the AI Builder explicit-create evaluation corpus
2. `fix:` enforce shared AI Builder explicit-create actions
3. `feat:` add the generic agent-channel connection and binding contract
4. `feat:` add Telegram agent channels
5. `feat:` add Discord agent channels
6. `feat:` add Slack Socket Mode agent channels
7. `test:` raise branch coverage through focused missing-path coverage
8. `docs:` record final sprint results and external evidence

The release boundary after steps 2, 4, 5, and 6 is mandatory. Commit numbering
does not imply that changes may accumulate across those boundaries.

If implementation naturally combines a test with the behavior it proves, keep
them in the same focused behavior commit rather than manufacturing a separate
test-only checkpoint. Before handoff, record pushed SHAs, CI links, final
coverage totals, provider smoke status, and confirm that no sprint-created
changes remain uncommitted.

## Definition Of Done

- [x] Explicit creation requests always retain the correct AI Create action and
  navigate with the original prompt.
- [x] Negative and ambiguous AI Builder cases do not regress reuse/refine paths.
- [x] Telegram, Discord, and Slack Socket Mode use the shared channel contract.
- [x] Agents can be bound and unbound without duplicating or exposing provider
  secrets.
- [x] Connection, binding, pairing/access, error, and lifecycle state are
  visible after each user operation.
- [x] Focused tests cover success, failure, persistence, redaction, and
  responsive presentation paths.
- [x] Complete integration, validation, and coverage pass.
- [x] Branch coverage is at least 71.2%.
- [x] AI Builder, Telegram, Discord, and Slack each have a separately published
  candidate with owning SHA and public/combined CI evidence.
- [x] External smoke status is accurately recorded for each provider.
- [x] All owning-repository changes are committed and pushed with approved
  lowercase Conventional Commit prefixes.

## References

- [AI Builder / Designer](../features/AI_BUILDER_DESIGNER.md)
- [Testing Guide](../TESTING_GUIDE.md)
- [OpenClaw channel routing](https://docs.openclaw.ai/channels/channel-routing)
- [OpenClaw Telegram](https://docs.openclaw.ai/channels/telegram)
- [OpenClaw Discord](https://docs.openclaw.ai/channels/discord)
- [OpenClaw Slack](https://docs.openclaw.ai/channels/slack)
