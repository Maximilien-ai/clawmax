# SYSTEM Documentation

**Last Updated**: Feb 25, 2026  
**Status**: v0.7.0 Skills & Tools Management complete, Demo Day tomorrow

---

## 📍 Quick Navigation

NOTE: this needs update since lots changed since. We need to point to the PLAN.md and BUGS.md and ROADMAP.md and docs that will not change much. Let's revise please.

### Current Work
- **[STATUS.md](STATUS.md)** - Current system state, health metrics, roadmap
- **[planning/DEMO_DAY_ROADMAP_FEB26.md](planning/DEMO_DAY_ROADMAP_FEB26.md)** - Tonight/Tomorrow/Friday plan

### Active Planning
- **[BUGS.md](BUGS.md)** - Known issues tracker
- **[NEXT_WORK.md](NEXT_WORK.md)** - Feature backlog
- **[planning/DASHBOARD.md](planning/DASHBOARD.md)** - Dashboard feature planning

NOTE: we should include ROADMAP.md here and FAQs.md

### Future Work
- **[features/](features/)** - Planned features (Chat, CLI)
- **[architecture/](architecture/)** - Architecture docs (Chat memory)
- **[operations/](operations/)** - Operational policies

### Historical
- **[archive/](archive/)** - Completed work, old session summaries
- **[planning/archive/](planning/archive/)** - Old planning documents

---

## 📊 Current State

NOTE: out of date but perhaps something to update Th before release since we would likely need to change again.

- **Release**: v0.7.0
- **Tests**: 68/68 passing (100%)
- **Focus**: Demo Day preparation (Feb 26)
- **Next**: v0.8.0 (WhatsApp Link OR In-Dashboard Chat)

---

## 🗂️ Directory Structure

```
SYSTEM/docs/
├── README.md                          # This file
├── STATUS.md                          # Current system status
├── BUGS.md                            # Active bug tracker
├── NEXT_WORK.md                       # Feature backlog
│
├── architecture/                      # Architecture designs
│   └── CHAT_MEMORY.md
│
├── features/                          # Future feature specs
│   ├── CHAT_HISTORY_WORKSPACE.md
│   └── CLAWMAX_CLI_SPEC.md
│
├── operations/                        # Operational docs
│   └── CLEANUP_POLICIES.md
│
├── planning/                          # Active planning
│   ├── DEMO_DAY_ROADMAP_FEB26.md     # Current roadmap
│   ├── DASHBOARD.md                   # Dashboard features
│   └── archive/                       # Historical planning (24 files)
│
└── archive/                           # Completed work (13 files)
    ├── SESSION_SUMMARY_*.md
    ├── SPRINT_STATUS_*.md
    ├── WEEK_STATUS_*.md
    └── ...
```

---

## 🎯 How to Use This Documentation

### For Current Work
1. Check **STATUS.md** for system health and immediate tasks
2. Follow **DEMO_DAY_ROADMAP_FEB26.md** for this week's plan
3. Update **BUGS.md** when issues discovered
4. Add future ideas to **NEXT_WORK.md**

### For Planning
1. Active planning goes in **planning/**
2. When planning completes, move to **planning/archive/**
3. Session summaries go to **archive/** when done
4. Keep only active/future work in main docs

### For Development
1. Dashboard code: `../dashboard/`
2. Tests: `../test.sh`
3. Dev servers: `cd ../dashboard && npm run dev`

---

## 📝 Document Lifecycle

NOTE: love this.

```
New Planning Doc
    ↓
planning/*.md (active)
    ↓
Work completed
    ↓
planning/archive/*.md (done)

Session Summary
    ↓
docs/*.md (active)
    ↓
Session ends
    ↓
archive/*.md (reference)
```

NOTE: can we get a quick getting started section here too? For regular users and devs

---

## 🚀 Quick Commands

NOTE: unsure how useful the lines 130-134 are? instead I would tell them to view current opened issues and take one and start working. For devs. Non devs I would only tell them to get ClawMax up and running in new directory and create workspace an agents. So maybe two sections: devs, users. WDYT?

```bash
# View current status
cat STATUS.md

# View demo plan
cat planning/DEMO_DAY_ROADMAP_FEB26.md

# Start dev servers
cd ../dashboard && npm run dev

# Run tests
cd .. && ./test.sh

# Check bugs
cat BUGS.md
```

---

**Principle**: Keep docs minimal, active, and organized. Archive aggressively.
