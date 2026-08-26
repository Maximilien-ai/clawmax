# Changelog

All notable changes to ClawMax are documented here.

## [Unreleased]

### RC45 source candidate
- **RC43 feedback repairs** — authorize normalized LM Studio/Gemma execution models, package the pinned QBO CLI in Linux amd64/arm64 runtime images, prevent invented Builder agent targets, clarify first-use and agent-creation flow, disclose AI rewrite score changes with undo, separate optional skill setup from agent creation, and connect the Partner setup surfaces.
- **Correct QBO packaging verification** — RC44 downloaded and checksum-verified QBO v0.6.1 on both architectures, but failed before publication because that release does not support `qbo --version`. RC45 validates its unauthenticated JSON schema and exact compiled version instead.
- **Focused acceptance** — advance the six human-judgment/external-environment checks to RC45 while preserving RC44 criteria in historical Review data. The complete RC43 feedback register tracks source fixes separately from image and tester evidence.
- **Publication status** — RC44 produced no manifest or accepted digest. RC45 source validation is in progress; RC43 and RC44 remain historical evidence and are not promotable.

### RC40-RC43
- **Final-candidate plugin visibility** — RC43 surfaces generic plugin activity on agent and workflow cards, lists, relationship views, and detail views with compact summaries and inspectable evidence. The public presentation remains domain-neutral; enterprise product implementation and acceptance stay private.
- **External plugin acceptance boundary** — RC42 decouples deployment-mounted plugin discovery from public product assumptions and adds a public launcher for contract tests owned by an external plugin repository, without copying private plugins or tests into this repository.
- **Gemini creation reliability** — RC41 binds AI generation to the selected Gemini provider/model and retains focused provider regressions, including the previously failing Gemini path.
- **Authorized session bootstrap consumption** — the dashboard consumes gateway-issued, authorization-bound sessions without accepting tenant, workspace, or runtime identity from caller-controlled routing inputs.
- **Release evidence** — RC43 source `a4b78c1d` passed the `463/463` local integration, validation, coverage, and live-execution gate. Public amd64/arm64 publication and registry smoke passed in [run 32658795332](https://github.com/Maximilien-ai/clawmax/actions/runs/32658795332) with manifest digest `sha256:8af1e160106db1acab5e9b853743cad943effe8de5d52dc11890dd0b2b715c44`; matching combined-image evidence remains private.

### RC39
- **Praveen dashboard regression candidate** — agent discovery and partial-data rendering, long-running chat stream safety, and workflow concurrency/cancellation/restart state now have a focused three-journey independent Review set. The underlying reported defects are covered by automated tests and closed optimistically for RC39 verification; RC38 criteria remain preserved as historical review evidence.
- **Truthful plugin advisory behavior** — generic Guardrail configuration intent is preserved without claiming enforcement the host cannot provide, and unsupported AI Eval suggestions no longer fabricate deterministic scores. Private product implementation and acceptance evidence remain in the private plugin repository.

### RC38
- **Focused independent release review** — the current tester queue is reduced from 20 component and release checks to seven end-to-end journeys that require human product judgment, real OAuth providers, or a persistent upgraded runtime. Historical 1.9.9 and earlier-2.0 checks remain preserved for traceability but are not offered as current tester work; starting a new focused checklist archives every superseded release without deleting results, notes, evidence, or verifier history.
- **Security sign-off candidate** — RC38 carries the completed 2.0 source security hardening and zero-vulnerability dependency gate on top of the accepted RC37 OpenClaw `v2026.6.34` session-recovery runtime. Final public/private image digests and cloud/on-prem runtime evidence remain release gates.

### RC37
- **Automatic session-conflict recovery** — post-RC36 on-prem testing found that an OpenClaw embedded-session takeover still required a manual chat reset. Chat now retries once with a fresh bounded session when no assistant output was streamed, retains that recovered session for later messages, and workflow retries use the same one-retry bound.

### RC36
- **OpenClaw `v2026.6.34` candidate** — the 2.0 development line now pins OpenClaw's extended-stable security and reliability release. The isolated source gate passed `443/443`, including live chat, workflow execution, DAG progression, skills, Gateway compatibility, validation, and coverage. PR and post-merge CI passed, and the public plus authorized combined amd64/arm64 images passed identity, publication, registry, privacy, discovery, and live runtime smoke gates.
- **Plugin-owned OpenClaw skills** — bundled skill discovery now follows skill roots declared by OpenClaw extension manifests, preserving Slack, Discord, Canvas, Voice Call, and WhatsApp after their upstream package move while rejecting manifest path traversal and symlink escape.
- **Portable OpenClaw preparation** — target preparation no longer reports success after a failed clone or build, and corepack-only CI environments expose a scoped `pnpm` shim to nested upstream build steps. Dynamic regressions cover both paths.

### RC34
- **Release candidate validation** — RC34 passed the accepted `441/441` local integration, validation, and coverage gate plus public and authorized combined amd64/arm64 image publication and registry smoke.
- **RC35 review preparation** — the current Review set covers explicit AI Create handoffs, shared AI editor expansion, Lifecycle target/X-ray loading, plugin target visibility, and activity-sharing revocation. Earlier RC checks remain in the cumulative Review set, while RC34 remains the green starting evidence.

### Added
- **Agent Runtimes (Claude Code / Factory Droid)** — agents can now execute via the Claude Code or Factory Droid CLI instead of OpenClaw, selectable as a workspace default (Integrations → Runtime) or pinned per agent (agent editor), consistently across direct chat, group/channel chat, workflows, and scheduled/cron runs. Both CLIs run with full autonomy (`claude --dangerously-skip-permissions`, `droid --auto high`) and authenticate headlessly via `ANTHROPIC_API_KEY` / `FACTORY_API_KEY`. Ships across every deployment path: Docker image (pinned `@anthropic-ai/claude-code` + Droid installer versions), `setup.sh`/`doctor.sh` non-fatal CLI detection, and `.env.example`/README/SETUP docs.
- **2.0 Declarative Plugin Contract** — the `clawmax.ai/v2` manifest adds generic record schemas and defaults, declarative list/form presentation, generic templates, workspace storage, and compatibility validation without requiring a new core page or route for every plugin domain.
- **External Plugin Boundary** — plugin discovery supports deployment-mounted roots plus explicit enablement while preserving a zero-plugin runtime. Public and private plugins use the same contract; private source and production enablement remain outside the public repository and default image.
- **Plugin Health Diagnostics** — System & Logs and `/api/plugins/diagnostics` report loaded, disabled, invalid, incompatible, duplicate, and missing plugins with manifest versions, paths, and actionable remediation instead of silently dropping discovery failures.
- **Least-Privilege Plugin Capabilities** — plugin document and notification operations now require explicit manifest grants, workspace context is filtered across agents, workflows, and communications, malformed capability declarations invalidate the manifest, and plugin pages plus diagnostics expose the effective grants.
- **Test Plugin Validation Policy** — local test runs enable synthetic `plugin-*` contract fixtures for broader plugin coverage; public images enable only public product plugins.
- **Release Review Checklists** — the public Review plugin loads each release from one versioned JSON checklist, initializes it in one action, isolates records behind one release tab at a time, reports completed/total progress, and persists checkboxes, outcomes, notes, and evidence so results from one RC cannot be mistaken for another.
- **Public Lifecycle X-rays** — the public Lifecycle plugin provides searchable multi-agent and multi-workflow inspections with compressed proportional fishbone timelines, clickable event evidence, collapsible detail sections, workflow execution and participant history, five focused suggestions, and metadata-only artifact/conversation visibility without bundling enterprise policy, evaluation, or optimization products.
- **Private Enterprise Plugin Boundary** — Evals, Guardrails, and Optimize manifests, catalogs, implementation plans, and product tests now live in the private `clawmax-plugins` monorepo and combined image; the public repository retains only generic host adapters and synthetic fixtures.
- **Declarative Numeric Plugin Controls** — v2 manifests can declare bounded numeric sliders with exact-value inputs, shared browser normalization, and server-enforced limits; Optimize applies them to token, cost, duration, and quality targets.
- **Permanent Optimize Planning Catalog** — the private enterprise Optimize plugin includes eight suggestions covering agent, workflow, and workspace planning across tokens, cost, speed, quality, schedule efficiency, and automatic model-selection priorities.
- **Plugin Draft Quality Scoring** — AI Create and manual plugin creation expose a public deterministic quality score with concrete suggestions for missing targets, controls, eval inputs, expected outputs, and generic required fields.
- **Plugin Relationships And Lifecycle Evidence** — plugin workspaces add a relationship view alongside grid, detail, and list views; active guardrails appear on targeted agent and workflow cards; guardrail activation history and eval completion notifications make plugin activity visible after an operation.
- **Persistent Plugin Navigation And Views** — plugin entries can be reordered in the sidebar and retain that browser-local order, with Review last by default; each plugin also restores its last selected grid, detail, list, or relationship view.
- **Instance Plugin Manager** — the PLUGINS sidebar heading now includes a responsive manager that lists every discovered deployable plugin, identifies public and private packages, and persists an explicit enabled selection across restarts without exposing synthetic contract fixtures.
- **Release Review Export** — Review exports a release-specific Markdown handoff containing checklist outcomes, notes, evidence, reviewer identity, environment and instance details, timestamps, and sanitized recent runtime errors.
- **Dedicated Plugin Suggestions** — plugin suggestions live in a separate counted tab instead of appearing above active workspace items, with independent search, tag filters, recommendation/name sorting, and a return to Active after use.
- **Consolidated Tester Review History** — Review retains stable-line and earlier-2.0 acceptance history alongside one focused current-RC set; every check separates the action from its pass result and can identify prior tester confirmation without merging browser-local state.
- **Actionable Review Procedures And Imported Evidence** — every retained release check now includes numbered actions and an objective pass condition; RC4/RC5 exports preserve Max's local navigation, restart, and automated-suite confirmations while keeping untested image, private-plugin, Guardrails, Evals, and RC8 work pending.
- **Review Release Archiving** — testers can archive or restore an entire selected release from Review, archived releases no longer clutter Active, and starting a new focused checklist retires superseded sets while preserving unfinished work and evidence.
- **Public Mail Capability Foundation** — Gmail and Microsoft 365 share a versioned read/search/read-body/create-draft contract with exact workspace, agent, plugin fingerprint, account, and capability grants; bounded fake-provider tests prove inbound message text cannot add recipients or permissions, while preview partner entries avoid unusable password fields.
- **Encrypted Mail OAuth Foundation** — provider-neutral Gmail and Microsoft 365 connection routes add short-lived actor/workspace-bound state, PKCE S256, replay protection, encrypted restart-persistent token storage, metadata-only readiness, refresh, and disconnect behavior validated through fake provider exchanges.
- **Production Mail Identity Adapters** — opt-in Google and Microsoft adapters implement authorization-code exchange, PKCE, delegated account identity, offline refresh, safe disconnect behavior, strict callback configuration, sanitized provider errors, and fixed capability-to-scope mapping that rejects raw scopes.
- **Mail Partner Connections And Draft Adapters** — Gmail and Microsoft Partner panels expose workspace connection, refresh, reconnect, and disconnect states; bounded provider adapters implement inbox list/search, metadata/body read, and unsent draft creation without a send operation, while recipient and subject header injection fails closed.
- **Explainable Agent Model Suggestions** — agent AI creation and existing-agent editing rank only models visible to the current runtime, expose Quality, Balanced, and Cost priorities, show confidence, reasons, alternatives, and unknown capability assumptions, and require explicit selection plus Save before changing an existing agent.
- **Opt-In Automatic Model Selection** — Add Agent and Edit Agent can automatically track the current top runtime-visible suggestion while preserving the last manual choice; each agent persists its own Auto mode and Quality, Balanced, or Cost priority, and Save/Create still writes one concrete supported model.
- **Guardrail Relationship And AI Editing Surfaces** — compatible Guardrail plugins can render protections through each Guardrail to assigned agents and workflows, preview relationships on hover, inspect selected or archived details in the standard drawer, explore suggestions inline, and configure reviewable draft controls and assignments through a full-width AI-assisted editor.
- **Eval Experiment Relationship Preview** — compatible Eval plugins can visualize evaluated attributes, planned and completed trial counts, AI/Human/Fixed evaluator identity, and assigned agents or workflows; Suggested Evals use dashed target placeholders and inline details while saved records retain standard detail drawers.
- **AI-Assisted Eval Configuration** — Eval editors add a remembered full-width AI configuration panel that can update evaluator type, bounded trial count, target, input, expected outcome, attributes, and description with a visible change summary and Undo; manual controls persist the same fields.
- **Eval Targets, Guidance, And Trial Cases** — Eval editors replace raw target IDs with searchable agent, workflow, and group selection; evaluator-specific guidance and a dedicated case editor capture per-run text or workspace-file inputs and expected outcomes.
- **Evaluator-Specific Eval Configuration** — AI evaluators expose a judge prompt, Human evaluators expose reviewer instructions, and Fixed evaluators use explicit Exact, Contains, or Regular expression comparison rules with optional case sensitivity.
- **Eval Regex And Human Review Handoff** — Fixed evaluators validate regular expressions and can suggest an editable pattern from plain language; Human evaluators capture reviewer metadata and create a pending workspace Markdown review without a fabricated score or implicit email delivery.

### Fixed
- **Readable Plugin Artifact Names** — generated plugin item and summary Markdown files use a sanitized record name plus a short stable identity suffix instead of an opaque UUID-only filename, while renamed records clean up superseded item files.
- **Local External Plugin Configuration** — local startup honors ignored `.env` plugin selections and paths before applying public synthetic defaults, allowing private plugins to load in development without exposing them in the public repository or image.
- **Truthful Eval Evaluator Modes** — Eval records preserve AI, Human, and Fixed evaluator choices plus planned trial counts; Human evaluations require an actual reviewer instead of silently producing a fixed automated score.
- **Suggested Guardrail Relationship Preview** — Suggested Guardrails now render directly from the filtered suggestion catalog with dashed unassigned agent and workflow targets, inline selected details, and a stable graph header that does not shift its legend during hover or selection.
- **Mail Partners Hidden After Upgrade** — the exact legacy five-partner availability default now migrates to include Gmail and Microsoft 365, while genuinely custom partner allowlists remain unchanged.
- **Checklist-First Review UI** — release checks now render as a responsive list with direct completion and note editing. Internal checklist seeds no longer appear as misleading `Recommended` cards with `Use Template` actions.
- **Review Outcome Visibility** — passed checks remain green and crossed out, failed checks have a direct fail action and red treatment, and checks with user notes use an amber treatment without pre-populated guidance making untouched checks look commented.
- **Plugin Starter Language** — generic plugin starter content now uses `Suggested` and `Use`, reserving `template` for ClawMax organization, agent, and workflow templates; applying a suggestion opens the selected item for immediate customization.
- **Compact Plugin Navigation** — manifests can declare a one- or two-word `nav.label`; the sidebar truncates unexpected overflow with a tooltip while preserving the full plugin name on its page.
- **Scrollable Sidebar Layout** — long plugin and System navigation now scrolls inside the dark viewport-height sidebar while account and version controls remain visible instead of overflowing onto the page background.
- **Mobile Plugin And Export Layout** — plugin routes constrain horizontal overflow and the Review export dialog keeps its header, scrollable content, and actions usable at narrow mobile widths.
- **Mobile Plugin Toolbar Wrapping** — plugin view controls use their own mobile row so Create and Actions remain visible instead of being clipped offscreen.
- **Cached Plugin Suggestions** — plugin suggestion files are cached for five minutes, revisited plugin pages retain their rendered data while refreshing in the background, and the explicit Refresh action bypasses the cache.
- **Encrypted Secret Setup Clarity** — Agent & Skill Access locks credential inputs until the deployment operator key exists, presents short restart-safe setup steps, and labels the unavailable Save action with its exact prerequisite.
- **Mobile Agent Model Editing** — Edit Agent Config now stays within the phone viewport, wraps long provider/model identifiers, keeps all priority controls visible, and preserves reachable Cancel and Save actions.
- **Consolidated Persisted Review Sets** — separately started RC5, RC10, RC16, and other earlier 2.0 review records migrate into the cumulative set, merging completions, failures, notes, evidence, and verifier metadata while removing duplicate checks.
- **Secret Test Setup Guidance** — Agent & Skill Access distinguishes the packaged `clawmax-secret-test` skill from the `CLAWMAX_TEST_SECRET` encrypted key, links to skill assignment, and blocks authorization until the selected agent has the skill.
- **Compatible Automatic Model Choices** — automatic recommendations exclude known OpenClaw web-search incompatibilities such as `o1`, `o3`, and `o3-mini`, explain the exclusion, and leave those runtime-visible models available for deliberate manual selection.
- **Actionable Model Tool Errors** — unsupported web-search failures now name the actual model, link directly to the affected agent editor, and hide unrelated state-migration, plugin, stack, and gateway log output from chat.

### Remaining Before Promotion
- **2.0 release gates** — complete hands-on testing, cloud and on-prem restart checks, real-provider validation or explicit deferral, and exported Review sign-off described in the [launch plan](SYSTEM/docs/planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md).

## [v1.9.9] - 2026-07-21

### Added
- **Native OpenRouter Provider** — `1.9.9` adds first-class OpenRouter credentials, native `openrouter/...` model discovery, provider-isolated chat/group/workflow execution, actionable readiness checks, and Keys & Secrets/BYOK support without routing OpenRouter through the LM Studio-oriented generic endpoint.
- **Native xAI / Grok Provider** — first-class `XAI_API_KEY` capture and validation, runtime-compatible `xai/...` model discovery, native OpenClaw auth profiles, and provider-isolated direct/group/workflow execution. Grok 4.5 remains hidden until the pinned OpenClaw runtime advertises and executes it.
- **Brokered Agent-Skill Secrets** — encrypted workspace storage, exact agent/skill/fingerprint/key grants, revocation, short-lived runtime capabilities, fixed registered actions, child-process-only injection, masked inventory, and output/audit redaction let authorized skills use credentials without exposing a general vault reader or placing raw values in the parent agent environment.
- **Secret Broker Validation Skill** — the packaged `clawmax-secret-test` skill and `clawmax-skill-run` runtime command provide a non-production local/container validation path that reports availability and a one-way fingerprint without returning the raw sentinel.
- **Scoped Keys & Secrets Navigation** — reorganized the page into persistent Agent & Skill Access, Workspace Keys, Global Keys, and Partners tabs using the dashboard's existing bottom-border tab pattern, with mobile horizontal scrolling and filter pills retained inside key inventories.

### Fixed
- **Mobile-Safe Workflow Runs** — workflow run dialogs now use the dynamic mobile viewport, keep long forms in an independent scroll region, and keep Cancel/Run actions above iPhone browser chrome and safe areas. A repository-wide dialog audit now prevents new full-panel viewport-scrolling regressions.
- **Truthful Secret Runtime Availability** — Keys & Secrets distinguishes browser-local vault entries from runtime-managed integration entries and explicitly states that browser-vault values are not available to agents or skills. Runtime-managed entries no longer imply a general agent secret grant.
- **Pinned OpenAI Model Compatibility** — model discovery and defaults now follow the OpenClaw `v2026.6.11` runtime catalog. Existing agents saved with unsupported `gpt-5`, `gpt-4.1`, or `gpt-4o` aliases execute through `gpt-5.4-mini` without requiring redeployment.
- **Long Agent Tool-Run Feedback** — chat distinguishes a potentially multi-minute tool-enabled run from ordinary typing, reports elapsed time and the three-minute bound, and explains incomplete tool turns without implying that no actions occurred.
- **Gmail Secret Boundary Guidance** — browser-local key tabs now state that key names cannot be referenced from agent chat and that storing a Gmail password alone does not grant mailbox access, with direct navigation to skill discovery and explicit agent-skill authorization.

### Release Validation
- Promoted unchanged from `1.9.9-test-rc6` after `401/401` local integration/validation checks, amd64 and arm64 image verification, manifest publication, and registry smoke.
- Preserves the OpenClaw `v2026.6.11` runtime baseline and keeps normal Google account passwords outside supported agent-secret flows.

## [v1.9.8] - 2026-07-18

### Added
- **Federated Skill Registry Search** — the Skills import dialog can search ClawHub, Shipables, and Tessl together while retaining the correct provider for installation.
- **Safe DocHub Bulk File Management** — user uploads are recorded in a dashboard-owned ownership ledger and can be selected, moved in bulk within their original upload boundary, or deleted in bulk; agent-generated and untracked files remain protected.
- **Descriptive Export Filenames** — template, workflow, and agent downloads use sanitized object names and type-specific suffixes instead of generic filenames such as `TEMPLATE.md`.
- **Dashboard Location Memory** — the dashboard remembers the last valid page when reopening from the root URL, while explicit deep links still take precedence; System navigation expansion continues to persist across refreshes.

### Fixed
- **Container Plugin Environment Precedence** — cloud and on-prem runtime values for plugin paths, explicit plugin enablement, and default-plugin policy now remain authoritative when the packaged dashboard also contains a local `.env` file.
- **Persistent DocHub Selection Actions** — the DocHub toolbar now stays outside the document-tree scroll region, keeping the selected-file count plus Move, Delete, and clear actions visible while browsing long agent and workflow lists.

### Release Validation
- Promoted from `1.9.8-test-rc5` after amd64 and arm64 image builds, manifest publication, registry smoke, local automated coverage, and tester confirmation of the final DocHub selection-toolbar fix.
- Preserves the OpenClaw `v2026.6.11` runtime baseline established in `1.9.7`.

## [v1.9.7] - 2026-07-13

### OpenClaw Runtime
- **OpenClaw `v2026.6.11` Promotion** — this is the first fully validated ClawMax release on the new OpenClaw baseline across local development, CI/image packaging, cloud/container runtimes, and on-prem deployments.
- **Container Runtime State Compatibility** — agent execution now works with mounted OpenClaw homes and persistent runtime state instead of relying on desktop-only filesystem behavior.
- **Packaged Plugin Policy** — container startup cleans stale plugin allowlist sentinels, uses an explicit packaged plugin policy, and keeps non-bundled plugin discovery from silently changing runtime behavior.
- **Current OpenClaw Config Compatibility** — agent provisioning, model fallback configuration, auth-profile persistence, and runtime config writes avoid keys or mutations rejected by the current OpenClaw contract.

### Chat And Model Execution
- **Containerized Agent Chat Recovery** — direct and group chat now use the correct packaged OpenClaw execution path, preserve current auth profiles, and surface temporary/runtime failures instead of returning empty or misleading responses.
- **Provider Environment Isolation** — hosted OpenAI, Anthropic, Gemini, Ollama, and OpenAI-compatible/LM Studio execution environments are isolated so a local endpoint cannot accidentally capture a hosted model request.
- **Explicit Execution Readiness** — agents with unavailable credentials, runtimes, or provider paths fail with actionable guidance before an opaque CLI attempt.
- **Unsupported Model Remediation** — errors include the configured model identifier, explain why the current runtime may not support it, and provide a direct link to edit the affected agent.
- **Conservative Backup Models** — automatic fallback only uses explicitly configured, valid backup models and repairs invalid legacy backup-model state.
- **Cleaner Runtime Output** — benign OpenClaw transport, plugin, migration, and filesystem diagnostics no longer replace the useful agent response, while real runtime failures remain visible.

### Workflow Reliability
- **Embedded Session Conflict Recovery** — workflow participants recognize `EmbeddedAttemptSessionTakeoverError` and related session-change diagnostics even when OpenClaw returns them inside a successful or mixed diagnostic payload.
- **Fresh Retry Sessions** — bounded retries rotate to a fresh workflow session identifier and repair stale session pointers instead of reopening the transcript that already conflicted.
- **Provider-Correct Workflow Execution** — workflows inherit the same provider isolation and BYOK/auth handling as direct chat, preventing hosted models from being sent to OpenAI-compatible local endpoints.
- **Actionable Workflow Failures** — workflow threads, notifications, and execution details normalize raw runtime errors into operator guidance without exposing internal session paths.

### Builder And Communication
- **Generated Handoff Correctness** — Builder/company generation better preserves workflow handoffs, avoids empty leaf teams, and makes upstream/downstream progression more consistent.
- **Chat Inbox Attachments** — agent chat, group chat, and shared communication flows can fan uploaded inbox attachments out to the participating agents.
- **Builder Agent Mentions** — Builder prompt entry supports current-workspace `@agent` autocomplete for clearer routing and grounding.
- **Workspace Skill ZIP Uploads** — Skills can import ZIP bundles directly through the active workspace, including cloud/container/on-prem deployments where laptop filesystem paths are not visible to the runtime.

### Testing And Validation
- **Live BYOK Coverage** — integration chat, workflow, and per-model performance samples now pass configured system provider credentials through the same structured BYOK path used by the product.
- **Full Local Gate** — the release branch passed `386/386` integration and validation checks with coverage at `77.52%` statements/lines, `68.03%` branches, and `88.42%` functions.
- **Multi-Architecture Image Gate** — `1.9.7-test-rc22` passed amd64 and arm64 image builds, manifest publication, and registry smoke validation.
- **On-Prem Runtime Gate** — direct agent chat, group chat, workflow kickoff, and the previously failing downstream Daily Standup workflow were verified on the promoted on-prem candidate; both participants completed without session-takeover failure.

### Release Validation
- Promoted from `1.9.7-test-rc22` after iterative cloud/on-prem debugging of the OpenClaw `v2026.6.11` packaging, auth, provider, plugin, and session-execution contracts.
- `1.9.6` served as the initial OpenClaw update validation line but was not promoted as stable; `1.9.7` is the first release where the new runtime passed the complete local and containerized chat/workflow gate.

## [v1.9.3] - 2026-07-01

### Fixed
- **Chat Archive Correctness / Resume** — archived chat history now filters runtime-only rows, sanitizes malformed legacy timestamps, keeps the current conversation distinct from archived rows, restores archived chats cleanly back into the active conversation, consumes restored archive copies instead of duplicating them, and keeps archive ordering stable across remounts.
- **Templates Mobile Layout** — Templates now avoids the mobile overflow regression on narrow Safari/iPhone-sized viewports by using wrapping-safe control rows and overflow-safe page containers.
- **Workflows First-Load Initialization** — Workflows initial-load and polling requests now use workspace-scoped paths consistently, reducing first-visit stalls that previously cleared only after switching workspaces and back.
- **On-Prem Custom Skill Import Guidance** — unsupported local browse/import flows now explain the runtime-host vs laptop distinction clearly and point users at the managed workspace custom-skills directory for cloud/on-prem installs.

### Testing
- **Expanded 1.9.3 Coverage** — added visible regression lanes for chat archive presentation/open mode/list state/display order, archive helper behavior, template mobile layout, workflow request paths, and on-prem skill import/runtime-path guidance.

### Release Validation
- Promoted from `1.9.3-test-rc1` after chat archive, mobile Templates, first-load Workflows, and on-prem skill-import validation.

## [v1.9.2] - 2026-06-30

### Fixed
- **Local Skill Import Runtime Guidance** — local skill browse/import now fails with clear runtime-visibility guidance instead of raw `osascript` shell noise, trims pasted local paths, and distinguishes missing paths from file-vs-directory mistakes in cloud/container/on-prem environments.
- **Workflow / Logs / Notification / Doctor Diagnostics** — workflow participant failures, logs, notifications, and doctor surfaces now normalize raw provider/runtime/gateway/auth noise into clearer operator-facing messages for missing keys, invalid credentials, rate limits, cooldowns, missing runtime artifacts, and reconnect-class runtime faults.
- **DocHub / File-Open Payload Parsing** — shared `/api/docs` response parsing now accepts `docs`, `entries`, and legacy `files` payload shapes consistently across Workflows, Organizations, Communication, shared dashboards, and chat surfaces.
- **Workspace Doc Navigation URLs** — workspace doc navigation now correctly normalizes `workspace-file:` prefixes, fragments, query strings, and percent-encoded paths before resolving DocHub targets.

### Testing
- **Expanded 1.9.2 Coverage** — added visible regression lanes for workflow runtime errors, local skill-import edge cases, workspace doc-navigation URL parsing, log runtime signals, doctor runtime signals, notification runtime messaging, and docs-index response parsing.

### Release Validation
- Promoted from `1.9.2-test-rc1` after cloud/on-prem validation of the explicit versioned RC image tag flow and the customer-reported local skill import/runtime-path fixes.

## [v1.9.1] - 2026-06-28

### Changed
- **Test Backfill Push** — the standard wrapper suite now surfaces substantially more helper/edge-case lanes across workspace scope/navigation, file mention parsing, navigation/plugin routing, notifications, markdown/file links, dropdown placement, prompt attachments, builder sessions, metering presentation, keys/secrets inventory, product icons, maintenance banners, skill tags, template search, auth, workspace upload, agent/workspace/template route edges, chat/workflow/gateway readiness, and related client/server helpers.
- **Coverage Measurement In Wrapper** — the normal `integration --with-validation` harness now supports opt-in `--coverage`, emits a computed `c8` summary at the end of the run, and writes coverage artifacts under `SYSTEM/dashboard/coverage/`.
- **Deeper Server Route / Lib Coverage** — `1.9.1` backfill now includes broader regression coverage across `agents`, `workflows`, `templates`, `skills`, `channels`, `logs`, `ai-builder`, `github-auth`, `gateway-rpc`, `workspace-upload`, and internal `ai-generator` logic instead of only adding client helper lanes.
- **Notification Test Stability** — grouped notification assertions now compare grouped entity IDs order-independently so CI does not fail on harmless ordering variation.

### Testing
- **Visible Wrapper Count Increase** — the default-safe wrapper count is now at `369` passing lanes on the current branch head.
- **Measured Coverage Baseline** — the latest full wrapper run under `c8` is `77.25%` statements/lines, `67.18%` branches, and `88.27%` functions.

### Release Validation
- Promoted from `1.9.1-test-rc2` after cloud/on-prem validation on the `369`-lane wrapper baseline.

## [v1.9.0] - 2026-06-23

### Fixed
- **Archived Chat Recovery** — archived agent conversations now render cleaner archive rows, avoid phantom/zero-message entries, parse archive timestamps more reliably, and support `Continue`/restore back into the active live conversation.
- **Workflow Notification Resolution** — successful workflow runs now resolve stale workflow-scoped `workflow-failed`, `agent-error`, and `needs input` notifications more aggressively instead of leaving superseded failure noise active after a green run.
- **Workflow Thread Cleanup** — workflow/group/community conversations now normalize raw provider auth/network fallback spam into shorter operator-facing runtime messages instead of dumping raw fallback internals into the thread.
- **Group Chat Timeline Readability** — group/community chats now show `Today`, `Yesterday`, and dated separators, and older messages include `date + time` instead of only a same-day-looking clock label.
- **Workflow Channel Target Inference** — runtime workflow delivery now infers group/community targets from `teamIds` and shared targeted-agent memberships, reducing the need for duplicated explicit `groups` / `communities` wiring just to land workflow output in the correct thread.
- **Waiting-Input Conversation Routing** — waiting-for-input notifications now use the same inferred workflow channel targets, so `Open conversation` lands in the real workflow discussion context even for team-targeted workflows without duplicated channel wiring.
- **DocHub Warmup Navigation** — workflow results, shared dashboard artifacts, and organization/workflow document links stay navigable through direct workspace-path fallbacks even before the doc index finishes warming up.
- **Chat / Runtime Diagnostic Consistency** — chat surfaces now align on the same clearer wording for missing credentials, rejected keys, sticky auth state, quota/rate-limit failures, cooldowns, and missing execution paths.
- **Host Agent Status Override Honoring** — host-agent status now respects `OPENCLAW_HOST_AGENT_STATE_PATH` as authoritative instead of falling through to unrelated machine-local state files during validation.
- **Builder AI Description Synthesis Follow-Through** — the Builder fallback path now synthesizes `AI Description` from user intent only, excluding assistant/system turns and avoiding raw multi-turn chat leakage into saved agent metadata.

### Testing
- **Expanded 1.9.0 Coverage** — added visible regression coverage for archived-chat restore, workflow stale-notification resolution, workflow thread normalization, inferred workflow communication targets, inferred waiting-input conversation targets, DocHub warmup navigation, host-agent state override honoring, and aligned chat runtime error messaging.

## [v1.8.9] - 2026-06-20

### Fixed
- **Auth / Runtime Hardening** — waiting-for-input notifications now open the actual workflow group/community conversation context; workflow runs preserve full OpenAI-compatible runtime settings instead of collapsing into hosted OpenAI auth paths; stale auth/session state is reset more aggressively after credential changes; and user-facing auth failures more clearly distinguish invalid keys, missing credentials, sticky auth state, and transient provider cooldowns.
- **Builder Metadata Cleanup** — Builder/Add Agent no longer stores a raw single chat turn verbatim as the generated agent `AI Description`; provisioning now synthesizes a cleaner description from generated agent content first.
- **Agent Chat History Recovery** — agent chat history now resolves explicit/current sessions correctly instead of depending only on legacy `:dashboard-chat` mapping/archive assumptions, and the current conversation is visible from History even before an archive exists.
- **Local Dashboard Chat Stability** — normal dashboard chat stays on stable local sessions, local replies are recovered from persisted sessions when stdout comes back empty, and the agent chat panel no longer crashes on streamed replies.
- **Workflow Failure Deep Links** — `workflow-failed` notifications now open the failed execution run directly instead of only landing on the workflow definition shell.
- **WhatsApp Pairing Hardening** — linked WhatsApp flows are more resilient against the `linked` / `done` event race at the end of pairing.
- **Notification / Workspace Switch Cleanup** — notifications now reset and refetch on workspace switch instead of hanging onto stale state from the previously active workspace.
- **Chat Timeline Readability** — agent chat history now shows day separators and date-aware timestamps so old auth/network failures are visibly separated from current-day messages.

### Testing
- **Expanded Auth / Workflow Coverage** — added visible regression coverage for waiting-input conversation-target preservation, workflow OpenAI-compatible runtime isolation, workflow execution env shaping, auth-profile-driven session reset even when the selected model stays the same, current-session history recovery, local reply fallback, WhatsApp pairing, chat timeline rendering, and workflow-failure notification deep links.

## [v1.8.8] - 2026-06-17

### Fixed
- **Template / Workflow Communication Hardening** — workflow import now infers shared groups/communities from targeted-agent memberships when explicit channels are omitted, and template validation now warns when workflows target agents outside the intended communication surface.
- **Shipped Template Participation Fixes** — `physics-research-group` and `statistics-research-lab` now include the relevant agents in `Status` so workflow participants are present in the group surfaces they are expected to use.
- **Lighter First-Apply Defaults** — `dev-team`, `support-team`, and `conference-ops-hub` now start with `2` interchangeable worker agents instead of `3`, reducing first-apply cost and noise without changing the underlying workflow structure.
- **Safer Recurring Assistant Automations** — `email-calendar-manager` and `meeting-prep-desk` now keep their first recurring triage/research cycles disabled by default so users opt in after kickoff and context setup.
- **Conservative Parallelism Cleanup** — `clawmax-dev-team` no longer makes PR review wait on issue triage; both can start after kickoff.
- **Dashboard Header Link** — the upper-left `ClawMax.ai` branding now links out to `https://clawmax.ai` so users can reach their account/site context directly.

### Testing
- **Expanded Template Audit Coverage** — added visible regression/audit coverage for targeted-agent communication-surface inference, lightweight interchangeable worker defaults, safer recurring automation defaults in personal assistant templates, and `clawmax-dev-team` PR-review parallelism after kickoff.

## [v1.8.7] - 2026-06-16

### Fixed
- **DocHub / Surface Navigation Hardening** — activity rows, notification artifact links, agent detail files, workflow outputs, organization outputs, and template-apply flows now resolve through the shared DocHub path logic instead of opening raw or ambiguous paths.
- **Workflow Restart Hardening** — workflow-exclusive agent execution now repairs session pointers before retrying takeover conflicts, reducing `EmbeddedAttemptSessionTakeoverError` failures on restart/rerun.
- **Agent Actions Simplification** — agent `...` menus now expose `Skills` directly and move lower-frequency maintain actions into a secondary submenu to keep the primary popup shorter on smaller screens.
- **Provider Lifecycle Guardrails** — verified deprecated/retired first-party OpenAI, Anthropic, and Gemini models now warn clearly, are filtered out of fresh selector choices when replacements exist, and remain visible when already selected so existing agents/configs are not disrupted.

### Testing
- **Expanded Regression Coverage** — added visible helper/validation coverage for workspace DocHub navigation, provider lifecycle handling, non-aggressive `openai-compatible` behavior, and workflow session retry repair.

## [v1.8.5] - 2026-06-14

### Fixed
- **Unique Bare Filename Resolution** — chat, status, and communication surfaces now resolve bare filenames like `show.pdf` only when the workspace target is unique, preventing misleading DocHub opens when multiple files share the same basename.
- **DocHub Artifact Preview Upgrade** — DocHub now previews PDFs and images inline and shows code-oriented assets, including `json`, `jsonl`, `yaml`, and `yml`, with line numbers, language badges, and lightweight syntax highlighting.
- **Cleaner Provider Cooldown/Auth Messaging** — workflow and chat surfaces now explain transient provider cooldowns and hard auth/key failures in clearer operator-facing language instead of surfacing only raw fallback-chain noise.
- **Notification Churn Reduction** — active artifact notifications dedupe by artifact path, channel-activity notifications refresh in place by channel, grouped notification search matches child entity/file text, and hidden tabs stop unnecessary notification polling.
- **Background Fetch Cleanup** — agent metering/cost-limit fetches now stay scoped to the active Agents surface, reducing avoidable background churn while preserving visible data refresh.
- **Plugin Notification Contract Alignment** — plugin contract coverage now explicitly validates artifact-notification dedupe for generated plugin documents so test behavior matches the live notification center contract.

### Testing
- Added or expanded visible regression coverage for:
  - `Workspace file mention helper unit tests`
  - `Communication message helper unit tests`
  - `Docs route unit tests`
  - `Notification presentation helper tests`
  - `Notifications route contract tests`
  - `Plugin system contract unit tests`

### Release Validation
- Validate `1.8.5-test-rc1` on cloud and on-prem before promotion.
- Manual smoke should focus on chat/status file links, PDF/image/code preview in DocHub, notification grouping/dedupe behavior, and clearer provider cooldown/auth messaging.

## [v1.8.4] - 2026-06-13

### Fixed
- **Agent Delete Detail Action Regression** — the agent detail pane once again exposes a working delete action and opens the deletion flow above the detail inspector instead of hiding it behind equal-layer overlays.
- **Bulk Delete Confirmation Visibility** — bulk agent operations now keep the delete confirmation/footer visible inside a stable flex modal layout so destructive confirmation actions do not disappear off-screen on smaller viewports.

### Testing
- Added visible regression coverage for:
  - `Agent delete UI regression tests`

### Release Validation
- Validate `1.8.4-test-rc1` on cloud and on-prem before promotion.
- Manual smoke should focus on single-agent delete from cards, table rows, and the detail pane plus bulk delete confirmation visibility and execution from the floating multi-select toolbar.

## [v1.8.3] - 2026-06-13

### Fixed
- **Add Agent Default Model Resolution** — the Add Agent wizard now respects the actual configured runtime/default model path instead of biasing toward `openai/gpt-5`, so local runtimes and OpenAI-compatible setups remain selected when they are the real preferred path.
- **AI Create Model Override Guard** — AI-generated model suggestions now only replace the current selection when that suggested model is actually advertised by the discovered runtime/provider model list.
- **Provision False Duplicate Regression** — agent provisioning no longer writes generated/template/cloned files into the destination workspace before registration, fixing the false `Agent already exists` error on first-create flows.
- **Cleaner Add-Agent Warning Behavior** — provisioning validation now uses the same BYOK/local-runtime discovery context as the wizard and suppresses noisy fallback warnings for standard OpenAI models when the provider path is clearly available.
- **Model Preference Copy Clarity** — Integrations/BYOK now labels the “new agents” default model separately from the “built-in/system agents” default model so users can tell which setting drives the Add Agent flow.

### Testing
- Added visible regression coverage for:
  - `Add agent default-model helper unit tests`
  - post-registration AI-generated file writes in `Agent doctor route unit tests`
  - BYOK-aware add-agent validation in `Agent doctor route unit tests`
  - provider-aware add-agent warning suppression in `Agent config validation unit tests`

### Release Validation
- Validate `1.8.3-test-rc1` on cloud and on-prem before promotion.
- Manual smoke should focus on Add Agent with hosted, local, and OpenAI-compatible runtime selections; AI create preserving the expected model; clean provisioning without false duplicate errors; and absence of misleading provisioning warnings when the runtime path is valid.

## [v1.8.2] - 2026-06-12

### Added
- **Dormant Plugin Architecture MVP0** — added a host-side plugin contract with runtime discovery, sidebar plugin sections, workspace-scoped plugin storage, shared plugin surfaces, markdown-backed plugin item files, template apply support, and dedicated plugin regression lanes. The shipped host repo includes only dormant test fixtures under `PLUGINS/test`; no customer-facing private plugins are enabled by default.

### Fixed
- **Agents / Workflows Initial Load Dedupe** — reduced redundant initial fetches on Agents and Workflows so workspace activation no longer immediately double-loads the same surface before normal polling takes over.
- **Managed Agent Runtime Assets In DocHub** — non-markdown runtime artifacts created inside managed agent workspaces now appear in DocHub and can be opened from notifications instead of failing with false “file not found” errors.
- **Channel Activity Deep Links** — communication notifications now navigate directly into the target channel chat instead of only switching to the Communications page without opening the referenced conversation.

### Testing
- Added visible regression coverage for:
  - `Agent loading helper unit tests`
  - managed-agent runtime asset visibility in `Workspace DocHub entry filtering`
  - notification presentation channel-target extraction / footer labeling

### Release Validation
- Validate `1.8.2-test-rc1` on cloud and on-prem before promotion.
- Manual smoke should focus on first-open/workspace-switch responsiveness, managed-agent runtime artifact DocHub opens, communication notification deep links, and previously hardened workflow/runtime/partner paths.

## [v1.8.0] - 2026-06-10

### Added
- **Hardening + Simplification Sprint Baseline** — started the `1.8.x` line with a focused stability pass after the fast `1.7.x` partner/runtime release train.
- **Visible Partner Runtime Regression Lane** — added a dedicated full-suite lane covering runtime-managed and workspace-managed Resend/Cognee env propagation, local chat execution when managed partner secrets are present, managed Resend inline dispatch, current-agent file attachments, and benign Cognee warning filtering.
- **Visible Partner Plugin Status Regression Lane** — added a dedicated full-suite lane proving Cognee plugin status transitions from installed to absent to reinstalled, plus safe `unknown` fallback behavior when plugin inspection fails.
- **Doctor Gateway Recovery Surfacing** — agent Doctor responses now include structured gateway recovery status so Logs and Activity modals can show whether a gateway restart/recovery path is available.

### Fixed
- **System Test Workspace Isolation** — integration cleanup now verifies system-test agents, workflows, communities, and groups do not leak into the restored active workspace.
- **Workspace Restore Detection** — system tests now read the active workspace response shape correctly when restoring the original workspace.
- **Gateway Probe Identity** — the dashboard probe now uses an allowed backend/operator identity shape, preventing regressions back to noisy invalid/control-ui gateway handshakes.
- **Partner Runtime Safety** — Resend and Cognee runtime/managed secret paths are now protected by explicit regression coverage before further simplification work.
- **Workflow Runtime Auth Fallback** — workflow execution now falls back to runtime/system provider keys when no user/BYOK key is present, fixing cloud image runs where template/workflow participants failed despite the runtime having valid managed provider auth.
- **Notification/Chat Runtime File Links** — runtime-only references such as `auth-profiles.json` are no longer surfaced as broken DocHub links from notifications or chat messages.
- **Mobile Templates and System & Logs Layouts** — narrow/mobile layouts now wrap action rows, filters, and card metadata instead of clipping controls off-screen on Templates and System & Logs.

### Testing
- Full integration suite baseline: `317/317` passing with `--with-validation`.
- New visible lanes:
  - Doctor gateway recovery route tests
  - Gateway probe handshake tests
  - Partner runtime regression tests
  - Partner plugin status regression tests
  - Workflow execution env regression tests
  - Markdown link helper unit tests

### Release Validation
- Build and validate `1.8.0-test-rc4` images before promotion.
- Manual smoke should focus on the recently hardened paths: workspace-switch/test cleanup safety, Doctor gateway recovery display, workflow/template execution with runtime-managed provider auth, Resend agent email from runtime-managed secrets, Cognee plugin install/uninstall/reinstall status, notification/chat file-link behavior, and mobile Templates/System & Logs layouts on cloud/on-prem images.

## [v1.7.9] - 2026-06-09

### Added
- **Cognee Partner Integration** — added a first-pass Cognee partner surface with Cognee Cloud and self-hosted configuration fields for API key, Base URL, dataset name, and search type, plus direct docs/signup links.
- **Cognee Template Guidance** — template apply can optionally surface Cognee guidance for memory/context workflows without forcing automatic ingestion, plugin install, or skill assignment.
- **Cognee OpenClaw Plugin Installer** — Cognee partner skills now expose the official `@cognee/cognee-openclaw` plugin through an allowlisted dashboard installer that runs `openclaw plugins install @cognee/cognee-openclaw@latest`.
- **Partner Plugin Shell Output** — curated partner plugin install/uninstall actions now open the same green shell-style output modal used by skill requirement installs so operators can see command output and final status.
- **Partner Plugin Uninstall Flow** — curated partner plugins now support uninstall from Skills and Partners/BYOK, with a dashboard confirmation step before removing plugin files/runtime records.

### Fixed
- **Cognee Validation Guard** — explicit Cognee key checks no longer pass with completely empty config; users must provide an API key and/or Base URL before validation reports success.
- **Partner Plugin Action State** — install is disabled when the curated partner plugin is already installed, and uninstall is disabled when it is absent, avoiding avoidable OpenClaw duplicate-install/remove errors.
- **Non-Interactive Plugin Uninstall** — Cognee uninstall now runs through a backend spawn runner that captures stdout/stderr and sends confirmation input so OpenClaw prompts cannot leave the dashboard modal hanging.
- **Partner Plugin Card Layout** — partner plugin action buttons wrap inside narrow Skills cards instead of overflowing the card edge.
- **Runtime Partner Secret Chat Routing** — runtime-injected partner secrets such as cloud/on-prem `RESEND_API_KEY` now count as managed partner secrets for chat execution, forcing local agent/tool execution where those secrets are available instead of routing through a gateway path that cannot see them.
- **Agent Tool Env Forwarding** — `RESEND_API_KEY` is included in the safe child-process environment for first-party agent tools while preserving provider-key filtering.
- **Cognee Plugin Warning Noise** — benign `config.loadConfig()` deprecation output from the Cognee/OpenClaw plugin runtime is stripped from streamed and final chat text so it does not replace the agent response.

### Testing
- Added regression coverage for:
  - Cognee partner definition and visible partner allowlist behavior
  - Cognee config/key validation guardrails
  - Cognee runtime env forwarding into safe child process env
  - curated Cognee plugin install/uninstall command allowlisting
  - partner plugin status detection from `openclaw plugins list --json`
  - partner install/uninstall route execution and confirmation stdin behavior
  - runtime-managed Resend secret detection and forwarding to agent tool subprocesses
  - benign Cognee plugin runtime warning filtering from chat output

### Release Validation
- `1.7.9-test-rc2` passed image validation and is the source image set for the official `1.7.9` promotion.
- **Dev install lifecycle** — from Skills and Partners/BYOK, verify Cognee shows configured status, install opens the green shell output modal, install becomes disabled after success, uninstall becomes enabled, uninstall confirmation appears, uninstall completes, and reinstall works.
- **Cloud install lifecycle** — deploy `1.7.9-test-rc2`, verify Cognee partner config can be saved/validated, install/uninstall output is visible, and button state survives page refresh.
- **On-Prem install lifecycle** — repeat the cloud checks in the containerized on-prem image and confirm plugin commands use the bundled `openclaw` CLI inside the runtime.
- **Single-agent Cognee smoke** — create or choose one agent, enable the Cognee plugin/partner config, run a short chat that should write/recall memory, then inspect chat behavior/logs for Cognee recall/index activity and absence of plugin/config errors.
- **Team/template Cognee smoke** — apply a small multi-agent/team template with Cognee option enabled, run a workflow or group chat, and confirm shared/team context guidance is present while execution still completes without Cognee plugin errors.
- **Regression safety** — confirm Resend partner, Skills search, partner skills browse/import, and normal skill assignment still work after Cognee install/uninstall.

## [v1.7.8] - 2026-06-08

### Fixed
- **Bundled ClawMax Skills** — release images now package the first-party ClawMax helper skills used by templates and partner flows, including `clawmax-resend`, `workspace-ls`, and the new `clawmax-workspace-ls`.
- **Partner Skill Imports** — GitHub/partner-backed skill imports are now idempotent when requested skills are already present instead of failing the whole import with a `400`.
- **Templates Search** — the Templates page search filter is active again and now indexes more nested template metadata, workflow text, and channel names.
- **Workflow Session Stability** — workflow execution now treats `EmbeddedAttemptSessionTakeoverError` as a retriable session conflict and surfaces clearer failure handling when retries are exhausted.
- **Gateway Probe Noise** — the background dashboard probe no longer identifies as `openclaw-control-ui`, reducing noisy `control-ui-insecure-auth` warnings in workflow-heavy logs.
- **Real `clawmax-resend` Runtime Tool Path** — `clawmax-resend` now uses a bundled runtime command (`clawmax-resend-send`) instead of the earlier chat-side interception bridge, keeping agent email sends on the same first-party skill/tool path used by other OpenClaw skills.
- **Resend Attachment Resolution** — protected agent files such as `IDENTITY.md`, `SOUL.md`, `TOOLS.md`, `HEARTBEAT.md`, `USER.md`, and `AGENTS.md` now resolve from the current agent workspace first, and absolute in-workspace attachment paths are accepted correctly.
- **Resend Summary/Attachment Guidance** — resend skill guidance now defaults generated summaries and status updates to inline email bodies, forbids subagent delegation for email sending, and keeps file-send requests attached as source files instead of rewriting or copying them.
- **Rendered Markdown Email Bodies** — the ClawMax Resend HTML wrapper now renders simple markdown structure such as headings, bullet lists, bold text, and inline code into richer HTML for better inbox readability.
- **Runtime-Managed Resend Dispatch** — cloud and on-prem instances with runtime-injected `RESEND_API_KEY` now use the same explicit managed Resend dispatch path as workspace-managed secrets, avoiding model detours through generic message, web, Slack, or SendGrid tools.
- **Workspace Agent Visibility Regression** — agents remain visible in the roster even when extra generated artifacts sit beside `IDENTITY.md`, protecting the `resend-agent` style workspace from disappearing out of the Agents list.

### Testing
- Surfaced new release regression lanes in `SYSTEM/test.sh` for:
  - packaged ClawMax skills
  - workflow session stability
  - gateway probe identity
  - template search
  - ClawMax Resend command behavior
  - workspace agent file visibility

## [v1.7.7] - 2026-06-05

### Resend Partner Follow-Through
- **Partner Import Completeness** — Resend partner imports now materialize the local `clawmax-resend` bridge helper alongside the upstream Resend skill set, so the default ClawMax email-send path is present after the curated partner import flow.
- **On-Prem Recipient Override** — on-prem Resend test email now allows an explicit recipient override like local/dev installs when the deployment is not using OTP-authenticated user identity, instead of incorrectly locking the test recipient to a missing session email.

### Skills Surface Polish
- **Skill Card Title Priority** — skill cards now reserve the top line for the skill name and align the badge/action row more consistently underneath it, reducing header crowding and improving scanability in the grid.

### Container Image Reliability
- **Retry-Hardened npm Installs** — Docker image build stages now retry npm dependency installs instead of failing on the first transient registry/network blip during GH Actions image builds.
- **Stage-Local Docker Shell Directives** — the container build now places shell directives inside valid build stages, fixing the follow-up Dockerfile syntax regression that blocked the first retry-hardened image rerun.

## [v1.7.6] - 2026-06-05

### Resend Cloud and On-Prem Sender Normalization
- **Formatted Sender Env Support** — managed sender env values such as `OTP_FROM_EMAIL`, `SIGNUP_FROM_EMAIL`, and `RESEND_DEFAULT_FROM` can now be provided either as bare emails or already formatted `Name <email>` strings without being re-wrapped into invalid nested Resend `from` payloads.
- **Cloud/On-Prem Test Email Fix** — the dashboard Resend partner test-email path now normalizes runtime-managed sender values before building the outbound request, fixing hosted/on-prem validation failures where the API key was configured but Resend rejected the `from` field format.

## [v1.7.5] - 2026-06-05

### Resend Runtime and Integration State
- **Env-Backed Resend Readiness** — the dashboard integrations API now reports runtime-managed `RESEND_API_KEY` presence even when the key is injected by the deployment environment instead of being re-saved into workspace secrets, so cloud/on-prem Resend surfaces no longer show `Not configured yet` or `Save key first` incorrectly.
- **Managed Secret State Alignment** — integration config responses now align the UI readiness path with the real runtime send path for managed partner secrets, reducing false-negative setup states during hosted/on-prem validation.

### AI Editor and Authoring Consistency
- **Shared `Open AI Editor` Naming** — prompt-driven create/refine flows now use `Open AI Editor` consistently instead of mixing in `Open Full Editor` and other one-off labels for the same popup editor.
- **Workflow Description AI Editor** — the create/edit workflow dialog description field now opens the same full AI editor used on other markdown-capable prompt surfaces, with `Expand with AI`, markdown preview, and an explicit save path back into the dialog instead of a dead-end plain textarea.
- **Workflow Expansion Retry** — unchanged AI prompt expansions now retry server-side with stricter rewrite guidance instead of silently returning the original wording for short seed prompts.
- **Visible No-Change Feedback** — when prompt expansion still produces no effective change, the editor now shows a direct explanation instead of failing silently.

### Chat, Skills, and Template Surface Follow-Through
- **Chat Header Layout Cleanup** — agent and group chat headers now prioritize the title row more cleanly, move secondary actions into a lower control band, and use available space more intentionally instead of clipping labels while leaving dead header space.
- **Skills Search Emphasis** — the Skills filter bar now gives the search input the remaining horizontal space, stronger light/dark focus treatment, and clearer visual priority after the `All / Assigned / Available` filter step.
- **Templates Search Emphasis** — Templates now matches the stronger Skills search treatment with a clearer outline, search icon, and more obvious focus state.
- **Skill Export Actions** — Skills now support `Export .md` from the skill viewer, direct card actions, and selected-skill list actions instead of showing a placeholder “coming soon” state.
- **Skills Tag-Filter Collapse** — the Skills tag-filter rail now defaults to a single-line collapsed presentation with an expand/collapse control, matching the lighter-touch pattern used elsewhere instead of exploding into a wall of tags.
- **Mobile Follow-Through** — the Skills search desktop autofocus no longer auto-pops the software keyboard on mobile/narrow layouts, and the agent chat toolbar compresses more cleanly on smaller widths.

### Workspace Scope and Navigation
- **Workspace-Scoped Budget/Metering Follow-Through** — remaining workflow, agent-detail, and workspace budget reads now consistently scope to the active workspace instead of falling back to unscoped budget/metering endpoints.
- **Workspace Move-to-Top Affordance** — the workspace switcher now exposes a direct `Move to top` control instead of relying only on drag-and-drop reordering, making long workspace lists faster to manage.
- **Faster Communications Workspace Refresh** — Communications now clears stale state and refetches agent/community/group data immediately on workspace change instead of waiting for the next slower refresh path.
- **Global API Rate-Limit Relaxation** — the dashboard’s global API limiter was relaxed for operator/dev flows and now logs the exact endpoint when it trips, reducing false `Too many requests` failures during workspace switching and dense multi-surface reloads.

### Empty States and Create-Action Consistency
- **Starter Actions for Empty Surfaces** — empty Workflows and Communications states now include direct starter actions such as `Create Workflow`, `Import Workflow`, `Create Community`, and `Create Group`.
- **Agents/Workflows Create Menu Alignment** — Agents and Workflows now use the same-height `Create` dropdown pattern with explicit `Create with AI` and `Create with Wizard` paths, matching the broader surface-action consistency work.
- **Skills/Templates AI-First Create Cleanup** — Skills and Templates now use a simplified AI-first `Create` action with duplicate AI-create entries removed from `Actions`.
- **Group-Style Empty State Alignment** — Agents and Workflows empty states now match the iconography and typography rhythm used by Groups instead of drifting into inconsistent empty-state treatments.

### BYOK and New-Agent Reliability
- **Chat Readiness Uses Chat Fallbacks** — agent/group chat readiness now uses the chat-execution access path instead of the AI-generation readiness path, preventing false “no model configured” blockers for new agents under BYOK.
- **Browser-BYOK Model Fallbacks for New Agents** — new agents without an explicit saved model now resolve a chat fallback model from configured browser BYOK providers such as OpenAI, Anthropic, Gemini, or OpenAI-compatible setups.

### Mobile and Skill Metadata Follow-Through
- **Focused Mobile Audit Cleanup** — the current `1.7.5` pass folded the recent mobile/narrow-width fixes into the reusable manual smoke checklist so Builder, DocHub, Agents/dialogs, Workflows, Skills, Partners/BYOK, and Logs all have explicit narrow-width verification steps before release.
- **Skill Tag Derivation for Weak Partner Metadata** — imported and partner-backed skills now derive more useful fallback tags from registry metadata and skill names when upstream tags are sparse, improving filterability without polluting skills that already have curated tags.

### Release Readiness
- **Manual Smoke Additions** — the reusable release smoke checklist now explicitly calls out mobile validation for Skills search behavior plus chat title/action behavior on narrow screens, workspace move-to-top behavior, workspace-scoped budget/metering behavior, and partner-skill tag visibility so the `1.7.5` line has clearer operator test expectations.

## [v1.7.4] - 2026-06-04

### Resend Partner and Agent Email Bridge
- **First-Class `clawmax-resend` Bridge** — added a ClawMax-owned Resend bridge skill so agent email sends no longer depend on raw upstream CLI/template flows for the default product path.
- **Post-Reply Email Delivery** — agent chat can now complete work first and then email the completed reply through the dashboard Resend bridge in the same request, instead of only handling a narrow “send that status” shortcut.
- **Workspace Attachment Support** — explicit workspace file attachments now work through the Resend bridge, including direct paths like `WORKFLOWS/outputs/report.md` and obvious bare filenames like `identity.md`.
- **Agent-Scoped Sender Policy** — bridge-driven agent mail now uses agent-specific sender addresses on the verified Resend domain, making sender identity clearer and easier to trace in inboxes.
- **Bridge Anti-Spam Guardrails** — added first-pass per-agent/per-recipient throttling to reduce accidental repeated sends while keeping the Partner test-email path usable for validation.
- **Confirmation Guidance for Agents** — the shipped `clawmax-resend` skill now tells agents to send immediately when recipient/content/attachments are explicit and to ask one short confirmation only when email intent is ambiguous.

### Deployment and Release Handoff
- **Managed Resend Runtime Contract** — documented the Web/CLI handoff for `RESEND_API_KEY`, `RESEND_DEFAULT_FROM`, `RESEND_DEFAULT_FROM_NAME`, and `RESEND_DEFAULT_REPLY_TO`, including current sender behavior and validation expectations for managed runtimes.
- **Mini-Sprint Cleanup** — archived the completed `1.7.4` Resend implementation line out of the active backlog and reduced the remaining follow-through to sender/domain readiness errors, deliverability guidance, audit/rate-limit UI, and managed recipient policy controls.

## [v1.7.3] - 2026-06-03

### Partner Integrations and Skills
- **Resend Partner Integration** — added a first-cut `Resend` partner integration with server-stored `RESEND_API_KEY` support, curated partner skills, and partner-specific import/browse flows for the official skill catalog.
- **Resend Runtime Follow-Through** — workspace-managed Resend secrets now export to agent child processes as canonical `RESEND_API_KEY`, and Resend-capable agents can fulfill explicit chat email-send requests through the dashboard Resend path instead of tripping OpenClaw embedded session conflicts.
- **Partner Skill Catalog Separation** — Skills now distinguishes `User Skills`, `Partner Skills`, and `Built-in Skills`, with partner-family matching for Resend and Senso-style skill catalogs.
- **Partner Picker UX Cleanup** — partner selection is now opt-in by default, supports category tabs and bulk select/unselect actions, and keeps Opik pinned when the runtime is already configured for it.
- **Partner Logo Normalization** — partner wordmarks such as GitHub, Resend, and Senso now render at more consistent visual sizes across the chooser and skills surfaces.

### Skills Import / Install Reliability
- **Markdown-Only Skill Imports** — GitHub/local skill import now accepts markdown-only `SKILL.md` skills without requiring `index.ts`, and import failures return clearer per-skill reasons.
- **Package-Based Install Detection** — package-installed skills like `react-email` now resolve their actual installed CLI/bin names correctly, so install status can be remembered after refresh/restart.
- **Partner Catalog Import Flow** — catalog-mode partners such as Resend can now expose a direct one-click import path to their upstream GitHub skill repositories.

### Workspace and Surface Follow-Through
- **Workspace Scope / Ordering** — activity and budgeting follow-through is better aligned to the active workspace, and workspace ordering follow-through remains part of the `1.7.x` operator usability pass.
- **Workflow / Builder Follow-Through** — workflow zoom behavior, benign plugin-symlink warning handling, and Builder recommendation routing were tightened further during the `1.7.3` stabilization pass.

## [v1.7.2] - 2026-06-03

### AI Builder and AI Generate
- **GPT-5/OpenAI Generation Hardening** — AI generation now omits unsupported GPT-5 temperature fields, times out stalled generation requests instead of hanging indefinitely, and surfaces friendlier network/DNS failures when the dashboard cannot reach OpenAI.
- **Builder New-Agent Visibility** — Builder now keeps `AI Generate Agent` visibly available for explicit new-agent prompts even when a close agent template exists, and continues honoring direct hints not to use existing templates or existing agents.

### Local Models and Runtime
- **LM Studio Follow-Through** — LM Studio / OpenAI-compatible runtime execution is more robust across provider validation, context-limit guidance, and execution-time compatibility behavior.
- **Gateway Health Cleanup** — healthy gateway runs are reported more consistently in doctor/system surfaces instead of showing misleading warning chips.

### Skills and On-Prem Follow-Through
- **Linux/On-Prem Skill Install Corrections** — dashboard install flows now use more realistic Linux/on-prem install commands for skills like `himalaya` and `nano-pdf`.
- **Constrained Skill Setup Sessions** — setup-heavy skills like `himalaya` can use a constrained in-dashboard interactive setup flow instead of forcing operators out to an external shell.

## [v1.7.1] - 2026-06-02

### Local Model Reliability
- **LM Studio Runtime Hardening** — OpenAI-compatible / LM Studio execution now maps cleanly onto OpenClaw’s `lmstudio` provider contract at runtime, normalizes undersized loaded model instances more safely, and carries a larger default execution context for agent chat.
- **Actionable LM Studio Errors** — local-model context-limit failures now surface a concrete remediation hint instead of only returning the raw `n_keep >= n_ctx` runtime error.
- **Ollama No-Regression Pass** — Ollama-backed agent chat remained green through the local-model execution changes, and status/code blocks are rendered with readable light-mode styling instead of disappearing into black-on-black output.

### Skills and Setup
- **Linux / On-Prem Skill Install Guidance** — dashboard install flows now respect runtime platform when deciding whether built-in skills like `himalaya` are installable from the UI.
- **Interactive Himalaya Setup Session** — `himalaya` now exposes a constrained in-dashboard setup session rather than a dead-end manual warning, allowing operators on cloud/on-prem runtimes to answer the upstream wizard without leaving the product.
- **Skills Flow Polish** — the Skills controls were reordered around `All / Assigned / Available` plus search, and setup states now distinguish guided, interactive, and manual-only flows more explicitly.

### Runtime / Operations
- **Gateway Health Signal Cleanup** — Doctor/System surfaces now avoid false unhealthy gateway badges when the runtime service is actually reachable and healthy.
- **Release Handoff Refresh** — `1.7.1` handoff guidance for CLI/deployment and Web/ops now captures the OpenClaw runtime baseline, local-model env defaults, and the minimum release/deploy smoke path.

## [v1.7.0] - 2026-06-01

### OpenClaw Upgrade
- **OpenClaw `2026.5.26` Baseline** — ClawMax now runs against the newer packaged OpenClaw runtime across the dashboard, CI, and container/image build paths instead of mixing older local, CI, and Docker-era baselines.
- **Packaged Runtime Alignment** — the OpenClaw install/build path now matches the modern Node/PNPM packaging flow used by current upstream OpenClaw releases instead of assuming the older root-level Go CLI layout.
- **Protocol/CLI Compatibility** — Gateway RPC negotiation is updated for the newer OpenClaw runtime contract, packaged skill-root expectations are covered directly, and provisioning/workflow/chat paths consistently use the resolved OpenClaw CLI path.

### Runtime Reliability
- **Gateway Readiness Before Hosted Fallback** — hosted/BYOK chat, workflow execution, and channel-driven agent execution now wait briefly for Gateway readiness before deciding to fall back, reducing false "missing auth" or wrong-path runtime failures during startup.
- **Hosted Chat / Provisioning Hardening** — hosted BYOK chat prefers Gateway when available, agent provisioning uses the same resolved OpenClaw path as the rest of the runtime, and bundled-plugin prep now verifies packaged channel metadata more aggressively.
- **Cross-Environment Consistency** — the same upgrade/runtime logic now applies across local dev, containerized runs, on-prem, and cloud rather than depending on ad hoc local shell state.

### Release Engineering
- **Upgrade Runbook Added** — added a dedicated OpenClaw upgrade runbook documenting where the version is pinned, how to validate the upgrade, and how to keep OpenClaw current on a short release cadence.
- **Release Story Cleanup** — archived the old upgrade-planning posture from the active release docs/backlog and moved the active line forward to `1.7.0` as the first OpenClaw-upgrade release.

## [v1.6.7] - 2026-06-01

### Release Follow-Through
- **CI Shell Test Fix** — GitHub Actions now runs installer/setup/update/uninstall shell tests through `bash`, matching the intended runtime of those wrappers and preventing false failures from `/bin/sh` rejecting `pipefail`.
- **Better Shell Test Failures** — `SYSTEM/test.sh` now prints shell test output for setup/update failures as well, making CI diagnosis faster when one of those wrappers regresses again.

### AI Prompt Editor
- **Resizable Preview Split** — the shared AI prompt editor now supports dragging the divider between the raw prompt and rendered markdown preview on desktop, making it easier to inspect long AI-expanded markdown without changing the default layout.
- **Resettable Preview Width** — double-clicking the divider restores the default preview width for quick recovery after manual resizing.

## [v1.6.6] - 2026-06-01

### OpenClaw Upgrade Readiness
- **Broad Route-Contract Coverage** — every current dashboard server route now has direct contract coverage in the standard test lane, including agents, AI/Builder, channels, chat, docs, integrations, logs, notifications, skills, teams, template registry, templates, workflows, workspace dashboards, and workspaces.
- **OpenClaw/Gateway Contract Suite Expansion** — added explicit regression coverage for CLI resolution precedence and fallback behavior, protected gateway-config persistence, gateway token precedence, workspace registration/layout assumptions, and active-workspace agent resolution when stale duplicate records exist.
- **Workspace Dashboard Route Coverage** — added focused contract coverage for workspace-dashboard token resolution, missing-workspace handling, and the happy-path payload snapshot.

### Installer, Update, and Uninstall Hardening
- **Release Shell Coverage Expansion** — the standard release gate now includes `install.sh`, `setup.sh`, `update.sh`, and `uninstall` shell coverage so bootstrap, handoff, update, and teardown regressions are caught before release.
- **Uninstall Cleanup Reliability** — uninstall now sweeps Podman orphan residue such as leaked `efi-bl-*` and `*-ignition.sock` files and handles privileged packaged artifacts like `/Applications/ClawMax.app` and `/usr/local/bin/clawmax` more cleanly.

### Skills and Runtime Follow-Through
- **Wider Skills Layout** — the Skills surface now uses wide screens better with denser desktop grids instead of leaving large unused margins.
- **Built-In Platform Visibility** — Linux/on-prem/cloud runtimes now hide known macOS-only built-in skills and show more appropriate install guidance for Linux-capable built-ins like `1password`.
- **Registry/Imported Skill Readiness** — registry-installed and imported skills preserve runtime-appropriate setup/install guidance after import, reinforcing the platform-aware filtering added in `1.6.5`.

### Quality
- **Default Suite Growth** — `SYSTEM/test.sh integration` now includes materially broader route, shell, client-flow, and OpenClaw contract coverage, reducing the remaining `1.6.x` risk mostly to manual/browser smoke rather than missing backend regression protection.

## [v1.6.5] - 2026-05-31

### Skills Platform Readiness
- **Platform-Aware Skill Install Guidance** — Skills now surface install/prerequisite guidance for the actual dashboard runtime OS instead of showing macOS-first commands on Linux/on-prem instances.
- **Registry Platform Filtering** — registry suggestions and registry search results now hide skills that are confidently incompatible with the current runtime platform, reducing bad-install dead ends on Linux/on-prem.
- **Linux Install Coverage for Built-In Skills** — Linux-visible install metadata was added or hardened for skills like `himalaya`, and bundled/local/imported skill normalization now follows the same platform-aware path.

### Skills Surface Simplification
- **Canonical Header Controls** — Skills now follows the same shared header control sizing and action pattern as Agents/Templates, including matching `Select`, `Create`, and `Actions` treatment.
- **Action/Icon Consistency** — cleaned up Skills header icons and control spacing so the page matches the canonical Agents surface instead of drifting in button height, iconography, or spacing.

### Client Simplification Follow-Through
- **Workflows / Communications / Organization Simplification** — Workflows, Communications, and Organization now follow the clearer client-console action rhythm introduced in earlier `1.6.x` releases, with simpler header controls, clearer summary labels, and more behavior moved under `Actions` where appropriate.
- **Builder Prompt Handoff Reliability** — Builder-to-agent-generation handoff now reliably carries the original user prompt into `AI Generate Agent`, closing a common “empty wizard” dead-end.

### Quality
- **New Regression Coverage** — added focused client helper coverage for runtime platform filtering and kept the server/client Skills regression suites green alongside typecheck.

## [v1.6.4] - 2026-05-29

### Installer and Setup Reliability
- **Installer Empty-Args Fix** — `install.sh` no longer fails under `set -u` when it hands off to `setup.sh` without passthrough arguments.
- **Non-Interactive Auth Default** — public installer/setup flows now assume `AUTH_MODE=bypass` for non-interactive local installs unless the caller explicitly sets another supported mode.
- **Public Setup Simplification** — the public setup menu now advertises only `bypass` and `email_otp`, removing GitHub OAuth from the default open-source setup path.
- **Regression Coverage** — added focused installer and setup shell coverage so release bootstrap and auth-mode handoff regressions are caught before publishing.

### Builder and Client Console Simplification
- **Builder Prompt Handoff** — Builder recommendations that route to `AI Generate Agent` now carry the original user prompt all the way into the agent-generation wizard instead of opening an empty flow.
- **Builder Routing Hardening** — Builder better distinguishes single-agent vs. team vs. company requests, and improves skill-related follow-through when the named target agent does or does not already exist.
- **Workflow/Communications/Organization Consistency** — Workflows and Communications now follow the same simpler header/action rhythm as Agents, and Organization uses clearer summary labels plus `Actions`-based overview controls with working expand/collapse behavior across the full page.
- **Workspace Tour Follow-Through** — the final `System` tour step now works with the collapsible System nav section and highlights the correct entry during the walkthrough.

## [v1.6.3] - 2026-05-28

### Release Hardening and Installer Reliability
- **GPT-5 Compatibility Retry** — OpenAI GPT-5 generation paths now use `max_completion_tokens` where required and retry once on the exact `max_tokens` compatibility error instead of failing the request outright.
- **Fresh-Install Runtime Hardening** — normalized minimal `openclaw.json` handling, added a shared OpenClaw CLI resolver, improved fallback registration when the CLI is not on `PATH`, and added `update.sh` for local dev installs that need to pull and re-run setup cleanly.
- **Cleaner Runtime Errors** — chat/runtime paths now fail with clearer messages when the OpenClaw CLI is actually unavailable rather than leaking raw spawn errors.

### Client Console Follow-Through
- **Onboarding BYOK/Partners Separation** — onboarding now treats BYOK as its own required setup path and keeps Partner Integrations explicit and optional instead of forcing that step before users can continue into Build.
- **Agent Chat File Links** — chat-generated file links now resolve against real DocHub entries, prefer agent-local documents under `AGENTS/<agent-id>/...`, and avoid surfacing broken `Open` actions when no real file exists.
- **Workspace Header Refresh** — switching workspaces now refreshes the top summary counts immediately instead of showing stale agent totals from the previous workspace.

### Workflow and DocHub Reliability
- **Workflow Output Visibility** — DocHub now renders nested `WORKFLOWS/outputs/**` directories and files correctly so workflow-generated artifacts remain discoverable after execution.
- **Workflow Display Cleanup** — workflow names in cards and DAG views now emphasize the concise step name first while preserving the full imported label on hover when truncated.
- **Template Apply Follow-Through** — workflow channel targeting, parameterized leader resolution, apply-now guardrails, and default-model resolution were tightened so more templates apply cleanly without late runtime surprises.

### Test and Release Validation
- **Deferred Import Timer Cleanup** — non-critical deferred template import follow-through now uses an unref’d timer so heavy template suites finish more cleanly instead of lingering after assertions complete.
- **Release/Test Coverage** — added or surfaced focused coverage for GPT-5 compatibility retry, live GPT-5 smoke, OpenClaw CLI resolution, agent-chat doc resolution, DocHub workflow outputs, and related template/runtime regressions.

## [v1.6.2] - 2026-05-27

### Client Console Simplification
- **AI Builder First-Pass Simplification** — reduced duplicate startup copy, removed low-value session/share clutter from the main header, restored a clear visible reset flow, widened the Builder layout on large screens, improved light-mode readability for transcript controls, and kept the right-side detail/history surfaces progressively disclosed instead of always expanded.
- **Client Navigation Regrouping** — default client navigation now lands on `Builder` and groups the main surfaces into clearer product clusters: `Builder | Organization`, `Agents | Workflows | Communications`, and `Skills | Templates`, with lower-frequency utility pages collapsed under `System`.
- **Templates Surface Cleanup** — simplified the Templates header/actions, added template-type tabs for `All`, `Agents`, `Teams`, and `Companies`, removed workflow templates from the Templates client surface, removed redundant collapse/twisty layers now that tabs handle category navigation, and added `Export TEMPLATE.md` plus resettable search/filter narrowing.
- **Skills Surface Cleanup** — simplified the Skills header into the same `Select | Create | Actions` pattern, moved selected-agent focus inline with the page title, added refresh to the action menu, and introduced matching grid/list view support with a real denser list renderer instead of only stacked cards.
- **Agents Surface Cleanup** — simplified the Agents header, promoted `Create` as the primary action, moved refresh/restart into `Actions`, and reduced visible first-screen control clutter without removing core agent-management capabilities.

### Release Validation
- **Test Harness Output Parsing** — hardened `SYSTEM/test.sh` validation parsing so dotenv or startup noise emitted before JSON validator results no longer causes false failures in `--with-validation` runs.

## [v1.6.1] - 2026-05-26

### On-Prem Runtime Env Fix
- **Runtime Env Values Win in `/api/system`** — fixed dashboard env resolution so on-prem container-injected values such as `DASHBOARD_DEPLOYMENT_KIND=onprem`, `DASHBOARD_INSTANCE_LABEL=On-Prem`, `OPENAI_COMPATIBLE_BASE_URL`, and `OLLAMA_BASE_URL` are honored by `/api/system`, auth config, BYOK defaults, and local-model defaults.
- **Regression Coverage** — added dashboard-env coverage for the exact on-prem Podman runtime env contract reported by the CLI team.

## [v1.6.0] - 2026-05-26

### AI Builder and Onboarding
- **AI Builder Launch Path** — added the Builder-first workspace flow for routing user intent toward existing agents, skills, workflows, agent templates, team templates, or AI generation.
- **Routing Quality Evals** — expanded AI Builder evaluation coverage for single-agent vs. team/team-of-teams intent, existing-agent reuse, workflow follow-through, skill follow-through, template refinement, and create-new template decisions.
- **Prompt Editing Upgrade** — shared AI prompt editors now support expandable markdown editing, improvement direction, file/image context, save-and-generate, resize-safe layout, and a brief success highlight after AI expansion.
- **First-Run Guided Tour** — new workspaces can show a dismissible product tour covering workspaces, Builder, agents, communications, workflows, templates, skills, notifications, and system controls.

### Metering, Diagnostics, and Release Readiness
- **Built-In Agent Metering** — AI Builder and AI generation/improvement surfaces now emit built-in system-agent traces so Activity and Budget can separate product AI usage from user-created agents.
- **Built-In AI Cost Estimates** — built-in AI generation/improvement traces now derive token and cost estimates instead of showing as zero-cost system activity when pricing metadata is available.
- **System Logs Cleanup** — improved dashboard log export/refresh flows and reduced misleading platform-health noise by treating no-skill agents as informational detail instead of default warnings.
- **Builder Reliability Guardrails** — Builder recommendation requests now fall back instead of hanging indefinitely when AI grouping is slow or unavailable.
- **Release Regression Coverage** — surfaced AI Builder routing, prompt attachment, metering, onboarding, and related helper tests through the standard test suite for release validation.

## [v1.5.11] - 2026-05-25

### On-Prem Version Reporting
- **Packaged Version Wins Over Stale Env Version** — `api/system` now prefers the packaged dashboard `package.json` version when it disagrees with an injected `CLAWMAX_VERSION`, preventing healthy newer images from reporting an older on-prem env value like `1.5.4`.
- **Regression Coverage** — added a direct version-resolution test for the stale-env / newer-package mismatch case.

## [v1.5.10] - 2026-05-25

### Image Publish Hardening
- **Registry Smoke Gate** — the container-image workflow now smoke-pulls and runs the published top-level and explicit arch tags from GHCR before the workflow can succeed, so the release path waits for consumer-usable registry artifacts instead of only a green build/publish step.
- **Runtime Version Diagnostics Retained** — dashboard containers continue to log packaged dashboard version and `CLAWMAX_VERSION` on startup and fail fast if live packaged files do not match the image version contract.

## [v1.5.9] - 2026-05-25

### Runtime Diagnostics
- **Fail-Fast Version Mismatch Guard** — the dashboard entrypoint now compares the image `CLAWMAX_VERSION` contract with the live packaged `/app/SYSTEM/dashboard/package.json` version and exits immediately with an explicit error when they diverge.
- **Startup Version Logging** — dashboard containers now log the packaged dashboard version, image `CLAWMAX_VERSION`, `HOME`, and `OPENCLAW_WORKSPACE` on startup so on-prem/runtime issues can be diagnosed from first-line logs instead of inferred from later health-gate failures.
- **Image Publish Verification** — the container-image workflow now runs each per-arch image after build and verifies both the packaged dashboard version and `CLAWMAX_VERSION` before publishing manifest tags.

## [v1.5.8] - 2026-05-24

### Quality and CI Hardening
- **Required CI Lane Unquarantined** — the main CI path now runs the previously quarantined template, dashboard-env, and docker-entrypoint coverage through `SYSTEM/test.sh` instead of letting those suites fail as optional follow-up signals.
- **Secret Readiness Regression Coverage** — added direct client-side regression tests for `ready`, `missing`, and `degraded` local secret states so secret readiness logic stays stable as provider/setup behavior evolves.
- **Registry Install Guidance Hardening** — Tessl and ClawHub registry install failures now return clearer actionable guidance for security-review blockers, missing runtime prerequisites, and packages that do not expose importable skill files.

### Templates and Mobile Audit
- **Template Catalog Guardrails** — shipped organization templates now have catalog-wide tests that ban hidden helper/runtime directory references in workflow content and catch duplicate explicit artifact filenames reused across multiple workflows in the same template.
- **Catalog Audit Snapshot** — documented the first shipped-template audit batch in `SYSTEM/docs/archive/TEMPLATE_CATALOG_AUDIT_2026-05-24.md` so future template additions can follow the same assumptions and checks.
- **Focused Mobile Responsiveness Fixes** — hardened narrow-width behavior for the notifications tray, the BYOK / Partner Integrations modal, and the Apply Agent Template modal so key flows remain usable on tighter screens.

### Docs
- **Runtime Split Investigation Recorded** — added the dashboard 3-container runtime split investigation doc to the architecture set so that operability/scalability follow-up work is tracked as an explicit design reference instead of an open question.

## [v1.5.7] - 2026-05-22

### Emergency Fix — On-Prem Readiness
- **Non-Blocking Startup After Listen** — the dashboard no longer performs synchronous workspace-agent auto-registration immediately inside the server listen callback, which could block the Node event loop right after startup on real on-prem mounted workspaces.
- **Podman Health Gate Recovery** — `/api/health` can now become ready as soon as the server is listening, instead of hanging behind auto-registration work that made `1.5.6` appear started while never satisfying the on-prem readiness gate.
- **Background Startup Services** — workspace-agent auto-registration, scheduler startup, notification monitoring, and Opik initialization now run in a deferred background startup path with explicit error logging rather than delaying initial request handling.

### Quality
- **Hotfix Validation** — validated locally with `npx tsc --noEmit` and `sh ./docker-entrypoint.test.sh` in `SYSTEM/dashboard`.

## [v1.5.6] - 2026-05-21

### BYOK / Local Runtime Follow-Through
- **Explicit Deployment Kind Contract** — the dashboard now understands `local`, `onprem`, and `cloud` deployment kinds explicitly, which makes BYOK/local-provider visibility and defaults much more predictable across native dev, self-managed installs, and hosted runtimes.
- **Cloud vs. On-Prem Local Provider Behavior** — `Ollama` now stays visible for local/native and on-prem runtimes even before a default model is chosen, while cloud hides Ollama by default but keeps `OpenAI-Compatible` available for remote compatible providers.
- **Runtime-Safe Same-Mac Defaults** — on-prem/local-self-hosted guidance and defaults now steer same-Mac LM Studio and Ollama users toward `host.containers.internal` instead of loopback-only URLs that fail from inside the dashboard container.
- **OpenAI-Compatible Model Picker Parity** — OpenAI-compatible endpoints now surface discovered models inline with refresh support and one-click default-model selection, similar to the existing Ollama experience.
- **Saved Local Provider Follow-Through** — saved workspace defaults for `OpenAI-Compatible` and `Ollama` now participate more reliably in AI generate, agent default-model resolution, stale local-model fallback, and runtime execution wrappers.
- **Hosted Model Preservation** — hosted BYOK models such as `openai/gpt-4o-mini` remain selectable and executable even when local discovery returns only Ollama or OpenAI-compatible model lists.

### Agent Runtime Model Correctness
- **Workspace-Local Runtime Models** — agent detail, status, and chat now resolve models from the same active workspace-local runtime configuration instead of drifting across same-name agents in different workspaces.
- **Agent Edit Persistence** — editing an agent model now updates the active OpenClaw runtime config, not only dashboard metadata, so model changes survive refresh/restart and affect chat execution.
- **Direct BYOK Chat Execution** — dashboard chat now uses direct BYOK execution where appropriate instead of attempting a gateway-first path that could emit misleading fallback/auth errors before succeeding.
- **Schema-Valid Temporary Config** — temporary local-model config now includes valid provider model arrays so runtime startup no longer fails with `models.providers.ollama.models` schema errors.

### Template Registry
- **ClawMax.ai Template Registry Browser** — added the first dashboard template registry flow for browsing/searching canonical templates and community submissions from ClawMax.ai.
- **Registry Import to Local Templates** — registry templates can be added into local templates before application, with duplicate detection so already-local templates cannot be re-added accidentally.
- **Trusted Registry Write Contract** — dashboard registry calls now support `TEMPLATE_REGISTRY_REMOTE_URL` for browse/write traffic and `TEMPLATE_REGISTRY_WRITE_TOKEN` for authenticated share/rate actions when product/web provides a signed short-lived token.

### Release Distribution
- **Public tar.gz Release Packages** — tagged releases publish `clawmax-vX.Y.Z.tar.gz`, `clawmax-vX.Y.Z.sha256`, and `install.sh` assets for the curl installer path.
- **Pinned Curl Install Docs** — README and release distribution docs now show the `v1.5.6` pinned installer flow for users who do not want GitHub CLI, GitHub login, or a pre-existing local clone.

### Quality
- **Regression Coverage** — added/expanded `server/lib/dashboard-env.test.ts`, `server/lib/agent-default-model.test.ts`, `server/lib/ai-generator.test.ts`, `server/lib/agent-execution.test.ts`, `server/lib/model-discovery.test.ts`, `server/lib/template-registry.test.ts`, `server/routes/chat.test.ts`, and `client/src/lib/byok.test.ts` to cover deployment-kind behavior, local-provider defaults, registry import behavior, model persistence, and local-model fallback handling.
- **Validation Gate** — validated locally with focused chat/model/runtime suites, `npx tsc --noEmit`, `git diff --check`, and the full `SYSTEM/test.sh` suite.

## [v1.5.5] - 2026-05-20

### Release — OpenAI-Compatible Local LLMs and BYOK Clarity
- **OpenAI-Compatible Provider** — added a first-class `OpenAI-Compatible` BYOK provider for LM Studio and other OpenAI-style APIs that expose `/v1/models` and `/v1/chat/completions`, with support for configurable base URL, optional API key, and optional default model.
- **Discovered Compatible Models** — models discovered from OpenAI-compatible endpoints now appear as a distinct provider family instead of being confused with official OpenAI-hosted models, making local/self-hosted model selection materially clearer.
- **AI Generate and Prompt Expansion Support** — agent/template/workflow/skill AI-generate paths and shared prompt expansion now carry OpenAI-compatible provider configuration end to end, so local/self-hosted compatible models can be used for those flows too.
- **Hosted vs. Local / Self-Hosted BYOK Layout** — the BYOK provider chooser is now grouped into `Hosted` and `Local / Self-Hosted`, separating official hosted APIs from self-managed runtimes like Ollama and OpenAI-compatible endpoints.
- **Instance-Aware Browser Tab Title** — `DASHBOARD_INSTANCE_LABEL` now affects the browser tab title as well as the sidebar, rendering values like `ClawMax · Dev`, `ClawMax · Cloud`, or `ClawMax · On-Prem` for faster multi-instance recognition.
- **Softer OpenAI Key Validation** — OpenAI key validation is less brittle when a specific probe model is unavailable, surfacing that case as a warning when the key still appears otherwise usable instead of hard-failing the whole key check.
- **Release tarball installer** — tagged releases now publish versioned `clawmax-vX.Y.Z.tar.gz` plus SHA-256 checksum assets, alongside a public `install.sh` bootstrapper that can download a pinned or latest release, verify it, extract it, and then continue into the normal `setup.sh` flow without requiring `gh` or a pre-existing local clone.

### Quality
- **Validation Gate** — validated locally with `client/src/lib/byok.test.ts`, `server/lib/integration-validation.test.ts`, `server/lib/model-discovery.test.ts`, and `npx tsc --noEmit`.

## [v1.5.4] - 2026-05-19

### Release — Agent Template Create Hardening
- **Catalog-Wide Agent Template Resolution** — Add Agent now resolves agent templates by real directory slug, `*-template` aliases, and human-facing display-name slugs, so user selections like `Software Engineer` no longer fail just because the on-disk directory is named differently.
- **Template-Backed Create Reliability** — agent-template provisioning is now hardened across the whole shipped agent template catalog instead of only the first few reported regressions, which closes the recurring `Template "... was not found"` failures seen from the Add Agent wizard.
- **Plain / AI / Template Create Cohesion** — the current agent-creation line now consistently covers plain create, AI-generate create, and create-from-template, with better post-provision visibility and stronger final-step recovery paths.

### Quality
- **Catalog Audit Coverage** — added regression coverage proving every shipped agent template validates through the same human-facing display slug path used by the Add Agent UI.
- **Validation Gate** — validated locally with `server/lib/agent-config-validation.test.ts`, `server/lib/templates.test.ts`, `npx tsc --noEmit`, and the previously added seeded-agent/list-visibility coverage already surfaced in `SYSTEM/test.sh`.

## [v1.5.3] - 2026-05-19

### Release — Agent Creation Regression Fixes
- **Template Selection Recovery** — Add Agent now accepts logical agent template ids like `people-researcher` and `test-agent` even when the on-disk template directory uses the `*-template` suffix, closing the `Template "... was not found"` regression reported after `1.5.2`.
- **Plain Create Agent Reliability** — plain agent creation now seeds minimal managed workspace files when needed so a newly provisioned agent becomes a real agent immediately instead of appearing only as a deletable Documents directory.
- **Immediate Agent Visibility** — post-provision list refresh is more defensive and no longer depends on a fragile first fetch timing window, so newly created agents stay visible in the Agents page right after create.
- **Wizard Recovery Actions** — the final validation step now gives direct recovery actions such as `Change Name` for duplicate agent names and `Back to Identity` for template/source/model problems.

### Quality
- **Regression Coverage** — added focused coverage for plain created agent workspace seeding plus server-side alias validation/import handling for logical template ids mapped to `*-template` directories.
- **Validation Gate** — validated locally with `server/lib/workspace-agent-files.test.ts`, `server/lib/agent-config-validation.test.ts`, `server/lib/templates.test.ts`, `client/src/lib/agentList.test.ts`, `npx tsc --noEmit`, and shell validation of `SYSTEM/test.sh`.

## [v1.5.2] - 2026-05-19

### Release — Setup Simplification, Create-Agent Reliability, and Chat Cleanup
- **Lower-Friction Setup** — `setup.sh` no longer asks for provider API keys or GitHub OAuth credentials during setup. OpenClaw is installed as part of setup when missing, partner integrations default to opt-in, and generated `.env` values now keep shared hosted/provider credentials as later placeholders instead of setup-time blockers.
- **Quick Start Alignment** — the README Quick Start now matches the actual supported flow: install with `./setup.sh`, boot the dashboard, and configure keys later in `BYOK` or `Keys & Secrets` rather than requiring up-front provider configuration.
- **Create-Agent Hardening** — the Add Agent wizard now preserves exact backend template slugs, validates more aggressively before final provision, and returns friendlier guidance for missing templates, clone sources, and model-selection problems instead of opaque late-stage failures.
- **Immediate Agent Visibility** — agents created through both normal create and AI-generate paths now surface in the Agents page immediately after successful provisioning instead of waiting on background polling, stale pagination, or the final wizard close timing.
- **Cleaner Agent Chat Output** — live chat and persisted history now strip raw tool-call payloads, runtime metadata, session dumps, file-artifact listings, and related JSON noise much more aggressively, so newly created agents do not greet users with internal OpenClaw transcript debris.
- **Maintenance Banner State Model** — scheduled maintenance now derives forward from time and maintenance-window settings so stale “planned/scheduled” banners clear automatically once a window is in the past without relying on an external env update at the exact boundary.
- **Host-Agent Reconnect / Unreachable Surfacing** — the dashboard now reads the canonical local host-agent state contract and surfaces reconnect-required, unreachable/stale, and degraded local runtime conditions directly in the UI instead of relying only on workspace agent status.
- **Split-Container Gateway Support** — dashboard health, logs, chat, and gateway RPC now support explicit non-loopback gateway routing through `OPENCLAW_GATEWAY_URL`, improving split-container and host-bridge deployments tracked in issue `#144`.

### Quality
- **Regression Coverage** — added focused helper coverage for immediate created-agent list visibility and extended chat normalization coverage with transcript-shaped runtime/tool/session dump cases
- **Validation Gate** — validated locally with `client/src/lib/agentList.test.ts`, `client/src/lib/agentTemplateOptions.test.ts`, `server/lib/chat-normalization.test.ts`, `npx tsc --noEmit`, and shell validation of `SYSTEM/test.sh` and `setup.sh`

## [v1.5.1] - 2026-05-18

### Release — Shared AI Prompt Editor, Prompt Expansion, and Author Attribution
- **Shared AI Prompt Editor** — templates, agents, workflows, and skills now all use the same full-screen `Edit AI Prompt` flow, so advanced prompt editing is no longer a template-only capability
- **Prompt Expansion With AI** — the shared editor now supports `Expand with AI`, which can expand a short user idea into a more structured generation prompt before the user saves or generates
- **Markdown-First Prompt Authoring** — prompt expansion defaults to markdown output, with plain-text output available when users want a lighter prompt format
- **Collapsible Prompt Preview** — the full editor now includes a collapsible side preview for markdown-style prompts, so users can inspect rendered structure without permanently giving up editor space
- **Logged-In User Author Attribution** — AI-generated templates and workflows now stamp the logged-in dashboard user as `author` when available instead of falling back to generic system labels
- **Workflow/Popup Icon Cleanup** — remaining workflow detail archive/execution actions and related popup surfaces now follow the shared product icon system rather than old emoji-style glyphs
- **Workspace Switch Responsiveness** — workspace activation now returns faster and mounted pages reset more cleanly when the active workspace changes, reducing cases where a manual browser refresh was required to see the new workspace state

### Quality
- **Regression Coverage** — expanded `ai-generator` coverage for prompt expansion and author attribution behavior
- **Validation Gate** — validated locally with `server/lib/ai-generator.test.ts`, `npx tsc --noEmit`, and shell validation of `SYSTEM/test.sh`

## [v1.5.0] - 2026-05-17

### Release — Product Icon System, Local Metering Recovery, and View Consistency
- **Product Icon System Rollout** — the dashboard now replaces the old emoji-style primary chrome with the shared product icon system across the left rail, action menus, templates, skills, organization, communications, activity, and major agent detail/chat surfaces. Skills and templates now prefer metadata-driven product icons first, with emoji only as compatibility fallback.
- **Skills and Templates Visual Consistency** — skill cards, skill viewer actions, template cards, template section headers, category chips, and registry/install surfaces now follow the same icon-cell treatment so built-in and imported items read in one consistent ClawMax visual language.
- **View Toggle Normalization** — grid/list/detail-style toggle semantics are being standardized across dashboard tabs, with `list` consistently placed as the rightmost option and clearer separation between compact grid views and richer document/detail-style views.
- **Documents Tab Persistence** — the Documents page now stays mounted like the other persistent tabs, so switching away and back preserves the current document context instead of resetting the page.
- **Local Metering Recovery** — local direct agent chat now reads token and cost metadata from persisted OpenClaw session transcripts and records real Opik trace usage instead of logging zero-token / `$0.00` chat calls in Activity & Budget.

### Quality
- **Regression Coverage** — added focused runtime coverage for recovering assistant usage metadata from persisted agent session files, and surfaced the new product-icon helper coverage in the dashboard test harness.
- **Validation Gate** — validated locally with `server/lib/agent-execution.test.ts`, `npx tsc --noEmit`, and shell validation of `SYSTEM/test.sh`.

## [v1.4.9] - 2026-05-17

### Release — Skills, Session Persistence, and Opik Runtime Alignment
- **Persistent Agent Chat Reopen** — dashboard chat now reuses stable agent-scoped session ids, resolves mapped runtime session files more defensively, and falls back to the newest persisted session file when needed, so reopening agent chat preserves history much more reliably across agents and restarts
- **Skill Setup and Safety UX** — skills now separate machine requirements from auth/setup readiness, auto-detect setup-needed states for shipped skills, audit newly added skills for setup needs across registry/GitHub/local/AI/partner install paths, and surface local dashboard Terms of Service plus external-risk reminders anywhere users import skills, install requirements, run setup flows, or import agents
- **Requirements and Setup Guidance** — requirement status is now explicit (`Requirements installed` vs. `Install Requirements`), brew-backed skill requirements can be installed from the dashboard, setup-needed skills show clearer warning states, and guided setup flows are metadata-driven instead of hardcoded to one skill
- **Skill Management Improvements** — user skills remain editable after save, built-in edits create editable workspace copies, imported skills can now update tags directly from the Skills viewer, and the Skills page supports explicit tag filtering plus richer imported registry metadata such as provider/source provenance, install name, version, downloads, categories, and homepage details
- **Registry and Discovery Improvements** — ClawHub is now the first/default registry in the dashboard, partner installers are collapsible, registry cards show approximate catalog sizes, and imported registry skills preserve more display metadata instead of collapsing down to only provider/name
- **Skill Runtime Reliability** — agent skill assignment now tolerates stale missing skills as warnings instead of blockers, refreshes agent TOOLS context and session caches after updates, syncs external-workspace agents correctly, and runs chat with the matched agent workspace so skill-aware agents like external-workspace `jarvis` use the right runtime context
- **On-Prem / Opik Runtime Alignment** — Opik tracing and metering now honor workspace-stored Opik workspace/project settings when env does not override them, while `setup.sh` no longer silently defaults auth mode or Opik project names during open-source setup
- **Dashboard State and BYOK Polish** — agent/template/skills tab state now persists across tab switches, BYOK provider checks are more trustworthy and verified-state aware, and managed on-prem Ollama BYOK/runtime behavior remains aligned with the runtime-provided host bridge URL

### Quality
- **Regression Coverage** — added focused coverage for agent chat session persistence, Opik runtime config resolution, imported registry metadata preservation, and new skill-tag helper behavior
- **Validation Gate** — validated locally with targeted `skills.test.ts`, `skill-registry.test.ts`, `skillTags.test.ts`, `opik.test.ts`, `agentChatSession.test.ts`, `agent-execution.test.ts`, `npx tsc --noEmit`, plus shell validation for `setup.sh` and `SYSTEM/test.sh`

## [v1.4.8] - 2026-05-13

### Release — Managed On-Prem Ollama BYOK Fixes
- **Managed On-Prem Ollama URL Preference** — the BYOK wizard now prefers the runtime-provided `defaultOllamaBaseUrl` over stale browser-local `localhost` values when `managedRuntime=true`, which fixes validation and model discovery on Podman-based on-prem installs where the dashboard container must reach Ollama through `host.containers.internal`
- **Consistent Effective Ollama URL Usage** — the same resolved runtime-aware Ollama URL is now used for initial field hydration, runtime validation, model discovery, and persisted workspace integration defaults
- **Custom Override Preservation** — explicit non-local user overrides still win, so operators can point a managed runtime at a deliberate remote or non-default Ollama endpoint without the dashboard rewriting it
- **BYOK Models-Step Layout Cleanup** — the models step now removes the duplicate provider selector row and collapses redundant intro/status sections so the provider cards begin higher without the large blank gap

### Quality
- **Regression Coverage** — added BYOK helper coverage to prove managed on-prem resolves `host.containers.internal` over stale loopback defaults while preserving explicit non-local overrides
- **Validation Gate** — validated locally with `client/src/lib/byok.test.ts` and `npx tsc --noEmit`

## [v1.4.7] - 2026-05-12

### Release — On-Prem Identity Isolation and Runtime Visibility Cleanup
- **On-Prem Metering Identity Isolation** — Opik traces now include `instance_key`, `machine_id`, and `machine_name`, and the dashboard now scopes budget/metering viewer matching by runtime identity instead of relying only on generic dashboard hostname or loopback-style instance ids
- **Safer Shared-Hostname Behavior** — on-prem Macs and local runtimes that previously shared a common hostname like `clawmax` now stay isolated in metering and budget views when the runtime provides unique machine/instance identity
- **Gateway Health Requires Authenticated Success** — the dashboard health path now treats gateway health as green only when authenticated gateway access succeeds, preventing false-green platform health when the port is open but the token/runtime contract is broken
- **Conservative On-Prem Ollama UI** — Ollama-specific BYOK/UI surfaces now appear only when the runtime reports both `ollamaEnabled=true` and a non-empty `defaultOllamaBaseUrl`, matching the intended on-prem contract more closely
- **System Identity Surfacing** — `/api/system` now exposes runtime machine identity and the dashboard prefers `machineName` over raw hostname in top-level status UI where available

### Quality
- **Regression Coverage** — added focused metering tests for shared-hostname on-prem traces with differing `instance_key` / `machine_id` identities
- **Validation Gate** — validated locally with `server/lib/metering.test.ts`, `client/src/lib/byok.test.ts`, and `npx tsc --noEmit`

## [v1.4.6] - 2026-05-10

### Release — Model Default Safety and BYOK Validation Hardening
- **Default Model Enforcement** — manual agent create, single-agent template apply, and org/team template apply now all require a resolvable concrete model, using the shared fallback chain of explicit override, workspace preferred model, template model, on-prem Ollama default, and provider-backed recommended model
- **Legacy Unknown Model Hardening** — stale `model: "unknown"` records are now treated as missing in agent live configuration and execution resolution, with active-workspace records preferred when duplicate agent ids exist across workspaces
- **Broken-Agent Guardrail** — when an agent truly has no usable model, chat now fails with a direct “choose a model” instruction instead of falling through into opaque runtime failures
- **BYOK Provider Mismatch Protection** — obvious wrong-provider key swaps are now rejected before save and before validation, covering BYOK and Keys & Secrets flows
- **Per-Provider Key Checks** — model-provider validation in BYOK now runs one provider at a time, with empty fields failing correctly and provider cards staying `configured` until a real successful `Check Key` marks them `verified`

### Quality
- **Regression Coverage** — added shared default-model tests and extended workspace/live-config tests to cover active-workspace collisions plus stale `unknown` model fallback handling
- **Validation Gate** — validated locally with `server/lib/agent-default-model.test.ts`, `server/lib/templates.test.ts`, `server/lib/workspace-upload.test.ts`, `server/lib/agent-execution.test.ts`, `client/src/lib/byok.test.ts`, `server/lib/integration-validation.test.ts`, and `npx tsc --noEmit`

## [v1.4.5] - 2026-05-10

### Release — On-Prem Runtime Contract and Template Apply Guardrails
- **Template Apply Guardrails** — agent and organization template apply flows now block early when the dashboard cannot resolve a viable chat execution path or default model, instead of creating agents that will fail on first chat
- **Embedded Gateway Health Alignment** — healthy on-prem embedded gateway runtimes now keep idle and freshly created agents marked `online`, avoiding misleading degraded/offline state when the runtime itself is healthy
- **On-Prem Ollama Contract** — dashboard-side execution checks now honor the existing non-managed default Ollama contract, so on-prem installs no longer behave as if Ollama were disabled by default

### Quality
- **Regression Coverage** — added client-side BYOK coverage for on-prem default Ollama execution readiness and added a focused workspace-status regression for healthy embedded gateway + idle agent state
- **Validation Gate** — validated locally with `client/src/lib/byok.test.ts`, `server/lib/workspace-status.test.ts`, `npx tsc --noEmit`, and `bash -n SYSTEM/test.sh`

## [v1.4.4] - 2026-05-09

### Release — Container Runtime Cleanup and Organization View Consistency
- **Container Build Hardening** — the dashboard Docker builder and runtime dependency install steps now use `--legacy-peer-deps`, matching the already-hardened OpenClaw builder path and unblocking clean `docker compose build` runs from a fresh checkout
- **Gateway Watchdog Runtime Fix** — the container entrypoint now falls back to a Node-based localhost TCP probe when `ss` and `netstat` are unavailable in the slim runtime image, preventing false “gateway down” watchdog restart attempts every 30 seconds
- **Organization View Default** — the Organization page now defaults to the org-chart view and places that view first in the toggle, aligning its primary visualization behavior with Workflows defaulting to DAG first

### Quality
- **Regression Coverage** — extended `SYSTEM/dashboard/docker-entrypoint.test.sh` to exercise the no-`ss`/no-`netstat` runtime path directly and extended `SYSTEM/dockerfile-openclaw-builder.test.sh` to cover the dashboard Docker install commands
- **Validation Gate** — validated locally with `sh SYSTEM/dashboard/docker-entrypoint.test.sh`, `sh SYSTEM/dockerfile-openclaw-builder.test.sh`, `cd SYSTEM/dashboard && npx tsc --noEmit`, and `bash -n SYSTEM/test.sh`

## [v1.4.3] - 2026-05-08

### Release — Template-Created Agent Runtime Fix
- **Cloud Template-Agent Chat Fix** — agents created from agent templates now receive the full runtime scaffolding expected by OpenClaw chat execution, including `config.yaml` and `sessions/` under `~/.openclaw/agents/<id>/`, not just workspace files and auth profiles
- **Template Path Parity** — single-agent and organization/template-created agents now use the same runtime-ready bootstrap shape as agents created through the normal dashboard creation paths

### Quality
- **Validation Gate** — validated locally with `server/lib/templates.test.ts` plus `npx tsc --noEmit`

## [v1.4.2] - 2026-05-08

### Release — Container Packaging Fix
- **OpenClaw Docker Builder Hardening** — the Docker OpenClaw builder stage now installs dependencies with lifecycle `prepare` hooks disabled, which avoids clean-room container build failures from transitive git-hosted packages such as `@tloncorp/api`
- **CLI/Cloud Publish Unblock** — this keeps the pinned OpenClaw packaging path intact while unblocking `clawmax-cli` image publication from an immutable release tag for cloud/on-prem environments

### Quality
- **Validation Gate** — validated locally with the targeted Docker builder smoke check in `SYSTEM/dockerfile-openclaw-builder.test.sh`

## [v1.4.1] - 2026-05-08

### Release — Skills, Registry Discovery, and Template Friction Reduction
- **Skills UX Overhaul** — the Skills page now supports clearer agent context, compact icon-only card actions, user-vs-built-in sections, bulk selection with workflow-style action bars, per-card and bulk deletion for user skills, and delete confirmations that explain assignment impact before removal
- **Skill Editing and Ownership** — editing a built-in skill now creates a workspace copy instead of mutating the built-in source, and imported/modified skills surface clearer source labels such as `Workspace`, `Workspace Copy`, `Shipables`, and `Tessl`
- **Skill Viewer and Layout Polish** — skill cards reclaim description space outside selection mode, the viewer/modal scroll behavior is fixed for long skills, and inline registry suggestions now use full available width when shown without a neighboring close-match card
- **Registry Expansion** — the Skills registry now supports both Shipables and Tessl providers, inline search suggestions query both registries, registry installs can reinstall/override an existing user skill, and imported registry skills appear correctly under `User Skills`
- **Tessl Registry (Experimental)** — Tessl support is now available as an exploratory/experimental feature for OpenClaw workspaces; the dashboard dedupes result shapes, resolves qualified tile names, imports nested tile skills, and surfaces Tessl security-review blockers more clearly, but some Tessl tiles still require manual Tessl-side approval or use formats that need further validation
- **Recurring Template Apply Friction** — `chief-of-staff`, `email-calendar-manager`, `meeting-capture-follow-up`, `personal-research-desk`, `family-ops-hub`, `market-signal-desk`, and `tax-planning-desk` now avoid blocking apply on day-of/run-time inputs and use cleaner human-readable defaults instead of raw placeholder-style values
- **Single-Agent Template Runtime Registration** — single-agent template apply now registers the created agent in active OpenClaw config and creates the expected auth/runtime profile so brand-new agent templates can chat immediately after deploy
- **Multi-Agent Communication Feedback** — bulk chat and group chat typing indicators now persist per-agent until each responding agent actually replies, instead of disappearing for the whole group too early
- **Visual Cleanup** — the login hero image was replaced with safer ClawMax artwork

### Quality
- **Validation Gate** — locally validated on the current line with green `SYSTEM/test-with-server.sh`, `npx tsc --noEmit`, and focused regressions across skill selection/deletion, communication indicators, template customization, registry import flows, and agent-template registration

## [v1.4.0] - 2026-05-07

### Release — Product, Runtime, and Release Hardening
- **Company and Dashboard Flows** — the `1.4.0` line now includes company-aware template/org/dashboard work from the build-a-company push, including richer company workflows, handoff-oriented outputs, and safer company dashboard rendering paths
- **Workflow Scheduling Correctness** — workflow timezones now persist and drive next-run previews, in-process cron execution, AI cron generation context, and gateway cron sync with explicit timezone handling
- **Gateway Runtime Reliability** — gateway fallback execution, token resolution, cron registration, and container startup paths were hardened so local and hosted flows use the intended execution path more consistently
- **Provider Runtime Compatibility** — Gemini now uses the correct `google/*` provider ids, Ollama local runs seed compatible provider config automatically, and scheduled workflows can intentionally use system keys when allowed
- **Metering Stability and Performance** — local metering now survives dashboard URL/port changes, server-side metering results are cached/merged monotonically, and Budget & Metering no longer blanks on each tab switch
- **Dashboard UX Improvements** — agent-card overflow actions are more visible, agent cards now support quick budget editing with workspace budget context, waiting-for-input notifications are clearer, communication chat refresh flicker is reduced, and Skills now supports reverse assignment from a selected skill
- **Template/Workflow Polish** — event-planning templates now request richer kickoff inputs and produce more concrete markdown deliverables across downstream workflows
- **Release/Test Hardening** — `SYSTEM/test-with-server.sh` auto-starts the dashboard reliably, startup no longer shell-sources `.env`, and Docker smoke tests now run through stable absolute paths in the system suite

### Quality
- **Validation Gate** — validated on the current line with green `SYSTEM/test-with-server.sh` default-safe coverage (`72 passed, 0 failed`), targeted TypeScript/test-suite checks, and focused regressions for metering, gateway runtime paths, scheduler timezone behavior, communication caching, skill assignment, and template audits

## [v1.3.17] - 2026-04-24

### Fixes — Clean-Room Setup and Runtime Contention Hardening
- **Clean-Room Setup Validation** — added a repeatable fresh-home setup contract test plus a Podman clean-room harness to validate `setup.sh`, `SYSTEM/start.sh`, and `SYSTEM/test.sh` against a fresh copied-repo bootstrap path
- **Setup Contract Alignment** — `setup.sh` now writes the canonical dashboard token where the server and tests already expect it, preserves the legacy workspace token copy for compatibility, quotes OTP subject output safely for shell sourcing, and correctly propagates non-default dashboard ports/URLs into generated `.env`
- **Startup/Test Handoff Reliability** — `SYSTEM/start.sh` now uses sturdier detached background process startup for scripted flows, and `SYSTEM/test.sh` gives a fresh dashboard a short health-check retry window instead of failing immediately
- **Shared Agent Execution Serialization** — same-agent execution is now serialized across workflow runs, dashboard chat, and channel/group execution paths instead of only inside the workflow engine, reducing remaining `session file locked` failures when multiple runtime paths touch the same OpenClaw agent
- **Shared Session-Lock Retry Path** — OpenClaw session-lock detection and bounded backoff now live in shared agent-execution code so all runtime entrypoints use the same recovery behavior

### Quality
- **Clean-Room Coverage** — added `SYSTEM/scripts/setup-contract-test.sh` and documented the heavier `SYSTEM/scripts/cleanroom-podman-setup-test.sh` harness
- **Runtime Contention Regression Coverage** — added focused agent-execution tests for shared lock detection, retry backoff, and same-agent serialization behavior
- **Validation Gate** — validated locally with `./SYSTEM/scripts/setup-contract-test.sh`, a fresh-home copied-repo `setup.sh -> SYSTEM/start.sh --restart -> SYSTEM/test.sh` run (`56 passed, 0 failed`), `npm run typecheck`, and `server/lib/agent-execution.test.ts`

## [v1.3.16] - 2026-04-23

### Fixes — Maintenance Status Banner Hardening
- **Robust Instance Resolution** — maintenance/status banner lookup is now more resilient when explicit instance-key configuration is missing
- **Request-Host Fallback** — dashboard status resolution can now infer the instance from the incoming request host before falling back to static dashboard URL configuration
- **Safer Status Mapping** — active scheduled maintenance now resolves more reliably into the dashboard banner path instead of dropping out early when one source of instance metadata is absent

### Quality
- **Live-Failure Regression Coverage** — added focused server-side coverage for the missing-instance-key path so request-host fallback is exercised directly
- **Validation Gate** — validated locally with `npm run typecheck` and `server/lib/cloud-maintenance-status.test.ts`

## [v1.3.15] - 2026-04-23

### Fixes — Dynamic Maintenance Banner Source
- **Dynamic Banner Source Support** — dashboard maintenance banners can now resolve from a dynamic status source instead of relying only on static environment configuration
- **Scheduled Pre-Window Visibility** — `scheduled` maintenance now renders before the start window instead of remaining hidden until `START_AT` has already passed
- **Fallback Env Compatibility** — environment variables remain available as a fallback maintenance-banner path
- **Safer Inactive-State Handling** — inactive maintenance state no longer renders a banner accidentally
- **Lightweight Banner Caching** — dashboard banner resolution now uses a small cache/inflight debounce to avoid excessive repeated lookups

### Quality
- **Coverage** — added focused server-side coverage for runtime maintenance status resolution and fallback behavior
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/dashboard-env.test.ts`, `server/lib/cloud-maintenance-status.test.ts`, and `bash -n SYSTEM/test.sh`

## [v1.3.14] - 2026-04-22

### Improvements — Workflow Artifact Attribution and Diagnostics
- **Writer-Attributed Artifact Notifications** — workflow-created file notifications now prefer the real participant/agent identity when the workflow runner can resolve the produced workspace file paths from agent output
- **Generic Fallback Suppression** — once a workflow emits a writer-attributed artifact notification, the later filesystem scan suppresses the duplicate generic `agents updated ...` artifact notification for the same file
- **Bare Filename Resolution** — artifact attribution now handles common workflow reports that mention only bare filenames like `kickoff-plan.md` by resolving them to a unique recent workspace artifact when possible
- **Gateway Instability Diagnostics** — the dashboard now detects and surfaces concrete gateway restart-loop and session-drift patterns in the agent status UI instead of only vague auth/unavailable wording

### Improvements — Activity, Communications, and Operator UX
- **Activity & Budget Activation Refresh** — switching back to `Activity & Budget` now refreshes activity feed, metering, budget, and agent cost limits automatically with a short cooldown to avoid churn
- **Communications Bulk History Clear** — selection mode now supports bulk clear-history for communities/groups using the existing archive-first message-clear backend path
- **Communications Endpoint Alignment** — dashboard reads for communities and groups now use the current `/api/communities` and `/api/groups` routes instead of stale `/api/channels/*` paths
- **Generic Maintenance Banner Contract** — dashboard now supports a default-off OSS-safe maintenance banner driven by environment variables (`MAINTENANCE_BANNER_ENABLED`, `TEXT`, `LEVEL`, `START_AT`, `END_AT`, optional `LINK`, and `DISMISSIBLE`)
- **Session-Scoped Maintenance Dismissal** — dismissing a maintenance banner now hides it only for the current page session; refreshing the dashboard shows the active notice again
- **Read-Only Default Test Runner** — plain `SYSTEM/test.sh` now avoids workspace switching and live dashboard mutations; destructive/live dashboard checks remain under `SYSTEM/test.sh integration`

### Fixes — Dashboard Runtime Behavior
- **Dev/Prod Static Serving Separation** — the dashboard server now serves built client assets only in production so local Vite development no longer risks stale static HTML taking precedence
- **Restart Follow-Mode Reliability** — `SYSTEM/start.sh --restart -f` now reliably tears down old frontend and backend processes before starting fresh tails

### Quality
- **Focused Communication Bulk Action Coverage** — added a dedicated Communications bulk-actions unit suite and surfaced it in the visible default test summary
- **Gateway Diagnostics Coverage** — added focused client tests for restart-loop detection, session-drift detection, and healthy-log no-op behavior
- **Artifact Notification Coverage** — expanded workspace artifact notification tests to cover real-writer attribution, duplicate suppression, and bare-filename resolution
- **Validation Gate** — current local batch validated with `npm run typecheck`, `client/src/lib/communicationBulkActions.test.ts`, `client/src/lib/gatewayDiagnostics.test.ts`, `server/lib/workspace-artifact-notifications.test.ts`, and `bash -n SYSTEM/test.sh`

## [v1.3.13] - 2026-04-21

### Fixes — Gateway Config Churn Hardening
- **Protected Gateway Field Preservation** — dashboard-managed `openclaw.json` writes now preserve the latest on-disk `gateway` block instead of replaying stale in-memory values over `gateway.auth.token`, `gateway.remote.token`, or `gateway.tailscale`
- **Shared Config Writer Coverage** — this preservation guard now covers agent model override writes, skills updates, OpenClaw agent transfer/import writes, and the profile-mode agent registration path
- **Explicit Churn Diagnostics** — dashboard logs now warn when one of those write paths attempted to change protected gateway fields, making the remaining churn source easier to attribute in cloud logs

### Quality
- **Regression Coverage** — added focused OpenClaw config helper tests to prove gateway fields are preserved while non-gateway agent updates still persist
- **Visible Test Summary Coverage** — `SYSTEM/test.sh` now includes the OpenClaw config helper suite so the aggregate visible count increases again for this hardening line
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/openclaw-config.test.ts`, `server/lib/skills.test.ts`, `server/lib/openclaw-agent-transfer.test.ts`, and `bash -n SYSTEM/test.sh`

## [v1.3.12] - 2026-04-20

### Fixes — Dashboard Token Logging
- **No Full Token Leak on First Run** — dashboard startup no longer prints the full generated API token to stdout on first-run token creation
- **Redacted Token Preview Only** — startup now logs only that the token was generated, the token file path, and a short redacted preview
- **Regression Coverage** — added a focused auth helper test for dashboard token preview redaction

### Improvements — Setup and Release Hygiene
- **Setup Script Alignment** — `setup.sh` now reflects the current `v1.3.x` line, writes `DASHBOARD_PUBLIC_URL`, documents `CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS`, and normalizes `OPIK_PROJECT_NAME=clawmax`
- **Visible Test Summary Coverage** — `SYSTEM/test.sh` now surfaces additional focused suites in the visible summary, including dashboard auth helper coverage
- **Docs Cleanup** — README and backlog were refreshed to match the current release line and current open follow-through items

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `npx ts-node --transpileOnly server/lib/auth.test.ts`, `bash -n SYSTEM/test.sh`, and `bash -n setup.sh`

## [v1.3.11] - 2026-04-20

### Fixes — Metering Display
- **Relaxed Dashboard Instance Filter** — metering no longer drops otherwise-valid traces just because the trace metadata omits `dashboard_instance_id`
- **OPIK Consumption Alignment** — viewer-scoped metering now accepts traces that match the current user/workspace even when dashboard-instance metadata is absent from the trace
- **Regression Coverage** — added a focused metering test for traces with missing `dashboard_instance_id`

### Improvements — Communications Default View
- **Card View Default** — fresh dashboards now default the Communications page to the card/grid view instead of the list view when no saved preference exists

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and `server/lib/metering.test.ts`

## [v1.3.10] - 2026-04-20

### Fixes — Organization Template Membership and Round-Trip
- **Agent Membership Round-Trip** — organization `TEMPLATE.md` export/import now preserves each agent’s `communities` and `groups` membership instead of dropping those fields from the agent table
- **Stable Agent Table Parsing** — markdown import now preserves empty agent table cells so blank `tags` or `skills` fields no longer shift `communities` and `groups` into the wrong columns
- **CW Template Apply Correctness** — fresh exported/imported CW templates now apply with agents correctly added to their work groups and community

### Fixes — Workflow Timeout Behavior
- **Longer Default Workflow Agent Timeout** — workflow participant timeout increased from `5 minutes` (`300000 ms`) to `10 minutes` (`600000 ms`) to better match heavier cloud workloads such as image-analysis steps
- **Configurable Timeout Ceiling** — new `CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS` override allows hosted runtimes to raise or tune the participant timeout without code changes
- **Safe Timeout Fallback** — invalid or too-small timeout values now fall back to the sane `10 minute` default

### Fixes — Active Workspace Config Targeting
- **Skill Updates Prefer Active Workspace Record** — skill reads and updates now target the active workspace agent record first when duplicate agent ids exist across workspaces
- **Agent Transfer Upsert Prefers Active Workspace Record** — import/transfer config upserts now prefer the active workspace match instead of the first matching id
- **Gateway Field Preservation** — these config-targeting paths preserve unrelated gateway settings while updating agent-specific fields
- **Shared Config Logging** — agent transfer now emits lightweight logs when writing shared config to help correlate runtime behavior in hosted environments

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/templates.test.ts`, `server/lib/workflows.test.ts`, `server/lib/skills.test.ts`, and `server/lib/openclaw-agent-transfer.test.ts`

## [v1.3.9] - 2026-04-19

### Fixes — Notification Signal Quality
- **Notification Burst Grouping** — near-identical agent notifications created in the same short window now collapse into a grouped summary instead of spamming one top-level row per agent
- **Grouped Dismiss Behavior** — dismissing a grouped notification now clears the full burst instead of leaving sibling notifications behind
- **Grouped Feed Drill-Down** — grouped artifact notifications still expose the per-agent child entries so users can open the specific file they need

### Fixes — Workflow Runtime Stability
- **Shared Config Churn Guard** — workflow and chat execution no longer snapshot and restore the entire shared `openclaw.json` during temporary model/auth overrides
- **Serialized Model Overrides** — temporary live config mutations are now serialized so concurrent workflow participants do not race each other through the same shared config file
- **Gateway Config Preservation** — temporary agent model overrides now preserve unrelated gateway config fields such as `gateway.auth.token`, `gateway.remote.token`, and `gateway.tailscale`
- **No-Op Config Writes Removed** — when an execution already targets the current model, the runtime now skips rewriting shared config entirely

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/notifications.test.ts`, and `server/lib/agent-execution.test.ts`

## [v1.3.8] - 2026-04-18

### Fixes — Session Expiry and Reauthentication
- **Generic 401 Reauth Flow** — same-origin authenticated dashboard API calls now trigger a session-expired flow on `401` instead of leaving users inside dead-end modals or stale authenticated screens
- **Explicit Login Recovery Message** — the login screen now explains when a session expired or was cleared after a runtime restart so users know they need to sign in again
- **DocHub Upload Recovery** — upload now benefits from the generic `401` handling path instead of surfacing only a raw `Unauthorized` error

### Fixes — Active Workspace Path Resolution
- **Workflow Execution Archive Routes** — workflow execution archive, unarchive, delete, and archived-list routes now operate against the active workspace instead of assuming the default `~/.openclaw/workspace` path
- **Non-Default Workspace Safety** — execution history actions now stay aligned with the workspace selected in the dashboard, which is required for runtimes that relocate mutable state under a shared persistent root

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/routes/workflows.test.ts`, plus the broader automated and manual release checks already run in this batch


## [v1.3.5] - 2026-04-17

### Fixes — DocHub ZIP Uploads
- **Cloud ZIP Extraction Fallback** — DocHub ZIP uploads no longer require the `unzip` binary to be present in the runtime image
- **Python Stdlib Fallback** — when `unzip` is unavailable, ZIP listing and extraction now fall back to `python3` and the standard-library `zipfile` module
- **Same Conflict Safety** — overwrite-conflict protection and unsafe-path rejection stay intact across both extraction paths

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and `server/lib/workspace-upload.test.ts`

## [v1.3.4] - 2026-04-16

### Features — DocHub Upload and Asset Review
- **Workspace Uploads** — DocHub now supports uploading files directly into the shared `AGENTS/` root or into a specific agent workspace
- **ZIP Expansion** — uploaded ZIP archives can be expanded in place, with overwrite-conflict protection so existing workspace content is not silently replaced
- **Asset Review in DocHub** — uploaded markdown, common text files, and common image files can now be previewed directly from DocHub, while unsupported binaries still remain downloadable
- **Asset Delete Flow** — uploaded AGENTS assets can now be removed from DocHub with typed confirmation and directory-level previews of what will be deleted

### Fixes — Agent Discovery and Asset Classification
- **Invalid Agent Auto-Registration Guard** — uploaded AGENTS directories are no longer treated as real managed agents just because runtime state exists; blank scaffold identities now stay classified as uploaded assets
- **Stale Runtime Cleanup on Delete** — deleting an uploaded AGENTS directory now also removes stale `openclaw.json` registration and local runtime state that would otherwise keep reclassifying it as an agent
- **Protected Surface Boundaries** — `ORG/*`, `WORKFLOWS/*`, and protected real agent workspace files remain non-deletable, while uploaded AGENTS assets stay editable/deletable

### Fixes — Hosted Onboarding and Workflow Reliability
- **Sticky Empty-Workspace Onboarding** — onboarding now stays visible for truly empty hosted workspaces instead of appearing briefly and disappearing during late workspace hydration
- **Workflow Session Lock Retry** — workflow agent execution now retries boundedly when the failure is only `session file locked`, reducing false failures in parallel runs that touch the same agent

### Fixes — Template Prereqs and Runtime Version Reporting
- **Packaged Skill Detection** — template prereq checks now resolve skills like `workspace-ls` by both id and surfaced catalog name, preventing false missing-skill warnings during `ClawMax System Test` apply
- **Git Checkout Version Precedence** — real repo checkouts now continue to prefer git tag discovery before falling back to the checked-in dashboard package version, so local/dev no longer regresses to the stale package version when a newer git tag exists
- **Packaged Runtime Version Contract** — packaged runtimes still support `CLAWMAX_VERSION` explicitly, while `.git`-less images fall back safely without reporting `0.1.0`

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/workspace-upload.test.ts`, and `server/lib/workflows.test.ts`

## [v1.3.3] - 2026-04-16

### Fixes — Runtime Version Reporting
- **Docker/Packaged Runtime Version Resolution** — the dashboard no longer depends solely on `.git` tag discovery inside the runtime image to determine its displayed version
- **Explicit Version Contract** — packaged runtimes can now provide `CLAWMAX_VERSION`, and the dashboard will prefer that over git inspection when reporting the current version
- **Safer Fallback Chain** — version resolution now falls back through explicit runtime version, checked-in dashboard package version, then git tag discovery instead of dropping straight to `0.1.0`

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and `server/lib/version.test.ts`

## [v1.3.2] - 2026-04-14

### Fixes — Hosted Metering and Budget Isolation
- **Viewer-Scoped Workspace Budget** — `/api/budget` now uses the same authenticated user, workspace, and dashboard-instance scoping as metering so a fresh hosted dashboard no longer shows stale spend from another user or prior instance

### Fixes — Gateway Diagnostics
- **Gateway Status Failure Classification** — agent gateway status responses now distinguish configuration, authentication, timeout, and connection failures instead of collapsing them into a generic unavailable state
- **Doctor-First Runtime Guidance** — the agent status panel now routes users to `Doctor` for gateway/runtime issues instead of showing local-machine command guidance that does not apply to managed or remote runtimes

### Fixes — Agent Creation UX
- **Removed Customer Gateway Step** — `Create Agent` no longer exposes the customer-facing gateway/deploy step; internal port/runtime behavior stays implicit instead of asking users to configure gateway details directly

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/budget.test.ts`, `server/lib/metering.test.ts`, `server/lib/workspace-manager.test.ts`, and `server/lib/integration-validation.test.ts`

## [v1.3.1] - 2026-04-13

### Fixes — Hosted Setup and Integrations
- **Sticky Empty-Workspace Onboarding** — onboarding now stays open reliably for a truly empty active workspace instead of disappearing during late hydration on a brand new hosted instance
- **Hidden Ollama Validation Cleanup** — saving integrations no longer reports hidden Ollama validation failures when Ollama is disabled for the current runtime
- **Runtime Workspace Reconciliation** — the dashboard workspace registry now reconciles its default workspace path against the configured runtime workspace so a fresh hosted instance does not inherit a stale prior workspace path

### Fixes — Opik Metering Isolation
- **User-Scoped Metering** — `/api/metering` now filters Opik traces to the authenticated user before aggregating workspace/agent/workflow totals, preventing a fresh user from seeing another user’s trace data in the same hosted project
- **Dashboard Instance Scoping** — Opik traces now include a `dashboard_instance_id` derived from the canonical dashboard URL/request host, and metering only includes traces from the current dashboard instance

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, `server/lib/workspace-manager.test.ts`, `server/lib/integration-validation.test.ts`, and `server/lib/metering.test.ts`

## [v1.3.0] - 2026-04-13

### Fixes — Hosted Runtime and Integrations
- **Hosted GitHub Runtime Token Path** — hosted/non-interactive deployments can now store a GitHub runtime token server-side for issue and PR workflows, while local/native and operator-managed environments continue to use the `gh` CLI path
- **Runtime-Aware Ollama Defaults** — the dashboard now prefers an injected `OLLAMA_BASE_URL` when present and only falls back to `http://localhost:11434` for true local/native development
- **Runtime-Aware Ollama Visibility** — Ollama stays hidden unless the runtime is actually configured for it, and `OLLAMA_BASE_URL` no longer leaks into `Keys & Secrets` when Ollama is disabled

### Fixes — Onboarding, BYOK, and User Setup
- **Onboarding Stability** — onboarding now stays tied to the active workspace instead of disappearing during login hydration on empty workspaces
- **BYOK State and Close Consistency** — saving or skipping integrations now closes mounted wizard instances consistently, resyncs browser-local state correctly, and updates readiness more reliably
- **Browser-Local Key Explanation** — BYOK now explains when keys were configured in another browser or machine so users understand why local browser setup must be repeated
- **Workspace vs Browser Defaults** — workspace-level GitHub defaults continue to persist across browsers while model/provider BYOK values remain browser-local

### Fixes — AI Creation Flows
- **Consistent AI Gating** — agent, workflow, skill, and template AI-create flows now open first and show the same in-flow warning when no usable AI execution path is configured
- **Setup Guidance in Flow** — each AI-create surface now links directly to `BYOK` and `Keys & Secrets` instead of waiting for a failed generation attempt
- **AI Readiness Contract** — AI create readiness is now based on the execution paths those generation routes can actually use, avoiding false-ready states in a new browser

### Fixes — Template Apply and Prereqs
- **Preferred Model Readiness** — a saved preferred model now counts as a valid shared execution path during template prereq checks
- **Packaged Skill Detection** — packaged skills like `workspace-ls` resolve correctly in prereq checks instead of warning as missing
- **Partner Surface Cleanup on Main** — unstable Blaxel and Redis partner/template surfaces remain removed from shipped `main` and preserved only on their dedicated branches

### Fixes — Secrets and Traces
- **Partner Secret Cleanup** — clearing partner fields now removes stale saved values instead of leaving outdated shared-secret residue behind
- **User-Aware Opik Metadata** — manual chats, group/direct messaging, and manual workflow runs now stamp real dashboard user identity alongside workspace and agent/workflow identifiers, while scheduled/system runs remain attributed as system activity

### Quality
- **Expanded Local Validation** — added focused unit coverage for browser-vault helpers, dashboard env resolution, workspace integrations, prereqs, and integration validation so `SYSTEM/test.sh` reflects the newer runtime/setup behavior

## [v1.2.18] - 2026-04-12

### Fixes — Hosted GitHub and Integration UX
- **Hosted GitHub Token Storage** — GitHub partner integration now supports a server-stored runtime token for hosted/non-interactive deployments, while local and operator-managed environments continue to use the existing `gh` CLI auth flow
- **GitHub Readiness Contract** — hosted runtimes without a runtime token now report the missing token directly instead of falling back to misleading local CLI auth guidance
- **GitHub Secret Handling** — GitHub runtime tokens no longer rely on browser vault; the UI now shows server-side token presence without returning the raw token after save

### Fixes — Onboarding, BYOK, and Prereqs
- **Onboarding Workspace Scope** — onboarding visibility now tracks the active workspace’s agent count instead of the global system count, so it no longer disappears after login hydration on empty workspaces
- **BYOK Close Consistency** — saving or skipping integrations now closes all mounted wizard instances consistently instead of requiring repeated close actions
- **Shared Execution Readiness** — template prereqs now treat a saved workspace preferred model as a valid shared execution path
- **Packaged Skill Detection** — packaged skills like `workspace-ls` now resolve correctly in prereq checks instead of warning as missing when the runtime already includes them

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and `npx ts-node --transpile-only server/lib/workspace-integrations.test.ts`

## [v1.2.17] - 2026-04-12

### Fixes — BYOK, Onboarding, and Cloud Runtime UX
- **BYOK State Sync** — the `BYOK` and `Partners` entrypoints now resync from browser-vault updates so saved provider keys persist visibly across both mounted wizard instances instead of drifting stale
- **BYOK Readiness Pill** — the top-bar `BYOK` trigger now turns green when a usable provider path is available instead of staying hardcoded amber
- **Onboarding / BYOK Race Hardening** — onboarding now suppresses BYOK auto-open directly from `App`, preventing the first-run onboarding flow from being replaced a few seconds later by the BYOK modal
- **Opik Copy Tightening** — Workspaces Integrations now says clearly that browser-stored Opik defaults do not enable runtime tracing, budgeting, or monitoring by themselves; runtime `OPIK_*` env is still required
- **Cloud GitHub Token Path** — hosted/cloud runtimes can now report GitHub readiness from a runtime `GITHUB_TOKEN` or `GH_TOKEN` plus a default repo, while local/on-prem continues to use the `gh` CLI auth flow
- **GitHub Readiness Copy Hardening** — the GitHub partner surface now reflects which auth mode is active instead of implying cloud readiness is still CLI-only

### Fixes — Cloud Ollama Visibility Contract
- **Managed Runtime Ollama Default** — Ollama is now hidden by default in managed/cloud dashboard runtimes so cloud users are not prompted to configure a local model path the deployment cannot actually reach
- **Explicit Ollama UI Override** — added `DASHBOARD_ENABLE_OLLAMA` so operators can force-enable or force-hide Ollama in the dashboard UI as needed
- **Cloud UI Surface Cleanup** — when Ollama is disabled, the dashboard removes Ollama from Workspaces Integrations, onboarding guidance, Add Agent model-selection affordances, and Keys & Secrets inventory

### Docs
- **Env Contract Documentation** — documented `DASHBOARD_ENABLE_OLLAMA` plus the cloud GitHub runtime token contract (`GITHUB_TOKEN` / `GH_TOKEN`) in `SYSTEM/dashboard/.env.example` and `README.md` for CLI/web handoff and deployment clarity

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`

## [v1.2.16] - 2026-04-12

### Fixes — Template Library and Runtime Doctor
- **Partner Cleanup on Main** — removed the unstable Blaxel and Redis template plus partner-definition assets from `main` while preserving the work on their dedicated stabilization branches
- **Managed-Runtime Doctor Copy** — Doctor now uses managed-instance wording for gateway warnings instead of implying desktop/Linux host remediation
- **Runtime Warning Summary** — Activity and System & Logs no longer report `All agents healthy` when runtime warnings are still active

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`, the standalone templates test suite, and `./SYSTEM/test.sh integration --with-validation`

## [v1.2.15] - 2026-04-12

### Fixes — Partner Visibility and Workflow UX
- **Partner Surface Consistency** — `Partners` and `Keys & Secrets` now consistently show only the intended `GitHub`, `Senso`, and `Opik` integrations on `main`, including local/dev fallback rendering
- **Onboarding / BYOK Modal Ordering** — onboarding is no longer interrupted by a delayed BYOK auto-open on empty workspaces
- **Workflow Customization Persistence** — select-based kickoff/workflow customization fields now persist correctly into workflow markdown overrides and stop triggering false required-field errors

### Fixes — System Test and Runtime Guidance
- **Communications Test Prompt Hardening** — the `ClawMax System Test` communications step now treats lack of direct transport control as non-fatal and focuses failure on real workflow-context gaps
- **Managed-Runtime Guidance Cleanup** — managed/container runtime messaging avoids desktop/systemd-first gateway recovery guidance

### Quality
- **Validation Gate** — validated locally with `npm run typecheck` and the green `ClawMax System Test` path in cloud after switching to a working model provider

## [v1.2.14] - 2026-04-11

### Docs
- **Partner Follow-Up Branch Tracking** — documented the dedicated Blaxel, Redis, and template-audit follow-up branches in backlog/docs so `main` could stay release-ready while partner stabilization continued separately

## [v1.2.13] - 2026-04-11

### Fixes — Partner Skill Installs
- **Non-Interactive Curated Partner Installs** — curated partner installers now use the correct non-interactive Skills CLI flags for multi-skill repos, preventing Blaxel and Redis installs from stalling on hidden selection prompts
- **Installed-State Follow-Through** — partner install surfaces now keep an explicit `Installed` state after successful curated installs instead of dropping back to a generic install button

### Fixes — Workflow Communication Delivery
- **Workflow Session Delivery Guidance** — workflow participant runtime instructions now explicitly tell agents to return plain-text results in-session and not call direct message/send tools for the current workflow group or community delivery path

### Fixes — Gateway Health Detection
- **Gateway Probe Fallback** — gateway health checks now fall back to a direct TCP probe when `lsof` is unavailable
- **Token-Backed Doctor Probe** — Doctor now uses an authenticated in-instance gateway responsiveness probe before classifying the gateway as unavailable

## [v1.2.12] - 2026-04-11

### Features — Onboarding and Workspace Flow
- **Onboarding Template Suggestions** — the onboarding wizard now uses a wider templates step, category-aware focus/goal guidance, clickable starter cards, and direct open of the selected template instead of only sending users to a generic templates list
- **AI-First Agent Start Path** — onboarding now opens agent creation in AI mode automatically when BYOK/runtime is already configured with a usable LLM path
- **Workspace Path Conflict Recovery** — creating a workspace over an existing path now returns an explicit conflict flow with `Open Existing`, `Use Existing`, and `Overwrite` actions instead of a dead-end “path is not empty” toast
- **Document Download** — files opened in Documents can now be downloaded directly from the document toolbar

### Fixes — Runtime, Cloud, and Messaging
- **Workspace Export Rate Limit Bypass** — workspace export is no longer blocked by the generic API rate limiter under normal dashboard polling load
- **Managed Runtime Gateway Guidance** — Doctor and chat fallback messaging now avoid machine-local command guidance as the primary recovery path on managed/container runtimes
- **Agent Chat Failure Rendering** — empty or failed chat replies now surface a clear assistant-side error state instead of blank bubbles or stuck typing blocks
- **Workflow Communication Diagnostics** — common communication delivery failures now render as a product-level explanation that the target group/community is missing or misconfigured
- **Metering Empty-State Copy** — Activity empty metering copy is less misleading while traces are still arriving

### Fixes — Auth Email Rendering
- **OTP Dark-Mode Hardening** — one-time-code emails now use explicit inline colors for header, body, OTP card, code text, and security/footer copy so dark-mode mail clients keep the message readable

### Quality
- **Validation Gate** — validated locally with `npm run typecheck`

## [v1.2.11] - 2026-04-10

### Features — Template Feedback
- **Template Feedback Routing** — users can now leave template ratings and short written feedback, and that feedback can be routed either to the local workspace JSON file or to an optional remote endpoint

### Docs
- **Developer Feedback Routing Notes** — README now documents the local JSON path plus the optional remote endpoint env vars

### Quality
- **Release Gate** — validated locally with `npm run typecheck` and `npx ts-node --transpile-only server/lib/templates.test.ts`, with GitHub CI green on commit `c6af61f`

## [v1.2.10] - 2026-04-10

### Features — AI Template Quality
- **Example-Aware AI Generation** — long prompts with examples, URLs, and style references now flow into generated workflow content more explicitly instead of being flattened into generic instructions
- **Workflow Structure Follow-Through** — AI-generated templates now preserve kickoff-first, middle-work, and final-output structure more reliably, with scaling metadata where the prompt implies batch work
- **Prompt and Input Preservation** — template regenerate/refine now preserves user-pinned names and custom workflow input blocks rather than overwriting them on every AI pass
- **Typed Workflow Run Inputs** — workflow run forms now support typed text, checkbox, and select inputs derived from generated `Run Inputs` metadata

### Fixes — Template Apply and Multi-Template Workspaces
- **Agent Registration Reliability** — agents created through template apply now register in the active workspace `openclaw.json` path more reliably, preventing immediate “agent not found” runtime failures after apply
- **Workflow Conflict Hardening** — repeated applies now detect more workflow-level conflicts before import, including workflow id/name overlap and dependency alias collisions
- **Legacy Dependency Alias Normalization** — organization template import now normalizes broken legacy dependency ids like `kickoff` or `team-kickoff` to the actual workflow ids present in the applied template
- **Preferred Model Recovery Path** — template apply prereqs now link directly into preferred-model setup so users can resolve missing shared execution defaults without leaving the flow blind

### Fixes — Template Library and Validation
- **Canonicalized Organization Templates** — another batch of built-in org templates was normalized for explicit kickoff/final structure and workflow scaling metadata
- **Scaling Metadata Validation** — normalized templates and template validation now align on `scaling` / `parallelism` limits, and the public templates repo schema/validator was updated accordingly

### Quality
- **Integration + Template Validation Gate** — validated locally with `npm run typecheck`, `./SYSTEM/test.sh integration --with-validation`, and repeated manual apply/run/delete checks across Camera West, dive, meal-planning, and travel-photography flows

## [v1.2.9] - 2026-04-08

### Fixes — Workflow Apply and Execution
- **Template Apply Workflow Conflicts** — repeated applies in busy workspaces now detect workflow-name conflicts alongside agent and channel conflicts, support rename-on-apply, and provide direct recovery paths back to the right wizard step from a blocked Deploy state
- **Same-Agent Concurrent Workflow Locking** — workflows that hit the same agent concurrently no longer fail with `session file locked`; same-agent workflow execution is serialized while different agents still run in parallel
- **Workflow Pause/Resume First Pass** — workflow controls now surface explicit pause/resume actions in cards, tables, and DAG view using the existing enabled/disabled workflow behavior
- **DAG Selection Follow-Through** — DAG view now supports proper node/pipeline selection behavior so bulk workflow actions work consistently in the graph view

### Fixes — Metering and Budget Visibility
- **Fallback Spend Estimation from Tokens** — workspace/activity metering now derives estimated spend from model + token counts when Opik traces lack an explicit `estimated_cost_usd`, fixing misleading `$0.0000` dashboards on real traced usage
- **Shared Pricing Logic** — Opik tracing and metering aggregation now share the same model-pricing helper so new traces and aggregated traces stay aligned
- **User-Facing Cost Rounding** — activity, agents, workflows, workspace edit, and shared dashboard cost displays now round to 2 decimals for cleaner budget/readability

### Fixes — Agent and Activity UX
- **Clickable Agent Detail Files** — recent workspace files and key doc references in the agent detail panel now open directly instead of forcing manual navigation
- **Activity Type Labels** — generic markdown/file activity now shows readable types like `markdown` and `file` instead of filename stems
- **Opik Loading/Empty Messaging** — activity metering now explains when Opik data is still being collected or when no traces have appeared yet
- **Agent Action Popup Anchoring** — agent action menus no longer drift or clip incorrectly in cloud/narrow layouts

### Fixes — Mobile and Responsive UX
- **Mobile Notifications Sheet** — notifications now use a centered mobile sheet with safe width, backdrop, and internal scrolling instead of an off-screen desktop dropdown
- **Top Bar Narrow Layout Cleanup** — the top bar now wraps cleanly on smaller screens and hides lower-priority text until there is room
- **Template Apply Modal Mobile Shell** — apply modal padding/height handling is safer on narrow/mobile screens

## [v1.2.6] - 2026-04-05

### Fixes — Cloud Runtime Bootstrap
- **Runtime-Capable Docker Image** — the runtime image now installs the `openclaw` CLI instead of shipping a dashboard-only container that cannot register or execute real agents
- **Container Entrypoint Bootstrap** — cloud/on-prem startup now initializes `HOME`, `OPENCLAW_WORKSPACE`, required workspace directories, and `gateway.mode=local`, and fails fast if `openclaw` is missing
- **Gateway Start Attempt on Boot** — container startup now attempts to bring up the OpenClaw gateway automatically so fresh deployments have a real runtime path before Doctor/manual repair
- **Persistent OpenClaw State in Compose** — Docker Compose now persists `~/.openclaw` separately from workspace files so agent registration and session state survive container restarts

### Fixes — Template Apply Readiness
- **Workflow-Aware GitHub Prereqs** — template apply readiness no longer hard-fails GitHub CLI checks for `clawmax-system-test` unless GitHub coordination is actually enabled for that apply

### Docs
- **Cloud Runtime Persistence Note** — README now calls out that cloud/on-prem deployments must persist both workspace files and OpenClaw state

## [v1.2.5] - 2026-04-03

### Features — Secure Runtime Inputs
- **Browser-Local Secrets** — template apply, workflow runs, and skill detail views now support browser-local secret/input prompts so users can provide API keys, slugs, event URLs, and similar runtime values without writing them into workflow markdown or server config by default
- **Lu.ma Event Analysis Desk** — added a Lu.ma analysis template plus starter `luma-event-insights` custom skill with secure browser-local prompts for event scope and API access

### Fixes — Test Harness and Template Apply
- **Fresh System-Test Workspace Setup** — `SYSTEM/test.sh` now recreates `ClawMax System Test` before apply so stale hidden files do not leak into integration runs
- **Imported Workflow Visibility Wait** — the integration harness now waits for template-imported workflows to appear before asserting or triggering them
- **Template Workflow Dependencies Audit** — multi-workflow organization templates now preserve proper kickoff-first DAG sequencing instead of running later stages in parallel by mistake
- **Template Tag Coverage** — every organization template community, group, and workflow now has at least one tag, improving consistency across apply, search, and downstream tooling

### Fixes — Dashboard Readability and Spend
- **Markdown Rendering in Shared Dashboards** — notifications, workflow summaries, and group chats now render markdown correctly, including light-mode code blocks
- **Scrollable Shared Cards** — dashboard notifications, workflows, and group chat panels now scroll internally instead of overgrowing the page
- **Workflow Spend Attribution** — workflow spend now includes traced agent-call cost from workflow runs instead of showing `$0.0000` for active workflows

## [v1.2.4] - 2026-04-03

### Features — Setup and Auth
- **Email OTP in `setup.sh`** — local setup now offers Email OTP, bypass, GitHub OAuth, or production Email OTP instead of forcing the old bypass-vs-GitHub split
- **Developer OTP Setup Prompt** — `setup.sh` now asks for the developer login email and explains that local dev codes are written to `.clawmax-otp-dev.json`
- **Auth Docs Clarified** — auth docs now recommend concrete Email OTP defaults for local tooling/bootstrap flows and remove stale GitHub auth guidance

### Fixes — Doctor and Navigation
- **Doctor Error Hardening** — Doctor UI no longer crashes when `/api/agents/doctor` returns a partial or error payload
- **Doctor Empty-State Shape** — backend doctor route now returns a consistent empty-state response when no agents directory exists
- **Sidebar Regrouping** — sidebar now cleanly groups `Templates/Skills` separately from `Activity/System & Logs`
- **Template Prereq Guidance** — template apply now points users to `System & Logs → Doctor → Auto-Fix`

### Fixes — Workspace Dashboards
- **Light/Dark Theme Consistency** — shared workspace dashboards now render correctly in both theme modes
- **Compact Dashboard Density** — compact mode defaults are tighter and more informative while staying closer to a one-page summary
- **Standard/Detail Workflow Layout** — workflow-heavy dashboard views now give workflows full-width room instead of leaving dead space beside them

## [v1.2.3] - 2026-04-03

### Features — Authentication
- **Email OTP Dashboard Auth** — added a new dashboard auth mode between GitHub OAuth and bypass for single-user cloud/on-prem installs
- **Resend-backed OTP Delivery** — OTP codes now send through the dashboard backend with short-lived, hashed, single-use verification
- **Developer OTP Flow** — local developer mode now writes the latest code to `.clawmax-otp-dev.json` and the login UI points to it directly
- **ClawMax-styled OTP Email** — OTP delivery now uses both HTML and text bodies aligned with the ClawMax web/backend email style

### Features — Templates
- **50+ Organization Templates in App** — added ten new proposal templates across movies, astronomy, arXiv digests, market signals, AI model evaluation, product research, competitive analysis, rapid website building, and blog launch
- **25 Reusable Agent Templates** — pulled repeated roles into reusable agent templates for events, testing, customer research, competition, prototype building, market analysis, astronomy guidance, and GitHub triage
- **Public Templates Repo at 50** — synced the new org templates to the public `Maximilien-ai/templates` repo and validated the full 50-template directory set

### Quality — Auth and Template Validation
- **Focused OTP Auth Tests** — added request/verify/reuse/expiry coverage for the new OTP auth flow
- **Main Test Harness Coverage** — wired the OTP auth suite into `SYSTEM/test.sh` so it runs in the normal release gate
- **Template Validation Pass** — app template tests and public templates validation both pass with the expanded catalog

## [v1.2.2] - 2026-04-02

### Features — Templates and Discovery
- **Event Planning Proposal Templates** — added `Small Event Planning Desk`, `Speaker Event Studio`, and `Conference Ops Hub` in both the app repo and public templates repo
- **Scalable Event Roles** — small, medium, and large event templates now scale one coordination role each so customers can increase team size naturally
- **Events Filter in Templates UI** — new `Events` filter chip makes the event templates easier to discover without exact-name search

### Fixes — Communication and Chat
- **Default Channel Fan-out** — group and community messages now go to all members by default unless the user narrows with explicit `@mentions`
- **Agent Chat Streaming** — the live agent chat panel now streams stdout deltas through the SSE route instead of waiting for the full turn to finish
- **Agent Chat Session Continuity** — the dashboard chat route now passes its explicit session id through to OpenClaw so live chat state is more consistent

### Docs and Release Hygiene
- **Testing Guide Refresh** — updated testing guide for current `ClawMax System Test` paths, clean-state behavior, custom ports, and the remaining clean-room gap
- **Backlog / Issue Cleanup** — closed the default-`@all` UX issue, created the event-template follow-up issue, and reduced the open tracker to the real remaining work

### Tomorrow
- **Core remaining issues** — `#94` temp chat/runtime wrong-workspace resolution, `#8` Anthropic per-agent auth/runtime behavior, and `#95` event-template validation/refinement are the main next slices

## [v1.2.1] - 2026-04-02

### Fixes — Workspaces Integrations
- **Optional Integration Save Flow** — optional partner/provider validation failures no longer block save, and warnings now clearly name the failing integrations
- **Toast Visibility** — validation toasts now render above the integrations modal instead of behind it
- **Discovered Model Loading** — Gemini and Ollama discovered models now populate the preferred-model selector when available
- **Ollama Model Picker** — installed local Ollama models are surfaced inline with refresh support and one-click selection

### Fixes — Runtime Defaults and Import Validation
- **Workspace Integration Defaults Persistence** — non-secret Senso and GitHub defaults persist per workspace and flow back in after restart
- **Runtime Follow-Through** — saved GitHub repo and Senso context defaults now flow into template apply, workflow structured inputs, and runtime context
- **Template Import Schema Validation** — `TEMPLATE.md` imports now validate against the shared schema before save

### Fixes — Testing, Export, and Workflow Reliability
- **Workspace Export Reliability** — workspace zip exports no longer truncate on download, and exported workspaces include a recovery manifest
- **System Test Cleanup** — deleting agents now removes shared agent-state residue so test runs do not pollute future workspaces
- **System Test Workspace Resolution** — `SYSTEM/test.sh` now resolves the real system-test workspace id/path and supports custom dashboard ports cleanly
- **Workflow Rerun Reset** — rerunning an upstream workflow now recursively resets downstream DAG progress/status instead of showing stale completion from an earlier run
- **System Test Group Messaging Guidance** — group-targeted system-test workflows now use the current workflow group channel rather than depending on separate session labels

### Fixes — Skills, Doctor, and UI Polish
- **Packaged ClawMax Skills in Catalog** — repo-root packaged skills such as `workspace-ls` now appear in Skills Manager instead of only showing as assigned orphan skills
- **Doctor / Prereq Messaging** — gateway and key warnings better reflect configured ports and browser BYOK reality
- **Bulk Model Search** — bulk model operations now include live search with quick clear
- **Workspace Switcher Actions Layout** — workspace row actions no longer overlap long workspace names
- **DAG Connector / Unread Badge Polish** — workflow connector lines align correctly across zoom levels and Communication unread badges are visible again

### Follow-up
- **Known Runtime Follow-up** — temporary chat/direct runtime can still resolve duplicate agent IDs against the wrong global OpenClaw workspace record when the same agent id exists in multiple workspaces. This is tracked as high-priority issue `#94`.

### Features — Discovery
- **Template / Workflow Suggestions** — search now suggests nearby templates and workflows instead of dead-ending on weak or empty matches

## [v1.2.0] - 2026-04-01

### Features — Workspaces Integrations
- **Workspaces Integrations** — unified setup surface for Models, Senso, Opik, and GitHub
- **Gemini Provider Support** — save and validate Gemini keys through the hosted-provider flow
- **Ollama Local Provider Support** — configure local Ollama runtime, discover installed models, and validate local reachability
- **Integration Validation** — key checks for OpenAI, Anthropic, Opik, Gemini, and Ollama with live/fallback status
- **Template Apply Defaults** — saved Senso and GitHub defaults flow into organization template apply

### Features — Workspace Dashboards
- **Shareable Workspace Dashboards** — generate persistent read-only workspace dashboard links with copy/open/delete management
- **Display Modes** — compact, standard, and detail stakeholder views
- **Compact Summary Charts** — dense agent/workflow/notification summary bars
- **Result Artifact Normalization** — dashboards show normalized links and workspace artifact references instead of only raw logs
- **Workflow Input Summaries** — dashboards prefer structured kickoff/project configuration extraction over brittle log tails
- **Cost Trend Summaries** — cost section now shows today, last 7d, avg/day, and workflow spend ranking

### Features — Templates
- **Expanded Template Catalog** — new proposal template families across Science, Travel, Hobbies, Family, and Personal assistant/finance use cases
- **Reusable Agent Templates** — added Research Lead, Data Engineer, Data Analyst, Briefing Writer, People Researcher, Literature Reviewer, and Experiment Planner templates
- **Template Emoji Metadata** — optional emoji support across org, agent, and workflow templates
- **Collapsible Template Sections** — Agent / Organization / Workflow sections can be collapsed in the Templates explorer
- **Workflow Import UX** — first-pass `WORKFLOW.md` import via paste/upload from the Workflows page
- **Template Delete Confirmation** — typed consequence/confirm dialog for deleting user-created templates

### Features — Runtime and Delivery
- **Structured Workflow Inputs in Execution Records** — workflow execution records now persist structured kickoff/start inputs
- **Docker Deployment Support** — canonical `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and production path fixes in the public repo
- **Managed Workflow Metadata Alignment** — template workflows now carry explicit owner metadata and slug-aligned ids

### Fixes
- **Compact Dashboard Reorder** — same-column upward reorder now works reliably
- **Template Explorer Stability** — fixed templates page hook-order crash after adding collapsible sections
- **Senso / GitHub / Dashboard polish** — workspace dashboard visibility, result extraction, and integrations UX follow-through

## [v1.1.20] - 2026-03-29

### Features — Workflow v2
- **Workflow DAG Visualization** — interactive dependency graph with parallel lanes, connecting lines, zoom controls, and edit mode
- **DAG Execution Engine** — auto-advance pipeline when workflows complete, check dependencies, trigger ready dependents with BYOK keys
- **Interactive DAG Editing** — click to add/remove dependencies, cycle detection, undo (Ctrl+Z), visible × on lines
- **Workflow Progress Tracking** — intermediate progress from stdout activity + participant completion, progress bars in DAG view and Workflows page
- **Blocker Surfacing** — 5 blocker types (approval, choice, input, delegation, waiting) with dynamic UI in NotificationCenter
- **WORKFLOW.md Format** — parse + serialize + round-trip, import/export APIs
- **Workflow Types** — `once`, `recurring`, `conditional` with `dependsOn` array for DAG sequencing
- **All templates have DAG dependencies** — kickoff → fan-out → pipeline → fan-in patterns

### Features — Templates
- **Lean TEMPLATE.md** — frontmatter reduced from 248 to ~19 lines, structured markdown body with ## Agents, ## Communities, ## Groups, ## Workflows sections
- **14 Organization Templates** — Business (7), Technical (4), Personal (3) with kickoff workflows targeting all agents
- **Smart Workflow Customization** — paginated wizard with dynamic form fields (dropdowns for known values, checkboxes for yes/no, textareas for multi-line)
- **GitHub Coordination Toggle** — checkbox adds github/gh-issues skills + injects repo instructions
- **Template Cross-Validation** — agent/group/community/workflow reference checking on import
- **Export Buttons** — download TEMPLATE.md / WORKFLOW.md from detail views

### Features — Notifications
- **Dynamic Blocker UI** — approval buttons, choice pills, input field + submit, agent picker dropdown, waiting indicator
- **Inline Agent Actions** — restart + pause from notifications with toast feedback and status refresh
- **Notification Search** — filter by title, message, entity, type (shows at 4+ notifications)
- **Auto-detect Agent Blockers** — questions and errors from agent output create notifications automatically
- **Dismissed Stay Dismissed** — monitor no longer recreates dismissed notifications

### Features — Skills
- **Shipables.dev Registry** — search, browse categories, install with one click, "Installed" state tracking
- **Bulk Skill Assignment** — add skills to multiple agents from Agents page
- **AI Generator Anthropic Fallback** — works with Anthropic-only BYOK keys (issue #49)

### Features — Testing
- **78 Unit Tests** — notifications (15), workflows (23), validator (9), templates (31), plus existing suites
- **ClawMax System Test Template** — dedicated template with 3 test agents, 5 DAG workflows, scalable 1-10
- **Integration Test Runner** — `./SYSTEM/test.sh integration` creates workspace, applies template, tests live agents
- **Cost Tracking** — integration tests estimate ~$0.01-0.05/run on gpt-4o-mini

### Bug Fixes
- **Agent status checks shared gateway** — fixes offline status for agents without dedicated port
- **Guard `.toFixed()` / `.communities` / `system.*`** — prevent undefined access crashes across all pages
- **OAuth default** — shows setup instructions instead of broken button when not configured
- **Chat error styling** — ANSI stripping, dark mode, error detection, dismiss button
- **Template import generates IDENTITY.md** — agents get proper name/role/tags from template data
- **Workflow creation** — auto-assigns owner for managed mode, accepts "once" schedule

### Specs Published
- `SYSTEM/docs/specs/TEMPLATE_MD_SPEC.md` — formal TEMPLATE.md specification
- `SYSTEM/docs/specs/WORKFLOW_MD_SPEC.md` — formal WORKFLOW.md specification
- Published to [github.com/Maximilien-ai/templates](https://github.com/Maximilien-ai/templates) and [github.com/Maximilien-ai/workflows](https://github.com/Maximilien-ai/workflows)

### Releases
- v1.1.16 (Mar 27) — Deep Agents Hackathon
- v1.1.17 (Mar 28) — Workflow v2 specs + notifications
- v1.1.18 (Mar 28) — DAG visualization + templates
- v1.1.19 (Mar 28) — Aggregate progress + export buttons
- v1.1.20 (Mar 28) — DAG editing + zoom + fixes

## [v1.1.8] - 2026-03-22

### Fixes
- **BYOK execution correctness** — direct agent chat and manual workflow execution now use the resolved BYOK/user/system key policy instead of drifting to stale per-agent auth history.
- **Runtime auth-state override** — agent runs temporarily patch `auth-profiles.json` and agent model state for the duration of execution, then restore prior state afterward.
- **Dashboard env isolation** — provider keys now come from `SYSTEM/dashboard/.env` policy instead of ambient shell exports, with explicit precedence for system vs user execution.
- **Clean-room CI stabilization** — GitHub Actions now runs on `main`/tags, setup avoids non-interactive terminal failures, skills discovery is deterministic in CI, and the system test suite no longer hard-fails just because a fresh workspace lacks seeded demo data.

### Testing
- **Execution-state regression coverage** — added unit tests for temporary auth-profile/model overrides during runtime execution.
- **Skills test isolation** — workspace skill import tests now run in an isolated temp workspace instead of relying on real `~/.openclaw` state.

## [v1.1.7] - 2026-03-22

### Features
- **Workspace Reordering** — drag to reorder workspaces in the switcher, with persisted local order and stable active-workspace selection.
- **Scalable Templates and Communication Views** — sortable list/table modes, selection, select-all, bulk actions, and bulk delete flows for large collections.
- **Agent Config Validation** — pre-save validation on add/edit flows with advisory warnings for legacy content and stricter blocking for malformed config.
- **BYOK Preview Wizard** — top-bar `BYOK Preview` flow for dev testing with masked OpenAI/Anthropic inputs, system-vs-user key messaging, and local browser persistence.

### Fixes
- **OAuth redirect flow** — login and logout now return to the dashboard app origin instead of dropping users on the raw API server.
- **Login page refresh** — hero background and login shell now match the ClawMax.ai marketing visual treatment more closely.
- **Logout stability** — auth teardown no longer crashes protected pages during repeated login/logout cycles; top-bar user info and logout are visible.
- **Provider key isolation and precedence** — user agent/workflow execution now prefers BYOK then `USER_*` defaults, system execution now prefers dashboard-local system keys, and shell exports no longer implicitly drive provider policy.
- **Production root route** — dashboard serving is more robust and avoids `Cannot GET /` when client assets are present or dev redirects are needed.
- **Release readiness** — `npm run build` works again with `tsconfig.server.json`; README, OAuth docs, env examples, and release checklist were updated.
- **Mobile agent details** — wider responsive slide-over, improved wrapping for long values, and better touch targets on small screens.

### Testing
- **System template audits** — strict tests now validate shipped `TEMPLATES/*` content.
- **Agent model/config regression coverage** — added tests for legacy identity formats, model parsing, and live model updates.
- **Dashboard test harness auth fix** — `SYSTEM/test.sh` now prefers the live server token and can authenticate protected API checks again.

## [v1.1.6] - 2026-03-20

### Features
- **GitHub OAuth Authentication** — login via GitHub with JWT session cookies. Login page, user avatar + logout in sidebar. Supports allowed-user whitelist via `GITHUB_ALLOWED_USERS`. Falls back to dashboard token for API clients. Auth gate shows login when GitHub is configured.
- **Workspace Cost Budget** — per-workspace USD budget with progress bar on Activity page. Yellow warning at 80%, red when exceeded. Auto-pauses agent chat and workflow execution when budget is exhausted. Editable limit, toggleable enforcement.
- **Budget API** — `GET /api/budget` (status), `PUT /api/budget` (update config). Budget stored in `WORKSPACE/SYSTEM/budget.json`.

### Fixes
- **Unread red dot on list view** — `ChannelCard` (Communication list view) now shows unread message count badge, matching grid view behavior

### Security
- **Security audit** — full audit of dashboard, API endpoints, agent execution, file access, env vars (27 issues identified, critical/high remediated)
- **Auth enabled by default** — `DASHBOARD_AUTH_DISABLED` now defaults to `false`; `.env.example` provided with placeholder values
- **Rate limiting** — `express-rate-limit` middleware: 200 req/min global, 10 req/min on auth endpoints
- **Audit logging** — all API requests logged to `server/logs/audit.log` (timestamp, method, path, status, token hash, duration)
- **Env var whitelisting** — child processes (openclaw CLI) receive only whitelisted env vars via `safeEnv()` instead of full `process.env`
- **Port validation** — numeric validation before shell exec in agent restart (`kill -9`) and PID validation on lsof output
- **Path traversal fix** — `readWorkspaceFile`/`writeWorkspaceFile` now resolve symlinks before prefix check
- **GitHub URL validation** — strict HTTPS-only regex for skill import git clone (prevents command injection)
- **CORS configurable** — origin now reads from `CORS_ORIGIN` env var (was hardcoded to localhost:5173)
- **Gitignore hardened** — `.dashboard-token` and `server/logs/` added to `.gitignore`

## [v1.1.5] - 2026-03-19

### Features
- **Opik Token Metering** — full pipeline: traces agent chats + workflow executions to Opik, metering dashboard on Activity page, per-agent cost breakdown
- **Agent Cost Badges** — 💲 cost on grid cards + detail view with tooltip (calls, tokens, cost)
- **Agent Cost Column** — sortable Cost column in agent table view (replaces WhatsApp)
- **Workflow Cost Display** — cost shown on workflow cards and list view
- **Unread Message Indicators** — red dot with count on Communication cards + nav sidebar badge
- **@Mention Grouping** — role groups with Tab-to-expand for individual targeting
- **Group Chat Markdown** — ReactMarkdown + brace-depth JSON/ANSI cleanup

### Fixes
- Sequential agent calls with 3s delay (gateway contention)
- Agent pluralization fixed across all views
- Grid card layout: name line + ID/cost/chat/file line
- Communication card: trash bottom-right
- Workflow card: file icon bottom-right
- Template agent display names (title case)
- CEO removed from Status group
- Merged 3 agent PRs (#34 schema paths, #36 workflow schema, #37 template groups)

## [v1.1.4] - 2026-03-19

### Features
- **Opik Token Metering** — traces agent chats and workflow executions to Opik. Metering dashboard on Activity page with per-agent breakdown (calls, tokens, cost).
- **Agent Cost Badge** — 💲 cost indicator on agent cards (grid + detail) with tooltip showing calls, tokens, and estimated cost.
- **Unread Message Indicators** — red dot with count on Communication channel cards. Nav sidebar badge shows total unread from any page.
- **@Mention Grouping** — role-based grouping in dropdown (e.g., "@Engineer 2 agents"). Tab/tap to expand for individual targeting.
- **Group Chat Markdown** — agent messages render as formatted markdown with ReactMarkdown.
- **Workflow Tracing** — each execution traced to Opik with duration, participant count, status.

### Fixes
- Group chat JSON/ANSI cleanup (brace-depth tracking)
- Agent pluralization fixed across all views
- Chat history persistence (stable session IDs)
- Sequential agent calls to avoid empty responses
- Action menu overflow (opens upward on list view)
- Template agent display names consistent (title case)
- CEO removed from Status group in small startup template
- 3 agent PRs merged (#34 schema paths, #36 workflow schema, #37 template groups)

## [v1.1.3] - 2026-03-18

### Features
- **Workflow Scheduler** — Built-in cron scheduler runs enabled workflows on schedule automatically
- **Workflow Run Limits** — Set maxRuns to auto-disable workflows after N executions
- **AI Cron Generator** — Type schedule in plain English, AI generates the cron expression
- **Parameterized Templates** — Customize agent counts (+/- controls) when applying org templates
- **Template Workflow Display** — Template cards and detail popups show included workflows
- **1:1 Chat Polling** — Agent-initiated messages now appear in real-time (3s polling)
- **Mobile Responsive** — All pages, chat panels, modals, and toolbars work on mobile
- **Agent Config Validation** — Tags, name, and WhatsApp format validated on save
- **Template Apply Progress** — Toast notifications show step-by-step progress

### Templates
- **Small Startup Team v1.1.3** — 5 agents (CEO, PM, Engineers, QA, Release), 7 dev lifecycle workflows (standup, status, triage, PR review, coding, merge, release), parameterized counts for engineers/QA/PM
- **Engineering Team v1.1.0** — 4 agents with github skills, PR review workflow
- **Test Template v1.1.0** — Status check workflow with run limits

### Fixes
- Group chat auto-scroll no longer steals input focus on mobile
- Group chat flicker eliminated during 2s polling
- Group chat "responding" indicator auto-clears after 30s
- CI resilient to upstream OpenClaw CLI changes (stub fallback)
- Chat API key validation — clear error instead of cryptic timeout
- Chat timeout increased to 3 minutes for cold gateway starts
- Workflow cards refresh when detail pane loads (stale count fix)
- Workflow run count persisted and displayed correctly
- Template apply creates auth profiles for imported agents
- All modal dialogs mobile responsive (15+ components)
- All page layouts with proper mobile padding
- Agent roster toolbar wraps on mobile

### PRs
- Merged #19 (start.sh .env fix), #20 (SETUP.md)
- Closed #21-25 (empty commits from Engineer agent)

## [v1.1.2] - 2026-03-17

### Features
- Model override when applying org templates (collapsible section with provider-grouped dropdown)
- Agent config editor (edit IDENTITY.md, SOUL.md, TOOLS.md from UI)

### Fixes
- Dark mode workflow tags on Organizations page
- Workflow confirmation dialogs removed
- package-lock.json committed for reproducible installs

## [v1.1.1] - 2026-03-17

### Fixes
- Gateway port auto-detection (probes 18789 and 18889)
- Ngrok auth failure detection
- Test template switched to openai/gpt-4o-mini

## [v1.1.0] - 2026-03-16

### Features
- Multi-workspace support with workspace switcher
- Organization templates (Small Startup, Engineering Team)
- Workflow editor with cron presets
- Dark mode support

## [v1.0.0] - 2026-03-14

### Initial Release
- Agent management dashboard
- Real-time chat via gateway
- Group and community chat
- Workflow designer and execution
- Skills assignment (50+ built-in)
- Activity feed
- 95 tests passing
