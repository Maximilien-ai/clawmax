# Deep Agents Hack — March 27, 2026

> **Event:** [Deep Agents Hack](https://luma.com/deepagentshack?tk=UoTfLO)
> **Goal:** Template wizard + 10-12 org templates across diverse domains + 2-3 live team executions
> **Branch:** `hackathon/deep-agents-hack-mar27`

## Strategy

Use the template wizard to rapidly generate diverse org templates, then pick 2-3 and run real agent teams to produce autonomous results. Each template = a complete multiagent team with roles, workflows, skills, and coordination.

### Key: TEMPLATE.md Format (in addition to template.json)

Templates should also be definable as **TEMPLATE.md** (YAML frontmatter + Markdown body) — not just JSON. This is critical because:
- AI generates markdown much more naturally than JSON
- Humans can read/edit markdown easily
- Same pattern as SKILL.md, IDENTITY.md, workflows
- Schema validation ensures correctness regardless of format

**Implementation:**
- [ ] Define TEMPLATE.md schema (YAML frontmatter with agents, communities, groups, workflows)
- [ ] Parser: `gray-matter` to extract frontmatter, validate against schema
- [ ] Template system accepts both template.json and TEMPLATE.md (auto-detect)
- [ ] AI Generate outputs TEMPLATE.md format
- [ ] Wizard exports as TEMPLATE.md

## Phase 1: Template Wizard (2-3 hrs morning)

Build the multi-step wizard for creating org templates:

### Wizard Steps
1. **Team Type** — select domain (business, technical, personal) or describe custom
2. **Team Composition** — roles, how many of each, skills per role
3. **Communication** — communities, groups, channels
4. **Workflows** — what the team does (manual triggers + cron schedules)
5. **Preview & Confirm** — full template preview, edit any field, create

### AI Integration
- AI generates initial team based on description (bypass steps 2-4)
- Each step can be AI-assisted or manual
- Human confirms/edits before creation

### Kickoff Workflow (MUST HAVE)
Every template includes a kickoff workflow that auto-starts the team on apply:
- `type: "once"` — runs exactly once when template is applied
- Targets the team lead/planner agent
- Contains the initial prompt with project context, team roster, and instructions
- Eliminates the "paste a big prompt to get started" step from OpenClaw Hack Day

## Phase 2: Template Generation (2-3 hrs)

Generate 10-12 templates across domains using the wizard:

### Business Templates
| # | Template | Roles | Key Workflows |
|---|----------|-------|---------------|
| 1 | **Sales Team** | sales-lead, account-exec (N), sdr (N), sales-ops | Pipeline review, lead qualification, deal forecast |
| 2 | **HR Team** | hr-lead, recruiter (N), people-ops, onboarding-specialist | Job posting, candidate screening, onboarding checklist |
| 3 | **Support Team** | support-lead, support-agent (N), escalation-eng, knowledge-mgr | Ticket triage, SLA monitoring, KB updates |
| 4 | **Legal Team** | legal-lead, contract-analyst (N), compliance-officer | Contract review, compliance check, risk assessment |
| 5 | **Marketing Team** | marketing-lead, content-writer (N), seo-analyst, social-mgr | Content calendar, campaign review, analytics report |

### Small Business Templates
| # | Template | Roles | Key Workflows |
|---|----------|-------|---------------|
| 6 | **Convenience Store** | store-manager, inventory-clerk, cashier-lead | Daily inventory, restock alerts, shift scheduling |
| 7 | **Specialty Retailer** | owner, buyer, merchandiser, customer-service | Product curation, pricing review, customer follow-up |

### Technical Templates
| # | Template | Roles | Key Workflows |
|---|----------|-------|---------------|
| 8 | **Dev Team** | tech-lead, engineer (N), qa-engineer, devops | PR review, CI triage, release prep, daily standup |
| 9 | **Data Team** | data-lead, data-engineer (N), analyst, ml-engineer | Pipeline monitoring, data quality, model eval |
| 10 | **RAG Team** | planner, data-eng (N), search-eng, eval-eng, ops | (already built — reference implementation) |

### Personal Templates
| # | Template | Roles | Key Workflows |
|---|----------|-------|---------------|
| 11 | **Student Research** | research-lead, lit-reviewer, data-analyst, writer | Literature search, source evaluation, draft review |
| 12 | **Technical Writing** | editor, writer (N), reviewer, publisher | Outline review, draft writing, fact-check, publish |

## Phase 3: Live Execution (2-3 hrs afternoon)

Pick 2-3 templates and deploy real teams:

### Selection Criteria
- Different domains (1 business + 1 technical + 1 personal)
- Templates that can produce results quickly with test data
- Mix of parallel and sequential workflows

### Suggested Picks
1. **Dev Team** — point at ClawMax repo, agents do PR review + triage (validates self-management vision)
2. **Student Research** — give a research topic, agents produce literature review
3. **Support Team** — create sample tickets, agents triage and respond

### Execution Flow (per template)
1. Apply template in ClawMax
2. Import skills (reuse weave-cli skills where applicable, or create domain-specific)
3. Send kickoff prompt to team lead
4. Monitor via Status group + notifications
5. Iterate: fix blockers, adjust prompts, re-run
6. Capture results + learnings

## Phase 4: Polish & Present (1 hr)

- Document results from live executions
- Take screenshots of teams working
- Prepare demo showing wizard → template → agents working
- Publish templates to ClawMax TEMPLATES/

## Timeline

| Time | Phase | Target |
|------|-------|--------|
| Morning (3 hrs) | Wizard + first templates | Working wizard, 4-5 templates |
| Midday (2 hrs) | Remaining templates | All 10-12 templates done |
| Afternoon (3 hrs) | Live execution | 2-3 teams producing results |
| End of day (1 hr) | Polish + present | Demo-ready, templates published |

## MVP Approach

**If behind schedule:**
- Wizard: skip UI, use AI Generate API directly to create templates
- Templates: do 6 instead of 12 (1 per category)
- Execution: just 1 team (Dev Team on ClawMax repo = most impressive demo)

**If ahead of schedule:**
- Add domain-specific skills (sales-crm, support-zendesk, etc.)
- Run multiple teams concurrently across workspaces
- Import skills from Shipables.dev registry

## Stretch: Shipables.dev Integration

[Shipables.dev](https://shipables.dev/) is a registry with 1,000+ Agent Skills using the same open standard (agentskills.io) as OpenClaw. Same SKILL.md format = direct compatibility.

**Why:** Agents created from templates could install domain-specific skills from Shipables (e.g., CRM skills for Sales Team, ticketing skills for Support Team) without us building them.

**Integration approach:**
- [ ] **Import from Shipables** — add "Shipables Registry" tab in Import Skill dialog
- [ ] **Search Shipables** — `npx @senso-ai/shipables search <query>` or API if available
- [ ] **Install to workspace** — `npx @senso-ai/shipables install <skill>` → copy to workspace SKILLS/custom/
- [ ] **Browse in UI** — show Shipables catalog alongside bundled/workspace skills

**Other registries to consider (same standard):**
- [Skills.sh](https://skills.sh) (Vercel) — 83K+ skills
- [ClawHub](https://clawhub.dev) — OpenClaw's native registry, 2,800+ skills
- SkillsMP — 351K+ skills with semantic search

**Quick win for hackathon:** Even without full UI integration, agents with bash access can run `npx @senso-ai/shipables install <skill>` themselves when they need a capability.

## Reference

- RAG Team template: `TEMPLATES/organizations/rag-team/` (built at OpenClaw Hack Day)
- weave-cli-skills: github.com/Maximilien-ai/weave-cli-skills
- Workflow v2 design: `docs/hacks/openclaw-hack-day-mar25/WORKFLOW_V2_DESIGN.md`
- Template schema: `server/schemas/organization-template.schema.json`
- Agent Skills standard: https://agentskills.io
- Shipables registry: https://shipables.dev/
