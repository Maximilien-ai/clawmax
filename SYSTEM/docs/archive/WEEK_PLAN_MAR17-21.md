NOTE: we might need to updat this since some of the tasks are done but not checkoff and still see old NOTE below

# Week Plan: March 17-21, 2026 — AGGRESSIVE MODE 🔥

**Work Schedule:** Monday-Friday, 8-10 hours/day (40-50 hours total)
**Goal:** Ship v1.1.0 with major roadmap features by Friday EOD
**Approach:** Parallel workstreams, aggressive execution, continuous deployment

---

## 🎯 Week Objective: Ship v1.1.0

### Target Features (from ROADMAP.md)
1. ✅ **Workflow Dependencies** (Backend + API + UI) — 15 hours
2. ✅ **Favorites System** (Backend + API + UI + Export) — 14 hours
3. ✅ **5+ New Organization Templates** — 10 hours
4. ✅ **All Bugs Fixed** (schema, tests, cleanup) — 6 hours
5. ✅ **Performance Optimization** — 5 hours

**Total Estimated:** ~50 hours = 10 hours/day × 5 days ✅ **ACHIEVABLE**

---

## 📅 Day-by-Day Breakdown

### Monday, March 17 — Foundation Day (10 hours)

**Theme:** Fix all technical debt, set up for feature work

#### Morning (8:00 AM - 12:00 PM) — 4 hours
**Critical Bugs & Fresh Install [4h]**
- [ ] **Fresh install test** (2h): Clone public, run setup.sh, document issues
- [ ] **Fix schema validation paths** (1h): validator.ts → repo root schemas
- [ ] **Fix test cleanup** (1h): general.json reset after tests
- [ ] **Run full test suite**: Target 86/86 passing

NOTE: let's move this ^^^ to tonight since my first GTC event is at 4p today and can run on this laptop -- tonight I'll install on Mac mini and have that be ClawMax Org. Then we will setup the second Mac mini for weave-cli Org

#### Afternoon (1:00 PM - 6:00 PM) — 6 hours
**Workflow Dependencies - Backend [6h]**
- [ ] **Data model** (1.5h): Add `depends_on` field to workflow YAML schema
- [ ] **Dependency resolution** (2h): Topological sort, circular detection
- [ ] **Execution engine** (1.5h): Check constraints before workflow run
- [ ] **Failure handling** (1h): Skip dependents on failure, retry logic
- [ ] **Tests** (30min): Dependency resolution, circular detection

NOTE: thinking also of parallel workflows and sync and being able to visually see that dependency. Maybe by connecting them visually and specifying the dependency and parameters. Retry for failed executions. Restart?

NOTE: we need agent to be able to trigger workflows too... I think we have that but have never tested.

**Deliverables:**
- ✅ All tests passing (86/86)
- ✅ Schema validation fixed
- ✅ Workflow dependencies backend complete

---

### Tuesday, March 18 — Dependencies + Favorites (10 hours)

**Theme:** Complete workflow dependencies, start favorites system

#### Morning (8:00 AM - 12:00 PM) — 4 hours
**Workflow Dependencies - API + UI [4h]**
- [ ] **API endpoints** (1.5h):
  - GET /api/workflows/:id/dependencies
  - PUT /api/workflows/:id/dependencies
  - Validation for circular deps
- [ ] **Workflow editor UI** (2h):
  - Dependency picker component
  - Multi-select with constraint type (all/any)
  - Circular dependency warnings
- [ ] **Tests** (30min): API + UI component tests

NOTE: visual connection for workflows with drag and connect or something. And then editing params.

#### Afternoon (1:00 PM - 6:00 PM) — 6 hours
**Favorites System - Backend + API [6h]**
- [ ] **Data model** (1h): Add `starred: boolean` to entities
- [ ] **API endpoints** (2h):
  - GET /api/favorites (aggregated view)
  - PUT /api/favorites/:type/:id (star/unstar)
  - Template export from favorites
- [ ] **Export logic** (2h): Generate template.json from starred entities
- [ ] **Tests** (1h): Favorites CRUD, template export

**Deliverables:**
- ✅ Workflow dependencies feature complete
- ✅ Favorites backend + API complete

---

### Wednesday, March 19 — Favorites UI + Templates (10 hours)

**Theme:** Complete favorites, create 5 new org templates

