# Manual Release Smoke Checklist

Use this after images/assets are built and before pushing a release broadly to customers.

This file is intended to be edited directly during testing.

Conventions:
- change `[ ]` to `[x]` when complete
- change `[ ]` to `[!]` by adding a note line if something failed
- use `[-]` for not applicable
- add short notes directly under any item

Template use:
- keep this file as the reusable master checklist
- for a specific release, duplicate it and rename it with the release number/date if you want a permanent testing record

---

## Release Metadata

- [ ] Fill in release metadata
  - Version:
  - Date:
  - Tester:
  - Environment:
  - Image/tag:

Notes:

---

## 1. Runtime Identity

- [ ] Dashboard visible version matches the release under test
  - Observed:

- [ ] `/api/system` reports the expected version
  - Observed:

- [ ] `/api/system` reports the expected deployment kind
  - Observed:

- [ ] `/api/system` reports the expected instance label
  - Observed:

- [ ] `/api/system` reports the expected runtime platform
  - Observed:

- [ ] Expected runtime defaults are correct
  - Check when relevant:
    - `defaultOllamaBaseUrl`
    - `defaultOpenAiCompatibleBaseUrl`
  - Observed:

Notes:

---

## 2. Startup / Auth / Session

- [ ] Dashboard loads without blank screen or infinite spinner
  - Observed:

- [ ] Auth mode is the expected one for this environment
  - Expected:
  - Observed:

- [ ] Login succeeds
  - Observed:

- [ ] Logout succeeds
  - Observed:

- [ ] Page reload preserves a healthy session state
  - Observed:

Notes:

---

## 3. Builder

- [ ] Single-agent prompt routes correctly
  - Prompt: `Create one agent to triage support emails and draft replies for me`
  - Observed:

- [ ] Team prompt routes correctly
  - Prompt: `Create a team of agents to run weekly podcast production`
  - Observed:

- [ ] Company prompt routes correctly
  - Prompt: `Create a company of agents with leadership, recruiting, operations, and finance teams`
  - Observed:

- [ ] Skill follow-through prompt routes correctly
  - Prompt: `Give my newsletter summarizer agent Slack and Gmail access`
  - Observed:

- [ ] `AI Generate Agent` opens with the original Builder prompt prefilled
  - Observed:

- [ ] Builder session save/download still works
  - Observed:

Notes:

---

## 4. AI Prompt Editor

- [ ] Shared AI prompt editor opens normally from a real surface
  - Surface used:
  - Observed:

- [ ] `Expand with AI` inserts expanded content back into the editor
  - Observed:

- [ ] Markdown preview matches the raw markdown reasonably
  - Observed:

- [ ] Preview/editor split can be resized
  - Observed:

- [ ] Double-clicking the divider resets preview width
  - Observed:

Notes:

---

## 5. Agents

- [ ] Agents surface renders cleanly
  - Observed:

- [ ] Plain agent creation works
  - Agent created:
  - Observed:

- [ ] `AI Generate Agent` creation works
  - Agent created:
  - Observed:

- [ ] Existing agent detail/edit flow renders cleanly
  - Agent used:
  - Observed:

- [ ] Created/edited agent appears immediately without manual refresh
  - Observed:

- [ ] Model/default-model behavior is correct if touched in this release
  - Observed:

Notes:

---

## 6. Skills

- [ ] Skills page uses wide screens well
  - Observed:

- [ ] On Linux/on-prem/cloud, obvious macOS-only built-ins are hidden
  - Observed:

- [ ] On macOS, macOS-only built-ins still appear where expected
  - Observed:

- [ ] Install/setup guidance matches the runtime OS
  - Observed:

- [ ] Registry filtering hides obviously incompatible results for this runtime
  - Observed:

- [ ] Imported or installed skill preserves correct platform-specific guidance
  - Skill used:
  - Observed:

- [ ] Skill assignment to an agent works and sticks
  - Agent:
  - Skill:
  - Observed:

