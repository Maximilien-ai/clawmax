# ClawMax Documentation

> Last updated: October 27, 2026

Active development: Dashboard 2.0 on OpenClaw `2026.9.7`; stable remains
`v1.9.9`. Start with the [RC95 source preview and acceptance](planning/RC95_PREVIEW_ACCEPTANCE_2026-10-27.md).
Existing RC94 images retain their original source; RC95 images have not been built.
Older release evidence and installed-instance gates remain linked below.

## Active Documents

| Document | Description |
|----------|-------------|
| [planning/RC95_PREVIEW_ACCEPTANCE_2026-10-27.md](planning/RC95_PREVIEW_ACCEPTANCE_2026-10-27.md) | RC95 source preview: five included PRs, four holds, four human/provider acceptance checks and engineering evidence |
| [FIRST_AGENT_TUTORIAL.md](FIRST_AGENT_TUTORIAL.md) | Low-code guide to define, create, test, and improve a first ClawMax agent |
| [STATUS.md](STATUS.md) | Current version, state, and recent releases |
| [planning/RC94_REVIEW_HANDOFF_2026-10-26.md](planning/RC94_REVIEW_HANDOFF_2026-10-26.md) | Historical RC94 reviewer checklist; current PR disposition is in the RC95 preview |
| [planning/RC94_IMAGE_HANDOFF_2026-10-26.md](planning/RC94_IMAGE_HANDOFF_2026-10-26.md) | RC94 test-image monitoring, fixed source identity, local validation evidence, and pending image gates |
| [planning/RC94_SOURCE_SETUP_FIX_2026-10-26.md](planning/RC94_SOURCE_SETUP_FIX_2026-10-26.md) | Source setup/start/update fix, pinned pnpm bootstrap, command guidance, and Mike clean-machine acceptance |
| [planning/DASHBOARD_2_0_DUAL_INSTANCE_GATE_2026-10-12.md](planning/DASHBOARD_2_0_DUAL_INSTANCE_GATE_2026-10-12.md) | Active PR #212, image, MBP14, test10, and Template execution gates |
| [planning/PRE_RC89_MAINTENANCE_PARITY_2026-09-29.md](planning/PRE_RC89_MAINTENANCE_PARITY_2026-09-29.md) | 1.9.10 feature reconciliation into 2.0, focused evidence and pre-RC89 acceptance |
| [LESSONS_LEARNED_2026-09-27.md](LESSONS_LEARNED_2026-09-27.md) | Hackathon recap, Cognee4 canary evidence, pending branches and next-day owners |
| [recap/](recap/) | Historical repository recaps; current team recaps are in the shared `~/Desktop/Maximilien AI LLC/docs/recaps` directory |
| [planning/WEEK_2026-09-28.md](planning/WEEK_2026-09-28.md) | Soft Dashboard priorities for 1.9.10 search, AI guide, Google sign-in, and PR triage |
| [planning/RC85_RELEASE_GATE_2026-09-23.md](planning/RC85_RELEASE_GATE_2026-09-23.md) | Historical RC85 candidate scope, engineering gate and Mike acceptance |
| [planning/RC83_COVERAGE_AND_RUNTIME_2026-09-22.md](planning/RC83_COVERAGE_AND_RUNTIME_2026-09-22.md) | RC83 branch coverage, isolated runtime validation, image and acceptance gates |
| [planning/RC82_CLI_DEPLOYMENT_HANDOFF_2026-09-22.md](planning/RC82_CLI_DEPLOYMENT_HANDOFF_2026-09-22.md) | Published RC82 evidence and unresolved installed-instance deployment blockers |
| [BACKLOG.md](BACKLOG.md) | Prioritized backlog, sprint items, and roadmap |
| [TESTING_GUIDE.md](TESTING_GUIDE.md) | Unit, API, integration, and manual testing guide |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Active bugs and limitations |
| [OAUTH_SETUP.md](OAUTH_SETUP.md) | GitHub OAuth configuration guide |
| [SECURITY.md](SECURITY.md) | Security architecture and policies |
| [specs/ENTERPRISE_SESSION_BOOTSTRAP.md](specs/ENTERPRISE_SESSION_BOOTSTRAP.md) | Enterprise Web/gateway to Dashboard session bridge v0.1 |
| [security/SECURITY_REVIEW_2_0_RC38.md](security/SECURITY_REVIEW_2_0_RC38.md) | 2.0 source security sign-off and pending final-candidate appendix |
| [security/SECURITY_FINDINGS_2_0.md](security/SECURITY_FINDINGS_2_0.md) | Remediated and accepted 2.0 security findings |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | Pre-release verification steps |
| [planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md](planning/RELEASE_2_0_0_LAUNCH_2026-08-24.md) | Accepted RC46 evidence and remaining `2.0.0` promotion gates |
| [planning/RC75_RUNTIME_ACCEPTANCE_2026-09-14.md](planning/RC75_RUNTIME_ACCEPTANCE_2026-09-14.md) | RC75 cloud/on-prem runtime evidence and remaining deployment and lifecycle gates |
| [planning/RC76_STABILITY_IMAGES_2026-09-15.md](planning/RC76_STABILITY_IMAGES_2026-09-15.md) | RC76 stability candidate, passed release gate, image build handoff, and remaining acceptance |
| [planning/RC77_STABILITY_AND_CHAT_2026-09-16.md](planning/RC77_STABILITY_AND_CHAT_2026-09-16.md) | RC77 sign-in, skill feedback, chat download/contrast, validation evidence, and rollout gates |
| [planning/RC78_BYOK_AND_CLOUD_2026-09-17.md](planning/RC78_BYOK_AND_CLOUD_2026-09-17.md) | RC78 BYOK sizing, cloud execution availability, release validation, and image gates |
| [planning/RC79_RUNTIME_2026-09-17.md](planning/RC79_RUNTIME_2026-09-17.md) | RC79 gateway startup/health fixes, local model diagnosis, and remaining release gates |
| [planning/RC80_DOCUMENT_PDF_2026-09-17.md](planning/RC80_DOCUMENT_PDF_2026-09-17.md) | RC80 source-only document PDF feature, validation evidence, limits, and pending release gates |
| [planning/RC80_STABILITY_AND_TEMPLATE_GATE_2026-09-18.md](planning/RC80_STABILITY_AND_TEMPLATE_GATE_2026-09-18.md) | Template-first repeatable stability gates, executed foundation tests, and Dashboard/CLI contract gaps |
| [planning/RC80_DASHBOARD_CLI_TEMPLATE_HANDOFF_2026-09-18.md](planning/RC80_DASHBOARD_CLI_TEMPLATE_HANDOFF_2026-09-18.md) | Tested portable Template catalog contract, real CLI interoperability, and remaining Dashboard lifecycle gates |
| [planning/RC85_TEMPLATE_CLI_HANDOFF_2026-09-23.md](planning/RC85_TEMPLATE_CLI_HANDOFF_2026-09-23.md) | RC85 source checkpoint: instance catalog import/export, conditional staged lifecycle, public paths, replay rules, and open acceptance gates |
| [planning/RC81_CLI_RC6_CHAT_HANDOFF_2026-09-20.md](planning/RC81_CLI_RC6_CHAT_HANDOFF_2026-09-20.md) | Public RC6 chat submission fix, isolated strict-client evidence, and remaining Workflow/runtime acceptance gates |
| [planning/RC70_TEST10_RUNTIME_HANDOFF_2026-09-11.md](planning/RC70_TEST10_RUNTIME_HANDOFF_2026-09-11.md) | RC69 test10 evidence and RC70 gateway, lifecycle, storage, identity, and Operations API gates |
| [planning/MINI_SPRINT_AI_BUILDER_CHANNELS_COVERAGE_2026-08-31.md](planning/MINI_SPRINT_AI_BUILDER_CHANNELS_COVERAGE_2026-08-31.md) | Active two-day target with separate AI Builder, Telegram, Discord, and Slack candidates plus 71.2% branch coverage |
| [DEMO_VIDEOS.md](DEMO_VIDEOS.md) | Local demo video inventory and when to use it |
| [planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md](planning/PUBLIC_PLUGIN_ARCHITECTURE_2_0.md) | Active public 2.0 plugin and AI-scoring plan |
| [planning/PUBLIC_LIFECYCLE_PLUGIN_2_0.md](planning/PUBLIC_LIFECYCLE_PLUGIN_2_0.md) | Active public Lifecycle plugin plan for deep agent/workflow inspection |
| [planning/PUBLIC_MODEL_FIT_2_0.md](planning/PUBLIC_MODEL_FIT_2_0.md) | Active public explainable model-fit and evidence-backed recommendation plan |
| [planning/PUBLIC_SCORE_ACTIONS_2_0.md](planning/PUBLIC_SCORE_ACTIONS_2_0.md) | Shared score details, improvement suggestions, confirmed actions, audit, and undo |
| [planning/PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md](planning/PUBLIC_MODELS_GATEWAYS_EMAIL_2_0.md) | Active public Gmail and Microsoft 365 partner plan; records shipped model-provider decisions |
| [planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md](planning/PUBLIC_ACTIVITY_EXPORT_PARTNERS_2_0.md) | Public consent-gated activity export contract, ClawMax.ai reference receiver, and Digo integration plan |
| [../../PARTNERS/README.md](../../PARTNERS/README.md) | Partner contribution guide with shipped examples and the catalog-versus-activity-sharing boundary |
| [../../PLUGINS/README.md](../../PLUGINS/README.md) | Public plugin overview, creation entry point, examples, and plugin-versus-partner guidance |
| [../../PLUGINS/PLUGIN_SYSTEM_2_0.md](../../PLUGINS/PLUGIN_SYSTEM_2_0.md) | Public 2.0 plugin-host architecture and acceptance boundary |
| [../../PLUGINS/PLUGIN_AUTHORING_2_0.md](../../PLUGINS/PLUGIN_AUTHORING_2_0.md) | Declarative 2.0 plugin authoring contract |
| [../../PLUGINS/public/clawmax-lifecycle/README.md](../../PLUGINS/public/clawmax-lifecycle/README.md) | Public Lifecycle plugin scope and safety boundary |
| [../../PLUGINS/public/clawmax-review/README.md](../../PLUGINS/public/clawmax-review/README.md) | Public Review plugin purpose and evidence boundary |
| [architecture/DASHBOARD_RUNTIME_SPLIT.md](architecture/DASHBOARD_RUNTIME_SPLIT.md) | Investigation note for the 2-container vs 3-container dashboard runtime split |

