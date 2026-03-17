# ClawMax Roadmap

**Current Version**: v1.1.0
**Last Updated**: 2026-03-15

This roadmap tracks completed work and plans for upcoming releases.

---

## ✅ Completed - v1.0.0 (Released Mar 14, 2026)

### Agent Management
- ✅ Visual agent roster with status, tags, and activity
- ✅ Agent creation from templates
- ✅ Organization templates (Small Startup, etc.)
- ✅ Skills assignment (50+ built-in skills)
- ✅ Tag-based filtering and organization
- ✅ Agent detail panels with slide-out UI

### Communication & Monitoring
- ✅ Real-time chat via WebSocket
- ✅ Group conversations
- ✅ Community chats
- ✅ Activity feed (agent actions, file changes, workflow executions)
- ✅ Status dashboard (system health, agent count, workspace metrics)
- ✅ Auto-completion detection for chat responses

### Workflows & Automation
- ✅ Workflow designer (scheduled or manual)
- ✅ Agent targeting (tags, groups, communities)
- ✅ Execution history tracking
- ✅ Cron scheduling with flexible schedules
- ✅ CRUD operations for workflows

### Multi-Workspace Support
- ✅ Workspace switcher UI
- ✅ Workspace creation and management
- ✅ Workspace tagging and color-coding
- ✅ Independent configs per workspace
- ✅ Workspace isolation

### Testing & Quality
- ✅ Comprehensive test suite (92 tests)
- ✅ API endpoint tests
- ✅ Skills validation tests
- ✅ Workflow CRUD tests
- ✅ Gateway RPC compatibility tests
- ✅ Automated workspace activation for testing

### Documentation
- ✅ Comprehensive README.md
- ✅ Testing guide (TESTING_GUIDE.md)
- ✅ Workflows guide (WORKFLOWS.md)
- ✅ Security documentation (SECURITY.md)
- ✅ Bug tracker (BUGS.md)
- ✅ Launch presentation and materials

---

## 🚀 v1.0.1 - Quick Wins (Target: Mar 17-18, 2026)

**Focus**: Setup improvements and template enhancements
**Time Budget**: 16 hours (Sat 4h + Sun 2h + Mon 10h)

### Setup & Installation
- [ ] **setup.sh**: Automated installation script
  - Prerequisites check (Node.js, git, OpenClaw)
  - OpenClaw installation (pinned version)
  - ClawMax installation and npm install
  - Workspace structure creation
  - Dashboard token generation
  - Automatic dashboard startup

- [ ] **OpenClaw Version Pinning**: Document tested version
  - Update README.md with tested OpenClaw version
  - Add version check on dashboard startup
  - setup.sh installs specific version

- [ ] **Installation Documentation**: Update README.md
  - Add setup.sh as primary installation method
  - Keep manual installation as alternative
  - Add troubleshooting section

### Templates
- [ ] **Simplified Test Template**:
  - 2 agents (test1, test2)
  - 1 group
  - 1 community
  - 1 workflow
  - Minimal fixture for testing

- [ ] **Agent Template Cleanup**:
  - Delete `jim` template (redundant)
  - Keep `dave` as primary assistant
  - Add `golang-engineer` template
  - Add `typescript-engineer` template
  - Add `qa-engineer` template
  - Add `project-manager` template

- [ ] **Enhanced Small Startup Template**:
  - Expand from 3 to 6 agents:
    - CEO
    - Product Manager
    - 2x Engineer (engineer1, engineer2)
    - QA Engineer
    - Project Manager
  - Add GitHub Triage workflow
  - Add team coordination groups

### Testing
- [ ] Test suite for new templates
- [ ] Validation tests for setup.sh
- [ ] Update test documentation

**Deliverable**: v1.0.1 release with improved setup and templates

---

## 🎯 v1.1.0 - Major Features (Target: End of March 2026)

**Focus**: Workflow dependencies and favorites system
**Time Budget**: 40 hours over 2 weeks

### Workflow Constraints & Dependencies
- [ ] **Backend Implementation** (6 hours):
  - Extend workflow YAML frontmatter with `depends_on` field
  - Constraint types: `all` (all must complete) or `any` (one must complete)
  - Circular dependency detection
  - Execution order resolution
  - Failure handling (retry, skip dependents, etc.)

- [ ] **API Enhancements** (3 hours):
  - GET /api/workflows/:id/dependencies
  - PUT /api/workflows/:id/dependencies
  - Validation for circular dependencies
  - Execution history with constraint satisfaction status

- [ ] **UI Implementation** (6 hours):
  - Workflow dependency picker in editor
  - Visual workflow graph showing relationships
  - Execution history shows constraint status
  - Warning for circular dependencies
  - Dependency management panel

- [ ] **Testing** (2 hours):
  - Dependency resolution tests
  - Circular dependency detection tests
  - Execution order tests
  - UI component tests

### Favorites Tab
- [ ] **Backend Implementation** (4 hours):
  - Add `starred: boolean` to agents, groups, communities, workflows
  - GET /api/favorites endpoint
  - PUT /api/favorites/:type/:id endpoint
  - Template export from favorites

- [ ] **UI Implementation** (8 hours):
  - New "Favorites" top-level tab
  - Star/unstar buttons on all entities
  - FavoritesPage.tsx component
  - Aggregated view of all favorites
  - "Export Favorites as Template" feature
  - Template customization dialog (select subset)

- [ ] **Testing** (2 hours):
  - Favorites CRUD tests
  - Template export tests
  - UI component tests

### Personal Assistants Org Template
- [ ] **Design** (2 hours):
  - Define 6-8 agents with roles
  - Design 2-3 groups for coordination
  - Create 3-4 workflows

