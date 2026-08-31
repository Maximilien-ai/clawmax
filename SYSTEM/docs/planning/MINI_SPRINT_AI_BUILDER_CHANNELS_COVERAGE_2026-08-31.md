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

- [ ] Consolidate explicit entity/action detection into a shared module used by
  the server recommendation path and client fallback/hydration path.
- [ ] Define explicit create intent for agent, workflow, skill, team template,
  and company template.
- [ ] Keep every required `AI Create` action visible for compound prompts, even
  when the normal secondary-action limit would hide it.
- [ ] Reapply the guarantee after deterministic classification, LLM fallback,
  action hydration, semantic deduplication, and action selection.
- [ ] Preserve the original prompt when navigating to the matching AI Create
  surface.
- [ ] Keep non-create requests on reuse/refine/review paths unless the user also
  asks to create something new.

#### AI Builder evaluation expansion

- [ ] Add clear creation prompts using `create`, `build`, `design`, `generate`,
  `make`, and `set up` for each supported entity.
- [ ] Add short prompts such as `create an agent`, `create a workflow`, and
  `create a skill` as well as detailed domain-specific prompts.
- [ ] Add compound prompts requiring multiple visible create actions.
- [ ] Add negative controls for `use my agent`, `review this workflow`, `update
  this skill`, `refine the team`, and sentences where an entity word is not the
  object being created.
- [ ] Add ambiguity cases where Builder should ask for confirmation without
  suppressing a clearly requested create action.
- [ ] Test action label, destination, action value, prompt prefill, and template
  target—not only the top-level classified intent.
- [ ] Run the focused server routing, route, and client explicit-action suites,
  followed by TypeScript checking.

#### Release checkpoint: AI Builder

- [ ] Commit and push the AI Builder test and behavior concerns.
- [ ] Run the full candidate gate and publish the AI Builder-only candidate.
- [ ] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [ ] Begin generic channel work only after the candidate is published and its
  required smoke jobs pass.

#### Generic channel foundation

- [ ] Define the supported channel catalog and provider-neutral connection,
  account, binding, and health/status response types.
- [ ] Add safe OpenClaw config read/update helpers that preserve unrelated and
  unknown fields.
- [ ] Add masked credential status and provider-specific validation without
  exposing stored values.
- [ ] Add bind, rebind, unbind, connect/update, disconnect, probe, and pairing
  lifecycle operations with durable success/failure evidence.
- [ ] Keep WhatsApp behavior working while adapting it to the shared presentation
  contract where practical; do not perform an unrelated WhatsApp rewrite.

#### Telegram vertical slice

- [ ] Connect or update a Telegram bot token through the protected secret path.
- [ ] Configure the supported default policy and optional numeric owner/user
  allowlist without silently opening the bot publicly.
- [ ] Bind the Telegram account, account wildcard, or selected peer to an agent.
- [ ] Surface pairing-required, connected, probe-failed, bound, and unbound
  states on the Agents page.
- [ ] Support disconnect/revoke without deleting unrelated channel accounts or
  agent bindings.
- [ ] Add focused configuration, API, persistence, redaction, error, and UI tests.

#### Release checkpoint: Telegram

- [ ] Commit and push the generic channel foundation and Telegram as focused,
  reviewable concerns.
- [ ] Run the full candidate gate and publish the Telegram candidate.
- [ ] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [ ] Begin Discord only after the candidate is published and its required smoke
  jobs pass.

**Day 1 exit:** explicit-create guarantees are tested end to end, and one agent
can be safely associated with a Telegram connection through the Dashboard
contract. The AI Builder candidate is already published; publish the Telegram
candidate before beginning Discord.

### Day 2: Discord, Slack, and coverage closure

#### Discord

- [ ] Configure a Discord bot token using the shared secret boundary.
- [ ] Capture and validate the application/server/user information required by
  the selected setup path without assuming every agent uses the same guild.
- [ ] Support pairing or explicit allowlists and agent bindings at channel,
  account, guild, and selected-peer scopes supported by the UI.
