# Plugin Architecture MVP1 Plan

> Started: June 12, 2026
> Branch: `plugins-mvp1`
> Baseline: `main` after plugin architecture MVP0 merge

## Goal

Take the merged plugin host architecture from MVP0 to a state where:

- the host contract is stable
- the public test plugin remains a reliable fixture
- private plugin repos can move faster without changing host assumptions every day
- CLI/Web teams can realistically prep a private-plugin release track for the `1.9.x` line

This branch should improve infrastructure first. It should not turn private plugins into public release surfaces.

## MVP1 Themes

### 1. Plugin Runtime / Host Contract

- [ ] Speed up plugin page load and repeated plugin discovery where safe.
- [ ] Improve DocHub/file-open behavior for plugin item files and generated docs.
- [ ] Tighten plugin page parity with Agents/Workflows where shared UX is still inconsistent.
- [ ] Add stronger contract docs for markdown item files, templates, actions, and notifications.

### 2. Generic Plugin Capabilities

- [ ] AI Create follow-through for the shared plugin surface.
- [ ] Stronger action contracts:
  - create
  - edit
  - archive
  - delete
  - notify
  - run
- [ ] Better usage/cost/token presentation for plugin types that execute runs.

### 3. Test Plugin

- [ ] Keep the packaged test plugin as the only in-repo plugin fixture.
- [ ] Expand contract fixtures so host regressions can be detected without private repos.
- [ ] Ensure zero-plugin mode stays fully supported.

### 4. Private Plugin Readiness

The host repo should stay generic, but MVP1 should make it easier for private plugin repos to implement:

- markdown-backed objects with front matter
- richer run artifacts
- AI-assisted creation
- stronger tests
- packaging expectations

### 5. Tests

- [ ] Increase visible plugin helper/route/contract coverage as host behavior expands.
- [ ] Add explicit regression coverage for:
  - zero-plugin mode
  - plugin item markdown files
  - template apply
  - file-open / DocHub routing
  - plugin action flows

## Private Follow-Through (Tracked Here, Implemented Outside Host Repo)

Private repos can continue against the stable host contract with focus on:

1. AI create
2. stronger tests
3. first real one-agent runtime behavior
4. packaging

Keep those repo-specific details out of the public host release notes.

## Best First Bets

If time is short, start here:

1. plugin load speed / caching
2. DocHub file-open polish
3. action-contract tests
4. shared plugin surface parity with Agents

## Explicitly Out Of Scope

- public release of private plugin surfaces
- marketing/docs that name unreleased private plugins in the host repo
- broad remote plugin bundle loading beyond current host-managed model