#### Morning (8:00 AM - 12:00 PM) — 4 hours
**Favorites System - UI [4h]**
- [ ] **FavoritesPage component** (1.5h): Aggregated view of all starred items
- [ ] **Star/unstar buttons** (1h): On agents, groups, communities, workflows
- [ ] **Export dialog** (1h): "Export Favorites as Template" with subset selection
- [ ] **Navigation** (30min): Add Favorites tab to top-level nav

#### Afternoon (1:00 PM - 6:00 PM) — 6 hours
**Organization Templates - Sprint [6h]**
Create 5 new org templates (1h each + 1h testing):
- [ ] **Customer Success Team** (1h): CS Lead, 2x Support Engineers, Success Manager
- [ ] **Marketing Team** (1h): Marketing Head, Content Writer, Social Media Manager, SEO Specialist
- [ ] **DevOps Team** (1h): DevOps Lead, SRE, Cloud Architect, Monitoring Engineer
- [ ] **Sales Team** (1h): Sales Head, 2x Account Executives, Sales Engineer
- [ ] **Data Team** (1h): Data Lead, Data Engineer, ML Engineer, Analytics Engineer
- [ ] **Test all templates** (1h): Application, workflows, validation

**Deliverables:**
- ✅ Favorites system complete (backend + API + UI)
- ✅ 5 new organization templates
- ✅ Template documentation updated

---

### Thursday, March 20 — Performance + Polish (10 hours)

**Theme:** Optimization, visual graph, documentation

#### Morning (8:00 AM - 12:00 PM) — 4 hours
**Workflow Dependency Graph Visualization [4h]**
- [ ] **Graph library** (1h): Integrate react-flow or d3-dag
- [ ] **Graph component** (2h): Visual workflow DAG with nodes/edges
- [ ] **Interactive features** (1h): Zoom, pan, click node to edit
- [ ] Add to Workflows page as new tab

#### Afternoon (1:00 PM - 6:00 PM) — 6 hours
**Performance Optimization [6h]**
- [ ] **Agent list pagination** (1.5h): Virtual scrolling for 100+ agents
- [ ] **Message list optimization** (1.5h): Pagination, lazy loading
- [ ] **Workflow execution queries** (1h): Index optimization, caching
- [ ] **Bundle size optimization** (1h): Code splitting, tree shaking
- [ ] **Load time profiling** (1h): Lighthouse audit, fix bottlenecks

**Deliverables:**
- ✅ Workflow dependency graph visualization
- ✅ Performance improvements (50%+ faster loads)
- ✅ Dashboard handles 100+ agents smoothly

---

### Friday, March 21 — Documentation + v1.1.0 Release (10 hours)

**Theme:** Polish everything, document, ship

#### Morning (8:00 AM - 12:00 PM) — 4 hours
**Documentation Sprint [4h]**
- [ ] **User guides** (1.5h):
  - "Workflow Dependencies Guide"
  - "Using the Favorites System"
  - "Choosing the Right Organization Template"
- [ ] **Update FEATURES.md** (1h): All v1.1.0 features documented
- [ ] **Update ROADMAP.md** (30min): Mark completed, plan v1.2.0
- [ ] **Changelog** (1h): Comprehensive v1.1.0 release notes

#### Afternoon (1:00 PM - 6:00 PM) — 6 hours
**Testing + Release [6h]**
- [ ] **Full test suite** (1h): All tests passing, fix any regressions
- [ ] **End-to-end testing** (2h):
  - Test all new features (dependencies, favorites, templates)
  - Test all existing features (no breakage)
  - Test on fresh install
- [ ] **Release prep** (1h): Version bump, tag, release notes
- [ ] **Sync to public** (1h): Push SYSTEM/, TEMPLATES/, docs
- [ ] **GitHub release** (30min): Create v1.1.0 on both repos
- [ ] **Next week planning** (30min): Rough plan for week of Mar 24-28

**Deliverables:**
- ✅ Comprehensive documentation for all features
- ✅ v1.1.0 released on public + private repos
- ✅ All tests passing, no known bugs
- ✅ Next week plan sketched

---

## 📊 Week Summary

### Total Features Shipping in v1.1.0
1. ✅ **Workflow Dependencies** — Chain workflows together with constraints
2. ✅ **Favorites System** — Star entities, export as templates
3. ✅ **Workflow Graph Visualization** — Visual DAG of dependencies
4. ✅ **5 New Organization Templates** — Customer Success, Marketing, DevOps, Sales, Data
5. ✅ **Performance Optimization** — 50%+ faster loads, handles 100+ agents
6. ✅ **All Bugs Fixed** — Schema validation, test cleanup, fresh install tested

