# Team handoffs and documentation

Required for cross-team coordination, recurring recaps, documentation maintenance, and handoffs. Incorporated by [AGENTS.md](../../../AGENTS.md).

## Team Identity And Handoffs

- In this repository, act as the **Dashboard team**. Own public Dashboard code,
  tests, release evidence, and documentation here. Treat CLI and Web as separate
  teams with their own implementation and deployment authority; do not report
  their handoffs as Dashboard-completed work or infer a live fleet change from a
  shared file.
- Coordinate through the active shared Dashboard/CLI/Web handoff directory under
  `/Users/maximilien/Desktop/Maximilien AI LLC/docs/`. Verify the folder containing
  the current `HANDOFF_CONVENTION.md`, `HANDOFF_TEMPLATE.md`, and latest replies
  before writing; do not assume a renamed or synced `handoffs` folder is current.
  Follow that convention for dated `YYYYMMDDTHHMMSSZ_From-to-To_issue-id.md` files.
  Include sender, recipient, time, priority, topic, status, exact source/image
  identity, evidence, requested action, and acceptance criteria. Read newer
  replies first. Keep secrets and raw participant data out of handoffs.

## Documentation Maintenance

- Every Sunday PM or Monday AM, write a concise weekly recap in
  `/Users/maximilien/Desktop/Maximilien AI LLC/docs/recaps/YYYY-MM-DD_DASHBOARD_WEEKLY_RECAP.md`,
  using the Monday that starts the reviewed week. Keep it to two or three
  readable pages. Summarize verified
  outcomes, what went well (WWR), what went wrong (WWW), lessons, open evidence,
  and a short, explicitly soft plan for the coming week. Link separate event or
  hackathon recaps instead of repeating them. Check commits, release evidence,
  active backlog, and known issues; distinguish source completion, CI/image
  validation, deployment, and user acceptance. Do not infer current runtime
  state from an old handoff.
- At each month end, add
  `/Users/maximilien/Desktop/Maximilien AI LLC/docs/recaps/YYYY-MM_DASHBOARD_MONTHLY_RECAP.md`
  to synthesize that month's weekly recaps, trend in outcomes and WWR/WWW, unresolved
  patterns, and a few process changes for the next month. Keep any shared recap
  index ordered by date, newest first. Treat plans as suggestions that can change
  with meetings, testing, and new priorities.

- Audit active documentation when a stable release is promoted, a major release
  changes phase, or release feedback materially changes the roadmap.
- Keep `README.md`, `CHANGELOG.md`, `SYSTEM/docs/STATUS.md`,
  `SYSTEM/docs/KNOWN_ISSUES.md`, `SYSTEM/docs/BACKLOG.md`, and the documentation
  index aligned on the stable version, active development line, and release
  boundary.
- Move completed or superseded release plans and validation checklists into the
  appropriate archive. Preserve useful history, but do not leave shipped work
  presented as an active plan or backlog item.
- Update archive indexes and links as part of the same change. Do not close or
  archive a partially completed issue solely because one implementation phase
  shipped; retain the remaining concrete work in the active backlog.
