# ClawMax Dashboard Roadmap - March 2026

**Current Version**: v0.8.8
**Focus**: Security Hardening & Production Readiness

NOTE: out of date. Please plan to update Th.

---

NOTE: can we update this list? I feel like some of these items are completed. If yes, mark so and let's start dividing into completed and not and eventually move completed to docs/archive
NOTE2: what is not completed let's make sure we are planning to address especially with up coming demo

## 🎯 This Week: Workflows + Essential Security (Mar 3-7)

### Day 1: Tuesday, Mar 3 ✅
**v0.8.8 - Secure Chat, Auto-completion, Slide UI**
- [x] Fix chat WebSocket connection errors
- [x] Implement auto-completion detection (2s timeout)
- [x] Convert Chat & Status panels to slide mode
- [x] Create comprehensive security documentation
- [x] Track 6 security issues for future work

### Day 2: Wednesday, Mar 4 🎯 **PRIORITY: WORKFLOWS**
**v0.8.9 - Workflows Backend Foundation**
- [ ] Create WORKFLOWS directory structure and validation schema
- [ ] Implement `server/lib/workflows.ts`:
  - Workflow file parser with YAML frontmatter (gray-matter)
  - CRUD operations (create, read, update, delete)
  - TypeScript interfaces (Workflow, WorkflowMetadata)
  - Agent participation resolution (groups + tags + IDs)
- [ ] Create `server/routes/workflows.ts` with 6 endpoints:
  - GET /api/workflows - List all workflows
  - GET /api/workflows/:id - Get workflow details
  - POST /api/workflows - Create new workflow
  - PUT /api/workflows/:id - Update workflow
  - DELETE /api/workflows/:id - Delete workflow
  - GET /api/workflows/:id/participants - Resolve agent participants
- [ ] Add gray-matter dependency for YAML frontmatter parsing
- [ ] Testing & documentation

### Day 3: Thursday, Mar 5 🎯 **PRIORITY: WORKFLOWS UI**
**v0.9.0 - Workflows UI Core**
- [ ] Create `WorkflowsPage.tsx` (new top-level tab in dashboard)
- [ ] Build `WorkflowCard` component (name, schedule, participants count)
- [ ] Build `WorkflowDetailPanel` slide-out (view workflow details)
- [ ] Create `WorkflowEditorDialog` for create/edit
- [ ] Basic markdown editor + YAML frontmatter fields
- [ ] Agent targeting UI (communities, groups, tags, individual IDs)
- [ ] Test full workflow CRUD lifecycle
- [ ] Release v0.9.0

### Day 4: Friday, Mar 6 🎯 **PRIORITY: IMPORT/EXPORT**
**Organization Templates Import/Export + Agent Import**
- [ ] **Agent Import** - Import individual agent from .tar.gz archive
  - `POST /api/agents/import` endpoint
  - Upload .tar.gz → extract → validate → provision
  - UI: "Import Agent" button on Agents page
  - Import dialog with file upload and validation feedback
- [ ] **Organization Template Export** - Export entire org as template
  - `POST /api/templates/export` endpoint
  - Bundle agents, workflows, groups, communities into .tar.gz
  - Include manifest.json with metadata
  - UI: "Export as Template" button in Organizations page
- [ ] **Organization Template Import** - Import org template
  - `POST /api/templates/import` endpoint
  - Extract and validate manifest
  - Provision all agents, create workflows, groups, communities
  - UI: "Import Template" button with upload dialog
- [ ] Workflows integration: Cron scheduler component
- [ ] Testing & documentation

### Day 5: Saturday, Mar 7 (Polish + Security)
**Polish & Essential Security**
- [ ] Polish workflows UI (loading states, error handling, empty states)
- [ ] Integrate workflows into AgentDetailPanel
- [ ] Integrate workflows into Groups/Communities panels
- [ ] Add rate limiting to all endpoints (10/min chat, 30/min status)
- [ ] Implement basic PII redaction in log streams
- [ ] Security testing
- [ ] Update security documentation
- [ ] **Release v0.9.0 with Workflows + Import/Export**

---

## 🚀 Next Week: Multi-Workspace + Advanced Features (Mar 10-14)

### Multi-Workspace Support (P0)
- [ ] Multi-workspace backend implementation
- [ ] Workspace switcher UI
- [ ] Workspace creation flow
- [ ] Workspace isolation and data management

### Workflow Execution Engine
- [ ] Cron scheduler for workflows
- [ ] Workflow execution runner
- [ ] Workflow history/logs
- [ ] Workflow failure handling and retries

### Advanced Security (Deferred from This Week)
- [ ] Device pairing implementation (remove allowInsecureAuth)
- [ ] TLS/WSS support for remote access
- [ ] CSRF protection
- [ ] Full security penetration testing

---

## 📋 Future Features

### P0 (Critical)
- [ ] Multi-organization architecture
- [ ] User authentication & sessions
- [ ] Production deployment guide

### P1 (High Priority)
- [ ] WebSocket-based real-time updates (replace polling)
- [ ] Advanced log filtering and search
- [ ] System resource monitoring
- [ ] Backup & restore functionality

### P2 (Nice to Have)
- [ ] Agent cloning/templates
- [ ] Advanced template management
- [ ] Activity analytics dashboard
- [ ] Mobile-responsive improvements

---

## 🔒 Security Roadmap

### High Priority (This Week)
- [x] Comprehensive security documentation (v0.8.8)
- [ ] Device pairing implementation (v0.8.9)
- [ ] TLS/WSS support (v0.8.9)
- [ ] Rate limiting (v0.8.9)
- [ ] PII redaction (v0.8.9)

### Medium Priority (Next Week)
- [ ] CSRF protection (v0.9.0)
- [ ] Audit logging
- [ ] Content Security Policy headers

### Future Enhancements
- [ ] Multi-user authentication
- [ ] Role-based access control (RBAC)
- [ ] Secrets encryption at rest
- [ ] Token rotation

---

## 📊 Release Schedule

### March 2026
- **v0.8.8** (Mar 3) ✅ - Secure chat, auto-completion, slide UI
- **v0.8.9** (Mar 4) - Rate limiting, PII redaction, device pairing
- **v0.9.0** (Mar 7) - Security hardening complete
- **v1.0.0** (Mar 14) - Production ready

### April 2026
- **v1.1.0** - Multi-workspace support
- **v1.2.0** - Organization templates
- **v1.3.0** - Advanced monitoring & analytics

---

## 🎯 Success Metrics

### User Experience
- Initial load time: < 1s
- Page navigation: Instant
- API response: < 500ms
- Zero crashes during normal operation

### Security
- All high-priority security issues resolved
- TLS/WSS for all connections
- Rate limiting on all endpoints
- PII redaction in logs
- CSRF protection

### Quality
- 100% test pass rate
- Full test coverage for core features
- Zero critical bugs
- Comprehensive documentation

---

Last Updated: 2026-03-03