### Estimated Time Breakdown
- **Monday:** 10h (bugs + dependencies backend)
- **Tuesday:** 10h (dependencies UI + favorites backend)
- **Wednesday:** 10h (favorites UI + 5 templates)
- **Thursday:** 10h (graph viz + performance)
- **Friday:** 10h (docs + testing + release)
- **Total:** 50 hours

### Success Metrics
- [ ] v1.1.0 released by Friday EOD
- [ ] All 6 major features complete and tested
- [ ] 100% test coverage maintained
- [ ] Fresh install works flawlessly
- [ ] Public repo synced and released

---

## 🐛 Bug Backlog (from BUGS.md)

### To Fix This Week
1. **Schema Validation Path Errors** (Monday)
   - Severity: Low
   - File: `server/lib/validator.ts:21`
   - Fix: Resolve from repo root instead of workspace

2. **Test Message Accumulation** (Tuesday)
   - Severity: Low
   - Fix: Add cleanup step to test suite

3. **MANDATE.md Schema Validation** (Tuesday)
   - Severity: Low
   - Fix: Update test expectations or schema

### Monitor/Defer
4. **Old Agents Missing Module Error**
   - Severity: Medium
   - OpenClaw internal issue
   - Workaround: Agent recreation script (Thursday/Friday)

---

## 📊 Success Metrics

### By End of Week (Friday EOD)
- [ ] ✅ Fresh install tested and documented
- [ ] ✅ All 86 tests passing
- [ ] ✅ Schema validation fixed
- [ ] ✅ Test cleanup implemented
- [ ] ✅ 2-3 new templates released
- [ ] ✅ Documentation updated
- [ ] ✅ Performance improvements deployed
- [ ] ✅ New release published

### Quality Gates
- All tests passing before any release
- Fresh install works flawlessly
- Documentation accurate and complete
- No P0/P1 bugs in backlog

---

## 🚀 Stretch Goals (If Time Permits)

### Advanced Features
- [ ] Multi-workspace switcher improvements
- [ ] Workflow template library
- [ ] Agent skill marketplace (early exploration)
- [ ] CLI improvements for agent management
- [ ] Bulk operations UI enhancements

### Developer Experience
- [ ] Contribution guide
- [ ] Architecture deep-dive docs
- [ ] Video tutorials
- [ ] Example projects gallery

---

## 📝 Daily Standup Format

### Every Morning (30 min)
1. **Yesterday:** What was completed?
2. **Today:** What's the plan?
3. **Blockers:** Any issues?
4. **Adjust:** Update day plan if needed

### Every Evening (15 min)
1. **Review:** What got done?
2. **Commit:** Push all changes
3. **Document:** Update session notes
4. **Preview:** Plan tomorrow morning

---

## 🔮 Next Week Preview (March 24-28)

### Tentative Themes
- **Monday-Tuesday:** Agent collaboration features
- **Wednesday-Thursday:** Workflow enhancements
- **Friday:** Release v1.1.0 or v1.2.0

### Potential Features
- Multiagent coordination workflows
- Enhanced chat memory and context
- Advanced template features
- Integration improvements

---

## 📞 Hackathon Integration Note

**Sunday, March 15:** MechDog hackathon will inform:
- OpenClaw skill development best practices
- Robotics integration patterns
- Real-world agent use cases
- Potential ClawMax robotics features

Learnings from hackathon will feed into Week 2 planning.

---

## ⚡ Energy Management

### Daily Rhythm
- **8:00-10:00 AM:** Deep work (complex features)
- **10:00-12:00 PM:** Coding + testing
- **12:00-1:00 PM:** Lunch + break
- **1:00-3:00 PM:** Implementation
- **3:00-4:00 PM:** Testing + documentation
- **4:00-6:00 PM:** Bug fixes + polish

### Breaks
- 10-minute break every 90 minutes
- Longer break at lunch
- Friday afternoon: lighter tasks, planning

### Sustainability
- 8-10 hours/day is sustainable
- Don't overwork - quality > quantity
- Save energy for next week
- Weekend rest is important

---

**LET'S GO! 🚀**