- [ ] **Implementation** (4 hours):
  - Create agent templates
  - Create template.json
  - Create README.md
  - Test import and functionality

### Workspaces Directory Structure
- [ ] **Design & Planning** (2 hours):
  - Finalize directory structure
  - Backward compatibility strategy
  - Migration path for existing workspaces

- [ ] **Implementation** (4 hours):
  - Update setup.sh to create workspaces/default/
  - Update dashboard to detect workspaces/*
  - Create workspaces/README.md
  - Environment variable override support

- [ ] **Testing & Documentation** (2 hours):
  - Migration guide
  - Update README.md
  - Test backward compatibility

### Documentation & Testing
- [ ] Comprehensive test coverage for all new features
- [ ] Update user guides
- [ ] Update FEATURES.md with implementation notes

**Deliverable**: v1.1.0 release with workflow dependencies and favorites

---

## 💎 v1.2.0 - Advanced Features (Target: April 2026)

**Focus**: Deep Research template and analytics

### Deep Research Org Template
- [ ] Design multi-agent research workflow
  - Research coordinator (user-facing)
  - 3x web researchers (parallel data collection)
  - Data synthesizer (compile research)
  - Editor (final polish)
  - Groups for coordination
  - Communities for cross-communication

- [ ] Implement template with workflows:
  - Research kickoff workflow
  - Synthesis trigger (after 24h)
  - Final review workflow

### Analytics & Monitoring
- [ ] Workflow execution analytics:
  - Success/failure rates
  - Execution duration trends
  - Agent participation metrics

- [ ] Agent performance metrics:
  - Response times
  - Message counts
  - Skill usage statistics

- [ ] Dashboard visualizations:
  - Charts and graphs
  - Trend analysis
  - Export reports

### Bulk Operations
- [ ] Multi-agent selection:
  - Checkbox selection on Agents page
  - Select by tag/group

- [ ] Bulk actions:
  - Assign skills to multiple agents
  - Tag multiple agents
  - Delete multiple agents
  - Export multiple agents as template

### Quality & Polish
- [ ] Performance optimizations:
  - Lazy loading for large workspaces
  - Caching for workspace metadata
  - Progressive rendering

- [ ] UX improvements:
  - Keyboard shortcuts
  - Drag-and-drop for workflow scheduling
  - Toast notifications

- [ ] Advanced search:
  - Full-text search across agents, workflows
  - Filter combinations
  - Saved searches

**Deliverable**: v1.2.0 release with research template and analytics

---

## 🔮 Future (v2.0.0 and Beyond)

### Collaboration Features
- [ ] Multi-user support:
  - User authentication
  - Role-based access control (RBAC)
  - Team collaboration

- [ ] Shared workspaces:
  - Invite team members
  - Permission management
  - Activity attribution

### Distributed Deployment
- [ ] Remote agent support:
  - Agents on different machines
  - Load balancing

- [ ] Cloud deployment:
  - Docker containers
  - Kubernetes orchestration
  - Hosted dashboard service

### Advanced Monitoring & Alerts
- [ ] Real-time alerts:
  - Workflow failures
  - Agent errors
  - System health issues

- [ ] Notification channels:
  - Email
  - Slack
  - Webhooks

### Plugin System
- [ ] Plugin architecture:
  - Custom skill plugins
  - Custom workflow actions
  - Custom UI components

- [ ] Plugin marketplace:
  - Community plugins
  - Plugin discovery
  - Version management

---

## 📊 Release Schedule

### March 2026
- ✅ **v1.0.0** (Mar 14) - Initial public release
- 🎯 **v1.0.1** (Mar 17-18) - Setup improvements and templates
- 🎯 **v1.1.0** (Mar 28-31) - Workflow dependencies and favorites

### April 2026
- 🔮 **v1.2.0** (Mid-April) - Deep Research and analytics
- 🔮 **v1.3.0** (Late April) - Bulk operations and polish

### May 2026+
- 🔮 **v2.0.0** (TBD) - Collaboration and distributed features

---

## 🎯 Success Metrics

### User Experience
- ✅ Initial load time: < 1s (achieved)
- ✅ Page navigation: Instant (achieved)
- ✅ API response: < 500ms (achieved)
- ✅ Zero crashes during demo (achieved)

### Quality
- ✅ 92/92 tests passing (achieved)
- 🎯 Maintain 100% test pass rate
- 🎯 Add 20+ tests for v1.1.0 features
- 🎯 Comprehensive documentation for all features

### Adoption
- ✅ Multiple sign-ups from launch talk
- 🎯 10+ community templates by v1.2.0
- 🎯 50+ GitHub stars by v1.2.0
- 🎯 5+ community contributors by v2.0.0

---

## 📝 Notes

### Time Budget Tracking
- **Sat Mar 15**: 4 hours available
- **Sun Mar 16**: 2 hours available
- **Mon Mar 17**: 10 hours available
- **Total**: 16 hours for v1.0.1

### Priority Philosophy
1. **v1.0.x**: Quick wins, setup improvements, no breaking changes
2. **v1.1.0**: Major features that enhance existing workflows
3. **v1.2.0+**: Advanced features and new use cases

### Sync Strategy
- Test all features in private repo first
- Sync to public repo as features complete
- Release v1.0.x incrementally (v1.0.1, v1.0.2, etc.)
- Consolidate to v1.1.0 when feature-complete

---

**For detailed feature tracking**, see [FEATURES.md](./FEATURES.md)
**For known issues**, see [KNOWN_ISSUES.md](./KNOWN_ISSUES.md)
**For bug tracking**, see [BUGS.md](./BUGS.md)