- [ ] Surface missing intents/permissions, pairing-required, connected,
  probe-failed, bound, and unbound states.
- [ ] Add focused configuration, API, persistence, redaction, error, and UI tests.

#### Release checkpoint: Discord

- [ ] Commit and push Discord behavior and tests as a focused concern.
- [ ] Run the full candidate gate and publish the Discord candidate.
- [ ] Record the exact SHA, tag, coverage totals, and public/combined CI links.
- [ ] Begin Slack only after the candidate is published and its required smoke
  jobs pass.

#### Slack Socket Mode

- [ ] Configure bot and app-level tokens through separate protected secret
  references.
- [ ] Validate Socket Mode prerequisites and report actionable missing-token,
  scope, token-mismatch, and connection errors.
- [ ] Support agent bindings at channel, account, Slack team, and selected-peer
  scopes supported by the UI.
- [ ] Surface pairing-required, connected, probe-failed, bound, and unbound
  states.
- [ ] Add focused configuration, API, persistence, redaction, error, and UI tests.

#### Shared presentation and lifecycle

- [ ] Replace WhatsApp-only actions in agent cards/detail/actions with a generic
  Channels entry that shows each provider independently.
- [ ] Preserve the Agents page header, controls, action menus, responsive
  stacking, and grid/detail/list presentations.
- [ ] Ensure connection and binding history remains inspectable after success,
  failure, rebind, disconnect, and restart.
- [ ] Visually audit desktop and mobile layouts, long provider errors, empty
  states, loading/progress states, and disconnect confirmation dialogs.

#### Coverage and validation

- [ ] Cover new channel branches as part of implementation rather than adding a
  test-only cleanup pass later.
- [ ] Add focused missing branches in `server/routes/agents.ts` and
  `server/routes/channels.ts`, especially provider failures, invalid payloads,
  config preservation, and idempotent disconnect/unbind behavior.
- [ ] Reach at least 71.2% measured branch coverage while preserving or improving
  lines and functions.
- [ ] Run TypeScript and every directly affected unit/contract suite.
- [ ] Run the complete integration, validation, and coverage suite after focused
  work is committed.

#### Release checkpoint: Slack and sprint closure

- [ ] Commit and push Slack behavior, tests, and any separately reviewable
  coverage-only concern.
- [ ] Run the full candidate gate and publish the Slack candidate.
- [ ] Record the exact SHA, tag, final coverage totals, and public/combined CI
  links.
- [ ] Complete sprint handoff only after the candidate is published and its
  required smoke jobs pass.

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
- [ ] Finish any sequential candidate release still running or awaiting a
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

- [ ] Explicit creation requests always retain the correct AI Create action and
  navigate with the original prompt.
- [ ] Negative and ambiguous AI Builder cases do not regress reuse/refine paths.
- [ ] Telegram, Discord, and Slack Socket Mode use the shared channel contract.
- [ ] Agents can be bound and unbound without duplicating or exposing provider
  secrets.
- [ ] Connection, binding, pairing/access, error, and lifecycle state are
  visible after each user operation.
- [ ] Focused tests cover success, failure, persistence, redaction, and
  responsive presentation paths.
- [ ] Complete integration, validation, and coverage pass.
- [ ] Branch coverage is at least 71.2%.
- [ ] AI Builder, Telegram, Discord, and Slack each have a separately published
  candidate with owning SHA and public/combined CI evidence.
- [ ] External smoke status is accurately recorded for each provider.
- [ ] All owning-repository changes are committed and pushed with approved
  lowercase Conventional Commit prefixes.

## References

- [AI Builder / Designer](../features/AI_BUILDER_DESIGNER.md)
- [Testing Guide](../TESTING_GUIDE.md)
- [OpenClaw channel routing](https://docs.openclaw.ai/channels/channel-routing)
- [OpenClaw Telegram](https://docs.openclaw.ai/channels/telegram)
- [OpenClaw Discord](https://docs.openclaw.ai/channels/discord)
- [OpenClaw Slack](https://docs.openclaw.ai/channels/slack)
