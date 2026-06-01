# Manual Release Smoke Checklist

Use this after images/assets are built and before pushing a release broadly to customers.

This checklist is intentionally:
- short
- product-surface oriented
- easy to execute manually
- reusable across future releases

How to use it:
- duplicate this file or annotate a local copy for a specific release
- check only the surfaces that changed if you are doing a very small patch
- for larger releases, run the full checklist on at least:
  - local/dev
  - on-prem
  - cloud

Recommended notation:
- `[ ]` not run yet
- `[x]` passed
- `[!]` failed / needs follow-up
- `[-]` not applicable for this environment

Release under test:
- Version:
- Date:
- Tester:
- Environments:

---

## 1. Runtime Identity

- [ ] Open the dashboard and confirm the visible version matches the release under test.
- [ ] Verify `/api/system` reports the expected:
  - version
  - deployment kind
  - instance label
  - runtime platform
- [ ] Confirm the correct environment-specific defaults are present when expected:
  - Ollama base URL
  - OpenAI-compatible base URL

Notes:

---

## 2. Startup / Auth / Session

- [ ] Dashboard loads without a blank screen or infinite spinner.
- [ ] Login/auth path is the expected one for the environment:
  - bypass
  - email OTP
  - GitHub OAuth
- [ ] Logout works and returns to the expected screen.
- [ ] Reloading the page preserves a healthy session state.

Notes:

---

## 3. Builder

- [ ] Single-agent prompt routes correctly.
  - Example: `Create one agent to triage support emails and draft replies for me`
- [ ] Team prompt routes correctly.
  - Example: `Create a team of agents to run weekly podcast production`
- [ ] Company prompt routes correctly.
  - Example: `Create a company of agents with leadership, recruiting, operations, and finance teams`
- [ ] Skill follow-through prompt routes correctly.
  - Example: `Give my newsletter summarizer agent Slack and Gmail access`
- [ ] `AI Generate Agent` opens with the original Builder prompt prefilled.
- [ ] Builder session save/download still works if that surface was touched.

Notes:

---

## 4. AI Prompt Editor

- [ ] Open a shared AI prompt editor from a surface that uses it:
  - Builder
  - Templates
  - Skills
  - Agent generation/refinement
- [ ] Expand a prompt with AI and confirm the expanded content is inserted back correctly.
- [ ] Turn on markdown preview and confirm rendered content matches the raw markdown reasonably.
- [ ] Resize the preview/editor split and confirm the divider works smoothly.
- [ ] Double-click the divider and confirm it resets to the default width.

Notes:

---

## 5. Agents

- [ ] Open the Agents surface and confirm list/grid layout looks healthy.
- [ ] Create one plain agent.
- [ ] Create one agent via `AI Generate Agent`.
- [ ] Open an existing agent and confirm detail/edit flows still render cleanly.
- [ ] Confirm the created/edited agent appears immediately without requiring a manual refresh.
- [ ] If models were touched, verify the visible model/default model behavior is correct.

Notes:

---

## 6. Skills

- [ ] Open the Skills page on a wide screen and confirm it uses width well.
- [ ] On Linux/on-prem/cloud, confirm obvious macOS-only built-ins are hidden.
- [ ] On macOS, confirm macOS-only skills still appear where expected.
- [ ] Confirm install/setup guidance matches the runtime OS:
  - Linux should not show `brew` for Linux-supported skills
  - macOS can show `brew` where appropriate
- [ ] Search/filter the registry and confirm obviously incompatible results are hidden for the current runtime.
- [ ] Import or install one skill and confirm the imported skill still shows the correct platform-specific setup guidance.
- [ ] Assign one skill to one agent and verify the change sticks.
- [ ] If possible, smoke one real skill-backed action with gateway up.
  - Good candidate: GitHub or another known-working skill in that environment

Notes:

---

## 7. Templates

- [ ] Open Templates and confirm system/workspace templates load normally.
- [ ] Apply one known-good organization template.
- [ ] Verify the resulting agents, workflows, groups, and communities appear.
- [ ] Reapply the same template or apply it with a prefix once.
- [ ] Confirm readiness/conflict guidance is clear and correct.
- [ ] If template customization was touched, edit one parameterized field and confirm it affects the result.

Notes:

---

## 8. Workflows

- [ ] Open Workflows and confirm the page renders with the expected controls/layout.
- [ ] Create or trigger one workflow manually.
- [ ] Confirm workflow progress/status updates appear.
- [ ] If DAG workflows are present, confirm downstream progression still works.
- [ ] Open one workflow output/result and confirm the artifact is accessible.

Notes:

---

## 9. Communications

- [ ] Open Communications and confirm the page renders with the expected controls/layout.
- [ ] Open one group chat.
- [ ] Send one message.
- [ ] Open one community chat.
- [ ] Confirm unread/message counts behave reasonably.

Notes:

---

## 10. Organization

- [ ] Open Organization and confirm the overview cards render clearly.
- [ ] Use `Expand All` and `Collapse All`.
- [ ] Confirm those actions affect all intended collapsible sections.
- [ ] Confirm the chart/list still makes sense after template apply or workspace switching.

Notes:

---

## 11. DocHub / Documents

- [ ] Open Documents / DocHub and confirm the tree loads.
- [ ] Open one markdown doc.
- [ ] Open one generated workflow/agent artifact if available.
- [ ] Confirm agent/workflow-created files still appear in the expected sections.

Notes:

---

## 12. Chat / Gateway

- [ ] Open one agent chat and send a normal prompt.
- [ ] Confirm the response renders without transcript junk or raw runtime metadata.
- [ ] If gateway-backed skills are expected, run one skill-backed request.
- [ ] If gateway diagnostics changed, confirm gateway-dependent surfaces fail clearly rather than hanging.

Notes:

---

## 13. Notifications / Activity / Budget / Logs

- [ ] Open Notifications and confirm the panel renders.
- [ ] Trigger or inspect at least one notification.
- [ ] Open Activity and confirm recent entries appear.
- [ ] Open Budget/usage and confirm values look plausible for the environment.
- [ ] Open System/Logs and confirm logs load and refresh/export still works if relevant.

Notes:

---

## 14. Workspace Switching

- [ ] Switch between at least two workspaces.
- [ ] Confirm counts/header state update correctly after switching.
- [ ] Confirm Builder/Agents/Templates/Skills do not show obviously stale data from the previous workspace.

Notes:

---

## 15. Installer / Setup / Update / Uninstall

Run only where appropriate. Do not use uninstall on a development machine unless you intend to remove the install.

- [ ] Latest installer smoke:
  - `curl -fsSL https://github.com/Maximilien-ai/clawmax/releases/latest/download/install.sh | bash`
- [ ] Pinned installer smoke for the release under test.
- [ ] Confirm setup completes without blocking on unexpected interactive prompts.
- [ ] Confirm update flow works if you maintain an existing install.
- [ ] On a disposable or packaged-install machine, run uninstall once.
- [ ] If Podman is involved, confirm orphaned `efi-bl-*` / `*-ignition.sock` residue is removed.

Notes:

---

## 16. Release Decision

- [ ] I am comfortable deploying this release to broader internal environments.
- [ ] I am comfortable deploying this release to customers.
- [ ] Any failing items are documented with enough detail to reproduce.

Blocking issues:

Non-blocking issues:

Follow-up release target:

