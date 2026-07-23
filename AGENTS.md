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

## Tests And Release Validation

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
- Poll long-running image and deployment jobs at intervals appropriate to their
  expected duration, usually two to five minutes for a 15-minute build. Do not
  burn time or tokens with rapid status refreshes.
- Before handoff, commit and push every owning repository with an approved
  lowercase prefix, record the relevant SHAs and CI links, and verify that no
  task-created changes remain uncommitted.