- [ ] One real skill-backed action works if gateway/runtime supports it
  - Skill/action used:
  - Observed:

Notes:

---

## 7. Templates

- [ ] Templates page loads system/workspace templates normally
  - Observed:

- [ ] One known-good organization template applies successfully
  - Template:
  - Observed:

- [ ] Applied template creates expected agents/workflows/groups/communities
  - Observed:

- [ ] Reapply or apply-with-prefix flow behaves correctly
  - Observed:

- [ ] Readiness/conflict guidance is clear and correct
  - Observed:

- [ ] Template customization affects the result correctly when applicable
  - Observed:

Notes:

---

## 8. Workflows

- [ ] Workflows page renders cleanly
  - Observed:

- [ ] One workflow can be created or triggered manually
  - Workflow:
  - Observed:

- [ ] Workflow progress/status updates appear
  - Observed:

- [ ] DAG/downstream progression still works when applicable
  - Observed:

- [ ] One workflow output/result artifact is accessible
  - Observed:

Notes:

---

## 9. Communications

- [ ] Communications page renders cleanly
  - Observed:

- [ ] Group chat opens and sends one message successfully
  - Group:
  - Observed:

- [ ] Community chat opens successfully
  - Community:
  - Observed:

- [ ] Unread/message counts behave reasonably
  - Observed:

Notes:

---

## 10. Organization

- [ ] Organization page renders clearly
  - Observed:

- [ ] `Expand All` works across intended sections
  - Observed:

- [ ] `Collapse All` works across intended sections
  - Observed:

- [ ] Organization state still makes sense after apply or workspace switch
  - Observed:

Notes:

---

## 11. DocHub / Documents

- [ ] Documents / DocHub tree loads
  - Observed:

- [ ] One markdown document opens correctly
  - Document:
  - Observed:

- [ ] One generated workflow or agent artifact opens correctly
  - Artifact:
  - Observed:

- [ ] Agent/workflow-created files appear in the expected sections
  - Observed:

Notes:

---

## 12. Chat / Gateway

- [ ] One normal agent chat succeeds
  - Agent:
  - Observed:

- [ ] Chat response renders without transcript junk or raw runtime metadata
  - Observed:

- [ ] One gateway/skill-backed request succeeds when expected
  - Observed:

- [ ] Gateway-dependent failures are clear rather than hanging
  - Observed:

Notes:

---

## 13. Notifications / Activity / Budget / Logs

- [ ] Notifications panel renders correctly
  - Observed:

- [ ] At least one notification can be inspected or exercised
  - Observed:

- [ ] Activity view shows recent entries
  - Observed:

- [ ] Budget/usage values look plausible for the environment
  - Observed:

- [ ] System/Logs load correctly
  - Observed:

Notes:

---

## 14. Workspace Switching

- [ ] Switching between at least two workspaces works
  - Workspaces used:
  - Observed:

- [ ] Header/count state updates correctly after switching
  - Observed:

- [ ] Builder/Agents/Templates/Skills do not show stale cross-workspace data
  - Observed:

Notes:

---

## 15. Installer / Setup / Update / Uninstall

Run only where appropriate. Do not use uninstall on a development machine unless you intend to remove the install.

- [ ] Latest installer smoke succeeds
  - Command used:
  - Observed:

- [ ] Pinned installer smoke succeeds
  - Command used:
  - Observed:

- [ ] Setup completes without unexpected prompts
  - Observed:

- [ ] Update flow works when applicable
  - Observed:

- [ ] Uninstall works on a disposable or packaged-install machine
  - Observed:

- [ ] Podman orphan residue is removed when applicable
  - Observed:

Notes:

---

## 16. Release Decision

- [ ] I am comfortable deploying this release to broader internal environments
  - Notes:

- [ ] I am comfortable deploying this release to customers
  - Notes:

- [ ] Any failing items are documented clearly enough to reproduce
  - Notes:

Blocking issues:

Non-blocking issues:

Follow-up release target:
