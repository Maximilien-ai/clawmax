# Session Summary — March 25, 2026

## OpenClaw Hack Day (The Agent Toolkit w/ OpenAI Codex)

### What We Built

**1. weave-cli Skills (6 skills)**
- `weave-setup` (⚙️), `weave-ingest` (🗄️), `weave-search` (🧠), `weave-eval` (🎯), `weave-stack` (📦), `weave-planner` (📋)
- Full SKILL.md with weave-cli commands, tags, emojis, brew + go install
- Published to github.com/Maximilien-ai/weave-cli-skills

**2. RAG Team Organization Template**
- 5 agent roles with IDENTITY/SOUL/TOOLS
- 6 groups, 6 workflows with detailed step-by-step instructions
- Parameterized scaling (N data/search/eval engineers)
- Registered in TEMPLATES/organizations/rag-team

**3. Dashboard Features (shipped to main)**
- Template skills wiring (setAgentSkills on apply + getAgentSkills on export)
- Skills per agent in template detail dialog and apply modal
- Markdown rendering in all chat messages (user + agent)
- Skill tags display, search by tags
- Dynamic model discovery from provider APIs (1hr cache)
- Empty state improvements (Agents page, Skills page)

**4. Bug Fixes (10+)**
- Template workflow import: targeting.agents undefined
- Workflow manual schedule, targeting normalization
- Cross-workspace message bleed
- Agent tags undefined crash, skill metadata.openclaw parsing
- Template card wrapping, communication card widths
- Unread badge scoped to workspace

**5. Workflow v2 Design Document**
- Blocker surfacing with dynamic UI (the killer feature)
- Agent-to-agent direct messaging
- Workflow DAG with dependencies
- Progress tracking
- Lifecycle workflows (kickoff/monitor/completion)

### Key Learnings

1. **Multiagent teams block without coordination primitives** — cron workflows aren't enough. Agents need: blocker surfacing, direct messaging, progress visibility.
2. **Kickoff workflow eliminates 20min manual prompt** — templates should include a one-click start.
3. **Skills ecosystem works** — 6 skills created, imported, assigned via template in one session.
4. **Template system is solid** — parameterized agents, communities, groups, workflows all deployed correctly after fixes.

### Metrics
- v1.1.14.1 → merged hackathon PR with 36 files, +1001/-68 lines
- 6 skills published to SkillsHub (weave-cli-skills repo)
- 1 org template (RAG Team) added to ClawMax
- ~10 bugs fixed during live testing
- 1 major design doc (Workflow v2)

### What's Next (March 26)
- Workflow v2 P0 items: blocker surfacing, kickoff workflow
- Integrate Workflow v2 design into main backlog priorities
- Continue RAG Team testing with real data
- Demo prep if presenting hackathon results
- Dashboard ready deadline (March 26)
