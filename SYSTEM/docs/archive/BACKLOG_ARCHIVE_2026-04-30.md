# Backlog Archive — April 30, 2026

Archived from `SYSTEM/docs/BACKLOG.md` when the active planning surface moved to the `1.4.0 Monday Release Focus`.

## Today Focus — April 2, 2026

- [x] **AI-assisted template/workflow discovery suggestions** — when exact or strong search matches are missing, show similar templates/workflows and AI recommendations instead of a dead end. GitHub: `#81`
- [ ] **Agent-to-agent direct messaging follow-through** — validate the post-merge user path on top of the new direct messaging API and close any UX/runtime gaps. GitHub: `#64`
- [x] **Template schema validation on import** — validate imported `TEMPLATE.md` / `template.json` against the public contract before save. GitHub: `#87`
- [x] **Default channel fan-out** — group and community chat now goes to all members by default unless the user narrows with explicit `@mentions`. GitHub: `#92`
- [x] **Agent chat streaming improvement** — agent chat now streams live stdout deltas through SSE and keeps explicit dashboard session continuity. GitHub: `#15`
- [x] **Event planning proposal templates** — added small, medium, and large event-planning templates plus an `Events` discovery filter in the Templates page. GitHub: `#95`

Open follow-through items from this section remain in the active backlog under `Active Product Work`.

## April Launch Readiness

### Immediate Demo / Release Blockers

- [ ] **OAuth clean-room auth test** — GitHub OAuth verified locally; still run end-to-end on a fresh machine/config and document exact setup failures
- [x] **Audit `./setup.sh` after OTP/auth changes** — completed a bootstrap audit and aligned local setup with the tested OpenClaw runtime pin, added generated `JWT_SECRET` for OTP/GitHub auth modes, and guarded macOS-only gateway service install behavior so Linux/dev bootstrap no longer assumes `launchctl`.
- [x] **Workspaces Integrations live validation pass** — run the full integrations flow on a freshly restarted dashboard: save local settings, verify Senso/GitHub defaults flow into template apply, and confirm key-validation fallback vs. live validation behavior is understandable. GitHub: `#75`
- [x] **Workspaces Integrations deeper runtime follow-through** — non-secret workspace defaults now persist per workspace and flow through template apply plus workflow execution inputs/runtime context. Keep the live end-to-end verification pass as a separate launch-readiness item. GitHub: `#77`
- [ ] **Security follow-through** — re-check auth-required API coverage, cookie/session behavior, and production env defaults after OAuth rollout

### Security

- [ ] **Google/Apple auth** — add after GitHub (lower priority for v1)

### Cost Management

- [x] **Per-agent cost limits** — individual agent limits (currently workspace-level only)
- [x] **Cost notifications** — toast/alert when approaching limits, email notification option
- [x] **Cost dashboard refinement** — per-workflow cost breakdown, daily/weekly trends. GitHub: `#78`

### Backup & Restore

- [ ] **Workspace backup** — zip workspace + config, downloadable from UI. Trigger manually or schedule.
- [x] **Workspace restore** — ZIP import/restore shipped in the workspace switcher for exported workspace archives. Keep follow-through on compatibility, conflict handling, and cloud validation.
- [ ] **Auto-backup** — optional scheduled backups (daily/weekly)

### Customer-Facing Visibility

- [x] **Workspace summary dashboard** — shareable one-page live workspace view for consumers, not just builders. Include overview cards, costs/budget, agent status, active notifications, workflow now/history/next run, kickoff input summary, and recent result links. Support section selection at generation time and persistent copy/open/delete management for generated links. Spec: `SYSTEM/docs/features/WORKSPACE_SUMMARY_DASHBOARD.md`
- [x] **Workspace dashboard compact charts** — added compact-mode segmented summary bars for agent status, workflow state, and notification severity so stakeholder views fit closer to one screen without relying only on text.
- [x] **Workflow input normalization for dashboards** — kickoff/project configuration summaries now prefer structured workflow configuration extraction over raw execution-log tails.
- [x] **Workflow output + artifact normalization for dashboards** — shared dashboards now normalize participant-result summaries plus labeled artifact links and workspace file references into a consistent result surface.
- [x] **Workspace dashboard compact reorder bug** — compact layout editor now supports reliable same-column upward reordering without falling through to the column-level append target.

Open launch, auth, backup, and dashboard follow-through items remain in the active backlog under `Active Product Work`.
