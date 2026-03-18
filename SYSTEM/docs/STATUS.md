# ClawMax Status & Planning

**Current Version**: v1.1.1+
**Last Updated**: March 18, 2026
**Status**: Active Development — GTC Demo Sprint

---

## Current Sprint: GTC Demo Week (March 17-21)

**Context**: Demoing ClawMax at GTC events. Mobile responsiveness and stability are critical.

### Completed (March 17-18)

1. **v1.1.0 Features** (March 17)
   - Agent config editor (IDENTITY.md, SOUL.md, TOOLS.md)
   - Model override on template apply with provider-grouped dropdown
   - Ngrok URL configurable via `.env`
   - Gateway port auto-detection (18789/18889)
   - Dark mode workflow tags
   - package-lock.json committed

2. **Bug Fixes** (March 17-18)
   - start.sh API key warning false positive (PR #19)
   - SETUP.md for gateway pairing (PR #20)
   - CI OpenClaw CLI build resilience (stub fallback)

3. **Mobile Responsiveness** (March 18)
   - All chat panels responsive (1:1, agent, group)
   - All modal dialogs responsive (15 components fixed)
   - DocHub file browser mobile toggle
   - TopBar compact on small screens
   - Group chat auto-scroll no longer steals input focus

4. **Engineer Agent PRs** (March 18)
   - Reviewed 7 PRs from Engineer agent
   - Merged 2 (real changes: #19, #20)
   - Closed 5 (empty commits: #21-25) with feedback
   - Issues remain open for proper implementation

### In Progress / Next Up

- [ ] Test mobile fixes on iPhone (user testing today)
- [ ] Agent proactive response issue (server-side)
- [ ] Agent API key timeout errors
- [ ] Group chat "responding" indicator stuck

### Blocked / Needs Research

- Agent not proactively updating after first response — needs server-side push or long-polling
- "Forward to group" feature — new feature request from GTC demos
- Branch protection on main

---

## Key Demos

- **March 17 (Mon)**: GTC evening events — discovered mobile issues
- **March 18 (Tue)**: GTC events — mobile fixes deployed
- **March 27 (Thu)**: Presentation demo — ClawMax self-management
- **March 28 (Fri)**: Hackathon demo

---

## Project Health

### Testing
- **Test Count**: 95 tests
- **Pass Rate**: 100%
- **CI**: Fixed — resilient to upstream OpenClaw changes

### Code Quality
- TypeScript with strict mode
- All components mobile responsive (Tailwind sm: breakpoints)
- Dark mode supported (audit needed for stragglers)

### Open Issues (GitHub)
- 14 open issues (#5-#18)
- #5 closed via PR #19
- #17 closed via PR #20
- Issues #11, #12, #15, #16, #18 remain open (PRs were empty)

### Deployment
- **Public Repo**: github.com/Maximilien-ai/clawmax
- **WORKSPACES**: Local only (not committed)
- **Access**: via ngrok (drmaximilien.ngrok.dev)

---

## Docs Review Status (March 18)

| Document | Status | Notes |
|----------|--------|-------|
| BACKLOG.md | Reviewed, updated | NOTEs addressed, items converted to tasks |
| BUGS.md | Reviewed | Schema bug still open, test cleanup still open |
| KNOWN_ISSUES.md | Reviewed | Setup issues mostly resolved, some stale entries |
| FEATURES.md | Reviewed | — |
| ROADMAP.md | Reviewed | Needs update — many items stale |
| SECURITY.md | Reviewed | — |
| TESTING_GUIDE.md | Reviewed | — |
| WORKFLOWS.md | Reviewed | — |
| BLOG_POST_FINAL.md | Reviewed | Published on AI Musings, can archive |
| STATUS.md | Updated this session | You're reading it |
| Planning docs | To review | Will update after mobile testing |

---

## Next Planning Update

Once mobile fixes are tested and GTC demos complete, update:
1. TWO_WEEK_SPRINT_MAR17-28.md — mark completed items
2. WEEK_PLAN_MAR17-21.md — mark completed, adjust remaining days
3. ROADMAP.md — update version targets and completed items
