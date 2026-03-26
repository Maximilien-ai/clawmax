# Two-Week Sprint: ClawMax Self-Management
**March 17-28, 2026**

> Updated March 25 — adjusted based on hackathon learnings and Workflow v2 design.

## Mission: ClawMax Managing ClawMax

**The Vision**: Deploy ClawMax on Mac Mini with agent teams that build, test, review, and release ClawMax itself. Live demo showing agents autonomously managing development.

**Key Insight (from Mar 25 hackathon):** Multiagent teams block without Workflow v2 primitives (blocker surfacing, agent-to-agent messaging, kickoff workflows). Self-management will work much better once Workflow v2 lands. Current sprint focuses on building toward that.

**Key Demos**:
- **Thursday Mar 27**: Presentation showing ClawMax capabilities + RAG Team demo
- **Friday Mar 28**: Hackathon demo with weave-cli skills + RAG Team

---

## Week 1 Summary (Mar 17-21) — COMPLETED

- v1.1.14 released with bulk model change, updated model list
- 12 new API tests, cost-limits route ordering fix
- CI green on main
- Security audit follow-through
- Backlog organized with priority items

## Week 2 Actual (Mar 24-28) — IN PROGRESS

### Monday Mar 24
- Backlog refinement and priority ordering

### Tuesday Mar 25 — OpenClaw Hack Day
**Major output:**
- 6 weave-cli skills (weave-setup, weave-ingest, weave-search, weave-eval, weave-stack, weave-planner)
- RAG Team org template (5 roles, 6 groups, 6 workflows, parameterized scaling)
- Template skills wiring (setAgentSkills on import)
- Dynamic model discovery from provider APIs
- Markdown rendering in chat messages
- 10+ bug fixes (templates, workflows, skills, cross-workspace)
- **Workflow v2 design** — the critical path to autonomous multiagent coordination

### Wednesday Mar 26 — Dashboard Ready + Workflow v2 P0

**Morning: Production Readiness**
- [ ] OAuth clean-room auth test (backlog blocker)
- [ ] Container fixes (#41) — ENOENT agent dir, schemas/templates inclusion
- [ ] Create release v1.1.15 with all hackathon fixes

**Afternoon: Workflow v2 P0 — Kickoff Workflow**
- [ ] Add `type: "once"` workflow support — runs exactly once on template apply
- [ ] Add `kickoff` field to org template schema with target agent + prompt
- [ ] RAG Team template: add kickoff workflow so apply = team starts working
- [ ] Test: apply template → planner immediately starts without manual prompt

### Thursday Mar 27 — Presentation + Blocker Surfacing

**Morning: Workflow v2 P0 — Basic Blocker Surfacing**
- [ ] Agent blocker event format: `{ type: "choice"|"approval"|"input", ... }`
- [ ] Notification center: render blocker notifications with actionable UI
- [ ] One-click resolution sends response back to agent
- [ ] Test with RAG Team — agents surface blockers, human resolves from notifications

**Afternoon: Presentation**
- [ ] Demo ClawMax dashboard with RAG Team
- [ ] Show skills ecosystem (weave-cli-skills)
- [ ] Show template apply → agents working
- [ ] Show blocker surfacing (if ready)
- [ ] Present Workflow v2 vision

### Friday Mar 28 — Agent-to-Agent + Demo

**Morning: Workflow v2 P1 — Agent-to-Agent Messaging**
- [ ] `POST /api/agents/{from}/message/{to}` — send direct message
- [ ] Recipient gets message as next prompt
- [ ] Planner can ask Data Engineer for status
- [ ] Eval Engineer can tell Search Engineer to change config

**Afternoon: Self-Management Test**
- [ ] Create "ClawMax Dev Team" template (qa-engineer, release-engineer, github-triage)
- [ ] Apply template with kickoff workflow
- [ ] Team starts working on ClawMax repo autonomously
- [ ] Verify blockers surface, agents communicate, progress visible

---

## Deferred to Post-Sprint (needs Workflow v2 foundation)

These items from the original plan are **better done after** Workflow v2 lands:

- **Fully autonomous PR review cycle** — needs agent-to-agent messaging + blocker resolution
- **Auto-merge approved PRs** — needs workflow DAG (merge only after review + tests)
- **System health monitoring** — needs monitor workflow type
- **Mac Mini 24/7 deployment** — needs completion workflows + progress tracking
- **ClawMax managing ClawMax autonomously** — the full vision needs all Workflow v2 pillars

**The right sequence:**
1. Workflow v2 P0 (kickoff + blocker surfacing) — this week
2. Workflow v2 P1 (agent-to-agent + progress tracking) — next week
3. ClawMax self-management with Workflow v2 — week after
4. Polish and scale

---

## Success Metrics (adjusted)

### This Week (Mar 26-28)
- [ ] Dashboard production-ready (OAuth, container)
- [ ] v1.1.15 released with hackathon work
- [ ] Kickoff workflow working (template apply → team starts)
- [ ] Basic blocker surfacing in notifications
- [ ] Presentation delivered

### Next Sprint (Mar 31 - Apr 4)
- [ ] Agent-to-agent messaging
- [ ] Workflow progress tracking
- [ ] ClawMax Dev Team template
- [ ] Self-management MVP (with Workflow v2 P0+P1)
- [ ] Cloud deployment foundation (Apr 1 deadline)

---

**Status**: In Progress — Week 2
**Owner**: Max + Claude Code
**Key Learning**: Build Workflow v2 first, then self-management works naturally.
