# Public Lifecycle Plugin 2.0

> Status: V1 agent/workflow/group/community X-rays implemented; follow-through remains
> Target: `2.0.0`
> Last updated: August 3, 2026

## Purpose

Lifecycle gives a user one read-only X-ray view of an agent, workflow, group,
or community over
time. It should answer what the object is, how it is configured, what it did,
which files and outputs it produced, and what changed without requiring the user
to assemble that history from several dashboard tabs.

Lifecycle is a public demonstration of the generic plugin contract. It is not an
enterprise policy, evaluation, or optimization product.

## V1 Scope

- Select and compare one or more agents, workflows, groups, or communities from
  the current workspace.
- Switch between overview, activity, artifacts, and configuration focus areas.
- Choose a bounded time window and optionally include archived evidence.
- Present identity, current status, recent runs or conversations, files,
  outputs, model/configuration changes, and compressed proportional timelines.
- Clearly label missing, unavailable, or permission-restricted evidence.
- Support desktop, mobile, light/dark themes, empty states, and export of a
  redacted inspection summary.

## Safety Boundary

- V1 is diagnostic and read-only. It does not edit an agent, reschedule a
  workflow, rerun work, change a model, or delete an artifact.
- Secret values, broker ciphertext, raw credentials, and unrelated workspace
  content never appear in Lifecycle.
- Conversation or prompt content follows the same user and workspace access
  rules as its source surface and must be redacted in exports.
- Every link or future action is permission checked by the host; loading the
  plugin does not grant additional access.

## Delivery

1. Completed: public manifest, seven focused suggestions, multi-object selection,
   and dedicated relationship/X-ray rendering.
2. Completed: read-only agent/workflow/group/community timeline adapters with
   stable event types, clickable evidence, and long-gap compression.
3. Follow through: add source links plus richer artifact/output ownership,
   MIME/type metadata, and safe DocHub navigation.
4. Follow through: add redacted summary export and evidence-backed adapters for
   skills and templates. Communication evidence is included in V1 for groups
   and communities.
5. Validate large histories, missing/deleted targets, workspace switching,
   restart persistence, and responsive layout before the 2.0 release gate.

## Acceptance

- The public image discovers Lifecycle and Review without private plugin paths.
- Dev discovers the same public plugins plus local private plugins when the
  sibling `clawmax-plugins` repository is present.
- Selecting an object never exposes records outside the active workspace.
- Disabling Lifecycle removes its navigation cleanly while preserving its saved
  state; re-enabling restores it.
- Lifecycle contains no Evals, Guardrails, or Optimize product catalog or rules.
