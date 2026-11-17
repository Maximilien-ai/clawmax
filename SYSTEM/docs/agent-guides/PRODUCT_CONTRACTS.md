# Product and ownership contracts

Required for product, UI, plugin, scoring, and data-export work. These rules are incorporated by [AGENTS.md](../../../AGENTS.md).

## Repository Ownership

- Keep public host contracts, generic dashboard components, public plugins, and
  public scoring logic in this repository.
- Keep first-party proprietary plugin manifests, suggested items,
  implementation details, and plugin-specific tests in the private
  `clawmax-plugins` monorepo. Partner-owned or customer-specific plugins may
  remain separate when they require different access controls. Never copy
  private source into this repository or the public image.
- Lifecycle and Review are the public product plugins in the current 2.0
  phase. Evals, Guardrails, and Optimize are private enterprise plugins. Treat
  `PLUGINS/test/plugin-*` as synthetic contract fixtures only;
  they must not contain or become copies of private product implementations.
- Keep every other plugin private unless its ownership is explicitly changed.
- Plugin enablement must be manageable from the PLUGINS sidebar as well as
  deployment configuration. Persist an explicit instance selection, including
  the valid empty selection, and never expose synthetic contract fixtures in
  the manager.
  Public documentation may describe the generic host boundary, but must not
  enumerate private plugin items, rules, prompts, schemas, or implementation
  details.
- A plugin can represent any ClawMax extension domain. Do not design generic
  plugin APIs or UI around assumptions that all plugins are guardrails or evals.

## Product Language And State

- Treat prompt-readiness scores and generated-artifact quality scores as
  separate claims. Prompt scoring must explain the rubric, update as the user
  edits, remain advisory rather than blocking generation, and never imply that
  an untested generated artifact is correct or safe.
- Keep baseline prompt scoring local and token-free. Do not persist or export
  raw prompt text as scoring feedback; collect only the minimum disclosed
  metadata unless the user explicitly opts into a separate data-use contract.
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
- Keep release review files separated by release, but put only checks requiring
  independent human judgment or an external environment in the active reviewer
  queue. Unit, integration, browser, source-contract, CI, version, health,
  architecture, and catalog checks are engineering-owned release evidence, not
  reviewer tasks. Every current Review item must state `reviewReason` as either
  `human-judgment` or `external-environment`. Preserve superseded criteria,
  results, notes, evidence, and verifier history in Archived; do not carry
  unfinished old-RC checklists forward as tester work.

## Sensitive Data Export

- Treat transcript, prompt, conversation, and user-activity export as sensitive
  data egress. It must be disabled by default, explicitly consented per affected
  user, scoped to a named destination and purpose, visibly indicated while
  active, redacted before durable storage, revocable immediately, and delivered
  asynchronously so partner failure cannot block normal product behavior.
- Configuring a partner is not user consent. Never silently reuse consent when
  the destination, purpose, scopes, identity fields, or disclosure version
  changes, and never expose a general transcript-reading capability to plugins.
