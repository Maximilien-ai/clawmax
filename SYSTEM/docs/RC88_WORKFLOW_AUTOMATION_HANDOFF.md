# RC88 dev workflow automation handoff

Implementation: `e7e5581c` (persisted settings and scheduling), `7a756086`
(editor details, readable selections, timezone persistence, desktop/mobile tests).

## Verified scope

The isolated dev Template adapter now supports editing names, descriptions,
instructions, cron expressions, timezones, and schedule enablement. Edits are
persisted separately from the immutable imported Template, bound to its actor
and revision. Participant changes still require a revised Template. Normal
workflows retain their existing editing path.

The editor loads complete workflow details rather than relying on list summaries,
preserves timezone on save, and displays Group names while retaining their IDs.
Scheduled dev execution uses the same authority-checked two-stage runtime as
manual execution. It never installs a second Gateway cron for the Template.
Disabled schedules, pipeline pause, unavailable runtime, and revoked authority
prevent scheduled execution. Manual runs remain available independently.

Every successful dev run saves a run-specific Markdown brief and updates
`ORG/reports/<workflow-name-and-id>/latest-brief.md`. Failed runs do not replace
the latest successful brief. Execution history exposes the saved brief and
manual/scheduled trigger type. Last-run success is independent of schedule state.

## Maximilien.ai package changes requested

- Daily account operations: daily at 09:00, `0 9 * * *`.
- Daily site health: daily at 09:00, `0 9 * * *`.
- Relationship follow-up: Mondays at 09:00, `0 9 * * 1`; rename it Weekly
  relationship follow-up if adopting this cadence.
- Timezone: `America/Los_Angeles`, not a fixed UTC offset.
- Keep the Collector followed by the appropriate specialist Group, with exact
  unambiguous artifact references and readable Group display names.
- Ask each specialist for a concise Markdown brief containing findings,
  limitations, risks, and recommended next steps based on the Collector report.
- Preserve reference-only credentials and Collector-only Skill assignment.
- Keep portable import inert. Enabling a deployed schedule is a separate user
  action; these schedules are enabled only in the isolated dev rehearsal.
- Recalculate affected artifact digests when repackaging. Do not copy private
  bundles, business reports, or credentials into this public repository or CI.

The current local overlays are not an updated portable ZIP. The Template owner
must incorporate the agreed settings into its authored source and repackage.
This dev runtime is not production execution admission or release sign-off.
Email delivery is not enabled by this change.

## Acceptance

1. Open localhost:5174 and select Maximilien.ai Operations (dev preview).
2. Edit each workflow: verify its two Agents, readable selected Group, schedule,
   timezone, and enabled state. Save, reopen, and refresh to verify persistence.
3. Run manually: history must settle, show the true last-run color, and expose
   the brief. Repeat and verify latest brief advances while prior runs remain.
4. Disable a schedule or pause the pipeline: no cron run should start; manual
   execution remains a separate action.
5. With dev server, host bridge, and authentication available, verify a scheduled
   run reports trigger type scheduled and produces its brief.

Engineering evidence: a real temporary every-minute cron completed both stages
and saved a 2,831-character brief; the daily schedule was restored afterward.
Original imported workflow bytes were unchanged. Focused settings, scheduler,
dev workflow, and workflow route tests passed, alongside TypeScript and frontend
build. Desktop (1440px) and mobile (390px) browser checks passed for selected
participants, schedule/timezone persistence, reopen, and failed-load protection.
The full integration/coverage suite and RC image gates remain pending.