## Specifications (External)

| Spec | Repository |
|------|------------|
| [TEMPLATE.md Format](https://github.com/Maximilien-ai/templates/blob/main/spec/template-spec.md) | [Maximilien-ai/templates](https://github.com/Maximilien-ai/templates) |
| [WORKFLOW.md Format](https://github.com/Maximilien-ai/workflows/blob/main/spec/workflow-spec.md) | [Maximilien-ai/workflows](https://github.com/Maximilien-ai/workflows) |

## Hackathon Notes

| Event | Date | Plan |
|-------|------|------|
| [Deep Agents Hack](hacks/deep-agents-hack/PLAN.md) | March 27, 2026 | Template wizard, 14 templates, Shipables |
| [Multimodal Frontier Hack](hacks/multimodal-frontier-hack-mar28/PLAN.md) | March 28, 2026 | Research desk template, multimodal |
| [OpenClaw Hack Day](hacks/openclaw-hack-day-mar25/SESSION_SUMMARY.md) | March 25, 2026 | RAG team, weave-cli skills |

## Other

| Directory | Contents |
|-----------|----------|
| `architecture/` | System design docs |
| `features/` | Feature design docs |
| `operations/` | Ops and deployment guides |
| `planning/` | Active 2.0 plans only; completed and superseded plans live in `planning/archive/` |
| `testing/archive/` | Historical release-specific manual validation records |
| `presentations/` | Demo, talk, and workshop materials; latest deck: `mango-grove-estate-workshop-jul-2026/index.html` |
| `videos/archive/` | Historical workflow and add-agent recordings; current 2.0 replacement videos are still planned |
| `archive/` | Historical docs no longer actively maintained |
| `planning/archive/` | Completed and superseded execution plans |

## Development notes

- [Agent runtimes](planning/AGENT_RUNTIMES.md) — in-progress implementation notes; not a supported-feature guarantee.
- [RC96 local acceptance](planning/RC96_PREVIEW_ACCEPTANCE_2026-10-28.md) — candidate scope, exclusions and six independent acceptance checks.
