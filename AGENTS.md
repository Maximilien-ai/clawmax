# Repository Instructions

## Commit Messages

- Every commit subject must start with a lowercase Conventional Commit-style
  prefix followed by a colon and a space.
- Use the narrowest applicable prefix: `feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `build:`, `ci:`, `chore:`, `release:`, or `merge:`.
- Keep the subject concise and describe the user-visible or engineering outcome.
- Do not publish an unprefixed commit subject. Check the proposed subject before
  committing, especially for release-candidate work pushed directly to `main`.

## Repository Ownership

- Keep public host contracts, generic dashboard components, public plugins, and
  public scoring logic in this repository.
- Keep proprietary plugin manifests, suggested items, implementation details,
  and plugin-specific tests in their owning private repositories. Package them
  through the private aggregator; never copy private source into this repository
  or the public image.
- Review and Optimize are the only public product plugins in the current 2.0
  phase. Treat `PLUGINS/test/plugin-lab-*` as synthetic contract fixtures only;
  they must not contain or become copies of private product implementations.
- Keep every other plugin private unless its ownership is explicitly changed.
  Public documentation may describe the generic host boundary, but must not
  enumerate private plugin items, rules, prompts, schemas, or implementation
  details.
- A plugin can represent any ClawMax extension domain. Do not design generic
  plugin APIs or UI around assumptions that all plugins are guardrails or evals.

## Product Language And State

- Reserve `template` for ClawMax agent, organization, and workflow templates.
  Plugin starter content should be presented as `Suggested`, `Use`, or another
  domain-specific action rather than `Use Template`.
- Distinguish suggested plugin items from selected workspace items. Selected
  items must be editable and their active, running, completed, failed, or
  blocked state must remain visible.
- User-visible operations must persist lifecycle evidence appropriate to the
  domain, such as run history, activation history, scores, progress, targets,
  notifications, notes, or evidence. Do not expose an action without a way to
  see what happened afterward.
- Treat the Agents page as the dashboard layout contract for plugin tabs:
  preserve its header hierarchy, view-control placement, action menus, filters,
  responsive stacking, and distinct grid, detail, list, and relationship
  presentations. View controls must affect every visible collection they imply,
  including suggested items, and each item must expose inspectable details.
- Keep release review files separated by release while carrying forward all
  still-relevant prior checks. New RC coverage should accumulate without
  silently removing earlier acceptance criteria.

## Tests And Release Validation

- Treat transcript, prompt, conversation, and user-activity export as sensitive
  data egress. It must be disabled by default, explicitly consented per affected
  user, scoped to a named destination and purpose, visibly indicated while
  active, redacted before durable storage, revocable immediately, and delivered
  asynchronously so partner failure cannot block normal product behavior.
- Configuring a partner is not user consent. Never silently reuse consent when
  the destination, purpose, scopes, identity fields, or disclosure version
  changes, and never expose a general transcript-reading capability to plugins.
- Add or update focused tests for every behavior change, including error,
  persistence, and responsive presentation paths where applicable. Improve
  coverage with each change rather than relying only on existing tests.
- Run TypeScript and the directly affected unit/contract suites while
  iterating. Before an RC, run the complete integration, validation, and
  coverage suite.
- Visually audit changed pages, dialogs, pop-ups, cards, lists, and graphical
  views at desktop and mobile widths. Check long text, scrolling, sticky
  actions, progress states, and empty/error states.
- For public/private combined RCs, verify amd64 and arm64 image builds, registry
  smoke tests, packaged version identity, plugin discovery, restart persistence,
  and the public/private source boundary before reporting the release ready.
- Record the observed or documented duration before starting a long-running CI,
  image, deployment, or test job. Do not continuously poll it.
- Check once near half the expected duration to catch an early failure. If the
  job is still healthy, check next at the expected completion time plus one
  minute. Only use additional sparse checks when the job exceeds that window or
  a known failure needs investigation.
- When waiting on local test processes, use long yielded waits and small output
  budgets. Report the failure or final summary instead of repeatedly relaying
  routine progress output.
- Before handoff, commit and push every owning repository with an approved
  lowercase prefix, record the relevant SHAs and CI links, and verify that no
  task-created changes remain uncommitted.

## Documentation Maintenance

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
