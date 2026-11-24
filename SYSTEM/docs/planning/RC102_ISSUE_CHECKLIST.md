# RC102 issue reduction checklist

Baseline on November 24, 2026: 90 open issues, including 28 high and 41 medium. Closing 18 of the 69 high/medium issues reduces that backlog by 26.1%. A 25% reduction across all 90 would require 23 net closures. Report new and reopened issues separately.

Count a closure once, after engineering verification and user acceptance. Record the change, tests, acceptance and feedback disposition against the issue.

## Proposed acceptance batches

- Workflow execution and results — #438, #437, #439, #338, #249
- Agent creation, models and history — #440, #420, #441, #331, #315
- Logs and spending — #359, #360, #361, #362
- Documents and workspace navigation — #365, #382, #381, #350

## High priority

- [ ] [#440](https://github.com/Maximilien-ai/clawmax/issues/440) fix: investigate 502 failures while changing agent models
- [ ] [#439](https://github.com/Maximilien-ai/clawmax/issues/439) fix: keep delegated sessions within enabled runtime capabilities
- [ ] [#438](https://github.com/Maximilien-ai/clawmax/issues/438) fix: fail workflow runs with empty results or missing required outputs
- [ ] [#437](https://github.com/Maximilien-ai/clawmax/issues/437) fix: validate runtime model support before execution
- [ ] [#420](https://github.com/Maximilien-ai/clawmax/issues/420) bug: recover legacy native chats after identity or model changes
- [ ] [#416](https://github.com/Maximilien-ai/clawmax/issues/416) Review multi-agent workflow handoff and tool-readiness guidance
- [ ] [#413](https://github.com/Maximilien-ai/clawmax/issues/413) Provide bounded resize or expand controls for Builder panels and sidebars
- [ ] [#402](https://github.com/Maximilien-ai/clawmax/issues/402) Investigate workspace export failures and preserve useful error evidence
- [ ] [#396](https://github.com/Maximilien-ai/clawmax/issues/396) Make the first useful workspace action obvious
- [ ] [#395](https://github.com/Maximilien-ai/clawmax/issues/395) Expose delegation, ownership and review evidence in multi-agent work
- [ ] [#394](https://github.com/Maximilien-ai/clawmax/issues/394) Preserve agent identities and role boundaries in group execution
- [ ] [#388](https://github.com/Maximilien-ai/clawmax/issues/388) Clarify workflow-run conversations and continuation
- [ ] [#383](https://github.com/Maximilien-ai/clawmax/issues/383) fix: make agent display-name editing discoverable from chat
- [ ] [#382](https://github.com/Maximilien-ai/clawmax/issues/382) fix: investigate file links that do not open in multi-agent chat
- [ ] [#381](https://github.com/Maximilien-ai/clawmax/issues/381) fix: make agent and workflow documents easier to find
- [ ] [#361](https://github.com/Maximilien-ai/clawmax/issues/361) bug: Activity request failures are presented as zero spending and no activity
- [ ] [#350](https://github.com/Maximilien-ai/clawmax/issues/350) bug: Workspace selector reports 0 agents while the same workspace has 3 active agents (RC96)
- [ ] [#338](https://github.com/Maximilien-ai/clawmax/issues/338) AI-generated managed workflows describe a handoff, but all participants run in parallel on the same instructions
- [ ] [#313](https://github.com/Maximilien-ai/clawmax/issues/313) Factory Droid 0.247.0 rejects the --disabled-tools identifiers ClawMax passes, so every Droid turn fails
- [ ] [#312](https://github.com/Maximilien-ai/clawmax/issues/312) Creating a Claude Code or Droid agent writes an invalid modelPolicy.allow entry and blocks all later agent creation
- [ ] [#285](https://github.com/Maximilien-ai/clawmax/issues/285) Security: with authentication bypassed, the Vite dev server exposes the API to the local network
- [ ] [#281](https://github.com/Maximilien-ai/clawmax/issues/281) Security: template, skill, agent, plugin and workflow-output names can escape their folders
- [ ] [#249](https://github.com/Maximilien-ai/clawmax/issues/249) Workflows: Stop marks a run cancelled but Claude Code / Droid steps keep running
- [ ] [#245](https://github.com/Maximilien-ai/clawmax/issues/245) Agents: bulk delete skips the deletion lock, turn quiesce and Gateway unregistration
- [ ] [#237](https://github.com/Maximilien-ai/clawmax/issues/237) On-prem 1.9.9 hides plain-provisioned agents and crashes the Agents page (#181, #182); agents created before an upgrade stay hidden
- [ ] [#224](https://github.com/Maximilien-ai/clawmax/issues/224) Chat turns wait up to 2 minutes when no OpenClaw Gateway runs, and start.sh restarts the Gateway on every launch
- [ ] [#216](https://github.com/Maximilien-ai/clawmax/issues/216) Agent chat history drops long replies after a reload
- [ ] [#187](https://github.com/Maximilien-ai/clawmax/issues/187) fix: bound Dashboard resource growth during Podman soaks

## Medium priority

- [ ] [#449](https://github.com/Maximilien-ai/clawmax/issues/449) fix: adapt Builder guidance to empty workspaces and user intent
- [ ] [#447](https://github.com/Maximilien-ai/clawmax/issues/447) fix: clarify Builder keyboard submission and prompt transitions
- [ ] [#446](https://github.com/Maximilien-ai/clawmax/issues/446) fix: explain readiness changes after Improve with AI
- [ ] [#445](https://github.com/Maximilien-ai/clawmax/issues/445) fix: explain optional CLI runtime availability during setup
- [ ] [#444](https://github.com/Maximilien-ai/clawmax/issues/444) fix: make team leader editing discoverable and persistent
- [ ] [#443](https://github.com/Maximilien-ai/clawmax/issues/443) feat: clarify workflow run-input retention and saved defaults
- [ ] [#441](https://github.com/Maximilien-ai/clawmax/issues/441) fix: refresh agent collections after creation settles
- [ ] [#436](https://github.com/Maximilien-ai/clawmax/issues/436) chore: resolve remaining Moderate dependency advisories before stable 2.0
- [ ] [#419](https://github.com/Maximilien-ai/clawmax/issues/419) Bind optional-memory offline replay to destination and user consent
- [ ] [#414](https://github.com/Maximilien-ai/clawmax/issues/414) Evaluate Spanish Expand with AI quality and advisory readiness scoring
- [ ] [#409](https://github.com/Maximilien-ai/clawmax/issues/409) Show agent tool access and actual tool-use evidence
- [ ] [#407](https://github.com/Maximilien-ai/clawmax/issues/407) Add a discoverable runtime feedback entry point with reviewed screenshots
- [ ] [#403](https://github.com/Maximilien-ai/clawmax/issues/403) Fix workflow-generator layout when opened from Builder
- [ ] [#401](https://github.com/Maximilien-ai/clawmax/issues/401) Allow editing AI-generated templates before confirmation
- [ ] [#400](https://github.com/Maximilien-ai/clawmax/issues/400) Show group membership during generated-template review
- [ ] [#397](https://github.com/Maximilien-ai/clawmax/issues/397) Clarify workspace GitHub authentication and repository execution setup
- [ ] [#393](https://github.com/Maximilien-ai/clawmax/issues/393) Investigate an unresponsive Add dependency action
- [ ] [#392](https://github.com/Maximilien-ai/clawmax/issues/392) Investigate disruptive automatic dashboard refreshes
- [ ] [#390](https://github.com/Maximilien-ai/clawmax/issues/390) Distinguish human and agent authors in busy conversations
- [ ] [#389](https://github.com/Maximilien-ai/clawmax/issues/389) Improve Builder recommendation relevance and refinement
- [ ] [#387](https://github.com/Maximilien-ai/clawmax/issues/387) Make parallel workflow branches discoverable and verifiable
- [ ] [#380](https://github.com/Maximilien-ai/clawmax/issues/380) fix: let users leave agent provisioning while tracking its outcome
- [ ] [#379](https://github.com/Maximilien-ai/clawmax/issues/379) PDF export silently replaces Japanese, Chinese and Korean text with missing glyphs
- [ ] [#365](https://github.com/Maximilien-ai/clawmax/issues/365) bug: Markdown workspace links open Builder and relative images fail to load
- [ ] [#362](https://github.com/Maximilien-ai/clawmax/issues/362) bug: Metering aggregate totals undercount their own agent and daily breakdowns
- [ ] [#360](https://github.com/Maximilien-ai/clawmax/issues/360) bug: Pause and Resume triplicate existing log history and downloaded logs
- [ ] [#359](https://github.com/Maximilien-ai/clawmax/issues/359) bug: Logs replaces original event timestamps with receipt time and treats timestamps as agents
- [ ] [#348](https://github.com/Maximilien-ai/clawmax/issues/348) Gateway Activity recaps run on OpenClaw's default utility model (gpt-5.6-luna) with the agent's OpenAI key; ClawMax neither shows nor meters them
- [ ] [#331](https://github.com/Maximilien-ai/clawmax/issues/331) Add Agent wizard fails to initialize BYOK default model and misreports AI readiness
- [ ] [#315](https://github.com/Maximilien-ai/clawmax/issues/315) Aborted or failed agent creation leaves an empty AGENTS/<id> folder
- [ ] [#314](https://github.com/Maximilien-ai/clawmax/issues/314) Workflows AI Editor: Save & Generate drafts pick managed mode without an owner, can miss selected agents, and lose the prompt on Cancel
- [ ] [#271](https://github.com/Maximilien-ai/clawmax/issues/271) Top bar: controls overlap the sidebar or are cut off between 320 and 1280 px
- [ ] [#265](https://github.com/Maximilien-ai/clawmax/issues/265) Agent chat: Forward To menu does not close on Escape, outside click or pointer leave, and has no keyboard navigation
- [ ] [#225](https://github.com/Maximilien-ai/clawmax/issues/225) Agent chat replies appear only when the turn has finished
- [ ] [#214](https://github.com/Maximilien-ai/clawmax/issues/214) Agent Chat reliability: history, streaming, rendering, and Gateway startup issues
- [ ] [#200](https://github.com/Maximilien-ai/clawmax/issues/200) bug: Builder starter-prompt suggestions intermittently 500 on a real (non-OpenAI-terse) BYOK model
- [ ] [#195](https://github.com/Maximilien-ai/clawmax/issues/195) Improve Error Recovery and Navigation
- [ ] [#193](https://github.com/Maximilien-ai/clawmax/issues/193) bug: RC64 entrypoint fails its own gateway readiness probe (config get prints __OPENCLAW_REDACTED__)
- [ ] [#190](https://github.com/Maximilien-ai/clawmax/issues/190) bug: can't pair with Whatsapp
- [ ] [#163](https://github.com/Maximilien-ai/clawmax/issues/163) docs: create plugin dev user’s guide
- [ ] [#162](https://github.com/Maximilien-ai/clawmax/issues/162) docs: update a refine dev setup and instructions
