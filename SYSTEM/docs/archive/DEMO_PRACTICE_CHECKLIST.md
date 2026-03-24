# Demo Practice Checklist - March 12-13, 2026

**Demo Date**: Friday, March 13 at 5:00 PM
**Target Duration**: 8-10 minutes
**Audience**: TBD
**Goal**: Showcase ClawMax as the orchestration layer OpenClaw needed

---

## Pre-Practice Setup

### Demo Environment Preparation
- [ ] Create dedicated workspace: `demo-friday-5pm`
- [ ] Import "Small Startup Team" template (recommended for simplicity)
- [ ] Start all 3 agent gateways and verify online
- [ ] Pre-run one workflow to have execution history
- [ ] Clear any test data or old logs
- [ ] Take screenshot of clean dashboard state

### Browser Setup
- [ ] Use Chrome or Firefox (best tested browsers)
- [ ] Clear browser cache
- [ ] Close unnecessary tabs
- [ ] Set zoom to 100% or 110% (readable on screen share)
- [ ] Hide bookmark bar: Cmd+Shift+B (Mac) or Ctrl+Shift+B (Windows)
- [ ] Test screen sharing in Zoom/Meet/Teams
- [ ] Verify dashboard looks good when shared

### Backup Materials Ready
- [ ] Screenshot folder with key features
- [ ] Blog post open in tab (for fallback)
- [ ] DEMO_BACKUP_PLAN.md accessible
- [ ] Commands to restart agents handy:
  ```bash
  openclaw gateway start demo-ceo
  openclaw gateway start demo-engineer
  openclaw gateway start demo-product-manager
  ```

---

## Demo Script (8-10 minutes)

### Section 0: Opening (30 seconds)
**Goal**: Hook the audience with the problem ClawMax solves

**Script**:
> "Hi everyone! I'm excited to show you ClawMax—the orchestration layer OpenClaw needed. After running 15+ agents for weeks, I hit chaos: terminal windows everywhere, no visibility, manual coordination. So I built ClawMax to make managing 100 agents as easy as managing 10."

**Checklist**:
- [ ] Open dashboard to main Agents page
- [ ] Practice opening line 3 times
- [ ] Time it: Should be ≤30 seconds
- [ ] Sound confident and energetic

**Notes**:
```
(Practice notes: What worked? What felt awkward?)
```

---

### Section 1: Dashboard Overview (1 minute)
**Goal**: Show visual management of agent ecosystem

**Script**:
> "First, the dashboard. Here's my agent team—3 agents with real-time online status. See the green indicators? These agents are live and ready. Each card shows their identity, role, communities they belong to, and tags for targeting."
>
> "I can filter by status, community, or tags—watch: [filter by 'engineer' tag]. And I can switch views—grid, list, or table—depending on what I need."

**Actions**:
- [ ] Point out agent cards with status indicators
- [ ] Hover over an agent card (show interactivity)
- [ ] Click tag filter or community filter
- [ ] Switch to list view, then back to grid
- [ ] Note online count in header

**Checklist**:
- [ ] All 3 agents showing "online" status
- [ ] Agent cards display clearly (not cut off)
- [ ] Filters work instantly
- [ ] View switcher responsive
- [ ] No JavaScript errors in console

**Time check**: This section should take ~1 minute

**Notes**:
```
(What to emphasize? Any UI glitches?)
```

---

### Section 2: Organizational Structure (1 minute)
**Goal**: Show how agents are organized into communities and groups

**Script**:
> "ClawMax adds organizational structure to OpenClaw. Navigate to Organizations—here I've got communities and groups, just like Slack channels. My Startup Team has a Daily Standup group with all 3 agents. This structure lets me target workflows to specific teams."

**Actions**:
- [ ] Navigate to Organizations page
- [ ] Point out community hierarchy
- [ ] Expand a community to show groups
- [ ] Show agent membership counts
- [ ] Mention chat icons for quick access

**Checklist**:
- [ ] Organizations page loads cleanly
- [ ] Hierarchy displays correctly
- [ ] Can see agent members
- [ ] Communities/groups match template

**Time check**: ~1 minute total elapsed = 2 minutes

**Notes**:
```
(Is structure clear? Should I expand on this?)
```

---

### Section 3: Trigger a Workflow (2 minutes)
**Goal**: Demonstrate multiagent coordination with one click

**Script**:
> "Now the real power—workflows. Here's a Daily Standup workflow targeted at my engineering community. It's scheduled for 9 AM every weekday, but I can also run it manually. Watch—[click 'Run Now']. ClawMax sends this prompt to all 3 agents simultaneously via OpenClaw's gateway."

**Actions**:
- [ ] Navigate to Workflows page
- [ ] Find "Daily Standup" workflow
- [ ] Open workflow details (show targeting)
- [ ] Point out schedule (cron expression)
- [ ] Click "Run Now" button
- [ ] Wait for execution to start

**Script (continued)**:
> "The execution just started. Let's watch it in real-time..."

**Checklist**:
- [ ] Workflow loads and displays correctly
- [ ] Targeting is clear (shows community/tags)
- [ ] "Run Now" button works
- [ ] Execution starts immediately
- [ ] Redirects to Executions page or shows toast

**Time check**: ~2 minutes total elapsed = 4 minutes

**Notes**:
```
(How long does execution take to start? Any lag?)
```

---

### Section 4: Execution Tracking (2 minutes)
**Goal**: Show real-time visibility into agent activity

**Script**:
> "Here's the execution tracking page. See the participants? All 3 agents are processing the workflow. Their statuses update in real-time: pending, running, completed."
>
> [Wait for first agent to complete]
>
> "There's the first response—my CEO agent just checked in. And here come the others..."
>
> [Wait for all to complete]
>
> "Done. All 3 agents responded. I can see their individual responses, execution logs, and duration. This execution is saved in history—perfect for compliance or debugging."

**Actions**:
- [ ] Show execution details page
- [ ] Point out participant list
- [ ] Watch statuses update live
- [ ] Click into first completed agent response
- [ ] Show execution logs (optional)
- [ ] Note completion toast/notification

**Checklist**:
- [ ] Execution page loads and updates automatically
- [ ] All 3 agents complete successfully
- [ ] No timeout errors
- [ ] Responses are viewable
- [ ] Completion notification appears
- [ ] Execution marked "completed" with timestamp

**Time check**: ~2 minutes total elapsed = 6 minutes

**Timing note**: If agents take >60 seconds to respond, have a backup plan (show previous execution)

**Notes**:
```
(Agent response times? Any slow agents?)
```

---

### Section 5: Templates Library (1 minute)
**Goal**: Show how easy it is to replicate setups

**Script**:
> "Setting this up took me 30 seconds using templates. Navigate to Templates—here are pre-built workflow templates, agent templates, and full organization templates. Want a QA team? Import this template, and you get 3 QA agents plus 4 workflows instantly. It's like Docker Compose for AI agents."

**Actions**:
- [ ] Navigate to Templates page
- [ ] Show workflow templates section
- [ ] Show agent templates section
- [ ] Show organization templates section
- [ ] Open one template to show preview
- [ ] Mention customization options

**Checklist**:
- [ ] Templates page loads with all sections
- [ ] Can see template cards
- [ ] Template preview opens smoothly
- [ ] All 3 template types visible

**Time check**: ~1 minute total elapsed = 7 minutes

**Notes**:
```
(Which template to highlight as example?)
```

---

### Section 6: Communication (1 minute)
**Goal**: Show group messaging and chat integration

**Script**:
> "Finally, communication. ClawMax has built-in group chat integrated with OpenClaw's gateway. Here's my Startup Team channel—I can message all agents at once or individually. Watch—[send message: 'What's everyone working on?']. Agents respond right here in the thread."

**Actions**:
- [ ] Navigate to Communication page
- [ ] Show channel list
- [ ] Click into a group (e.g., "Startup Team" or "Daily Standup")
- [ ] Send a test message
- [ ] Wait for agent responses (10-30 seconds)
- [ ] Show responses appear in chat

**Checklist**:
- [ ] Communication page loads
- [ ] Channels visible
- [ ] Can select and enter a channel
- [ ] Message sends successfully
- [ ] Agent responses appear (may take 10-30 sec)
- [ ] No @all issue errors

**Time check**: ~1 minute total elapsed = 8 minutes

**Notes**:
```
(Agent response time in chat? Any delays?)
```

---

### Section 7: Closing (1 minute)
**Goal**: Summarize value prop and call to action

**Script**:
> "That's ClawMax—visual management, workflow automation, execution tracking, templates, and communication—all built on OpenClaw's foundation. It makes managing 100 agents as easy as managing 10."
>
> "It's demo-ready today, open source, and the blog post just went live. Check it out at ClawMax.ai. Questions?"

**Actions**:
- [ ] Return to Dashboard home
- [ ] Show clean, organized interface
- [ ] Mention ClawMax.ai website
- [ ] Mention blog post on Substack
- [ ] Open for questions

**Checklist**:
- [ ] Dashboard still responsive
- [ ] All agents still online
- [ ] Confident closing
- [ ] CTA is clear

**Time check**: Total demo = 8-9 minutes

**Notes**:
```
(Strong finish? Any final points to add?)
```

---

## Practice Sessions

### Practice Run #1
**Date**: _____________
**Time**: _____________
**Duration**: ___ min ___ sec

**Section Timing**:
- Opening: ___ sec
- Dashboard: ___ min
- Organizations: ___ min
- Workflow Trigger: ___ min
- Execution Tracking: ___ min
- Templates: ___ min
- Communication: ___ min
- Closing: ___ min

**Issues encountered**:
```
1.
2.
3.
```

**What worked well**:
```
1.
2.
3.
```

**What to improve**:
```
1.
2.
3.
```

**Confidence level**: 1 2 3 4 5 (circle one)

---

### Practice Run #2
**Date**: _____________
**Time**: _____________
**Duration**: ___ min ___ sec

**Improvements from Run #1**:
```
-
-
-
```

**New issues**:
```
-
-
```

**Confidence level**: 1 2 3 4 5 (circle one)

---

### Practice Run #3 (Optional - if time permits)
**Date**: _____________
**Time**: _____________
**Duration**: ___ min ___ sec

**Confidence level**: 1 2 3 4 5 (circle one)

---

## Demo Day Preparation (Friday 4:00 PM)

### Pre-Flight Checklist (30 minutes before demo)
- [ ] **Dashboard**: Running and responsive
- [ ] **Agents**: All 3 online (CEO, Engineer, PM)
- [ ] **Workspace**: `demo-friday-5pm` selected
- [ ] **Browser**: Chrome/Firefox, cache cleared, zoom set
- [ ] **Screen sharing**: Tested in Zoom/Meet/Teams
- [ ] **Audio**: Tested and working
- [ ] **Phone**: On silent mode
- [ ] **Water**: Nearby (stay hydrated!)
- [ ] **Backup plan**: DEMO_BACKUP_PLAN.md open in tab
- [ ] **Execution history**: At least 1 completed workflow visible
- [ ] **No embarrassing tabs**: Close personal stuff
- [ ] **Full screen mode**: Know how to toggle (F11 or Cmd+Ctrl+F)

### 5 Minutes Before Demo
- [ ] Take a deep breath
- [ ] Load dashboard to Agents page
- [ ] Verify all agents online one last time
- [ ] Close unnecessary applications
- [ ] Start screen sharing (test it)
- [ ] Smile—you got this! 😊

---

## Backup Plans 🛟

### If Workflow Execution Fails
**Plan A**: Show a pre-recorded execution from history
- Navigate to Executions page
- Open the execution you ran earlier
- Walk through the completed execution

**Plan B**: Restart agents quickly
```bash
# In terminal (have this ready)
openclaw gateway restart demo-ceo
openclaw gateway restart demo-engineer
openclaw gateway restart demo-product-manager
```
Wait 15 seconds, refresh dashboard, retry workflow

**Plan C**: Skip to next section
- Say: "Let me show you execution tracking with a previous run..."
- Move to execution history

### If Agent Goes Offline
**Plan A**: Switch to backup workspace
- Have a second workspace with agents already online
- Switch workspaces in dashboard (top-left dropdown)
- Continue demo

**Plan B**: Restart offline agent
```bash
openclaw gateway start <agent-id>
```

### If UI Freezes or Glitches
**Plan A**: Reload page quickly
- Have second browser tab with dashboard loaded
- Switch tabs, continue from there

**Plan B**: Clear cache and reload
- Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

### If Complete System Failure
**Plan A**: Use screenshots and narration
- Open screenshot folder
- Walk through features using static images
- Say: "Let me show you how this works with these screenshots..."

**Plan B**: Show blog post
- Open blog post on Substack
- Walk through features with blog images and videos
- Describe what you would have shown live

### If @all Message Issue Occurs
**Workaround**: Send messages individually
- Don't use @all during demo
- Send message to group normally (without @all)
- Agents should still receive and respond

---

## Question & Answer Preparation

### Expected Questions

**Q1: "How does this integrate with OpenClaw?"**
**A**: ClawMax reads and writes OpenClaw workspace files directly. It uses the same gateway API for messaging, and it spawns the OpenClaw CLI for workflow execution. Your existing agents work without modification.

**Q2: "Can I use my existing OpenClaw agents?"**
**A**: Yes! ClawMax works with any OpenClaw workspace. Point it at your workspace directory, and it'll discover all your agents automatically.

**Q3: "What about security?"**
**A**: Currently, ClawMax runs locally (127.0.0.1) with token-based authentication. We're working on production hardening—TLS, RBAC, and rate limiting—for team deployments.

**Q4: "Is this open source?"**
**A**: Yes! MIT license. GitHub repo is Maximilien-ai/clawmax. Check out ClawMax.ai for docs and guides.

**Q5: "Can workflows run on a schedule?"**
**A**: Absolutely. Workflows support cron expressions—run them daily, weekly, hourly, whatever you need. Perfect for standups, status reports, security audits, etc.

**Q6: "How do you handle agent failures?"**
**A**: The dashboard tracks execution status per agent. If an agent times out or fails, you see it immediately in the execution details. You can retry failed workflows or investigate logs.

**Q7: "What's the performance like with 100 agents?"**
**A**: [Be honest] The dashboard has been tested with 20-30 agents. Workflow execution scales well since OpenClaw handles the gateway connections. We're working on pagination and virtualization for 100+ agents.

**Q8: "When can I try this?"**
**A**: Today! Clone the repo, run `npm install && npm run dev`, and you're up. Full setup guide in the README. Blog post has a getting started section too.

---

## Post-Demo Actions

### Immediate (right after demo)
- [ ] Thank attendees
- [ ] Ask for feedback
- [ ] Share blog post link
- [ ] Share ClawMax.ai website
- [ ] Note any questions you couldn't answer

### Within 1 Hour
- [ ] Document feedback in POST_DEMO_NOTES.md
- [ ] List action items from feedback
- [ ] Note what went well
- [ ] Note what to improve

### Follow-up
- [ ] Send recap email with links (if appropriate)
- [ ] Update roadmap based on feedback
- [ ] Prioritize feature requests
- [ ] Celebrate! 🎉

---

## Success Metrics

### Demo Objectives
- [ ] Showed visual management (dashboard)
- [ ] Demonstrated workflow automation
- [ ] Showed real-time execution tracking
- [ ] Highlighted template system
- [ ] Proved it works end-to-end
- [ ] Stayed within 8-10 minutes
- [ ] Handled Q&A confidently

### Audience Engagement
- [ ] Audience understood the problem ClawMax solves
- [ ] Positive reactions to features
- [ ] Questions showed interest
- [ ] People want to try it

### Personal Performance
- [ ] Confident delivery
- [ ] Clear explanations
- [ ] Good pacing
- [ ] Handled issues gracefully
- [ ] Enthusiastic but not over-the-top

---

## Final Thoughts

**Remember**:
- This is a demo-ready MVP, not a perfect product
- It's OK if something minor goes wrong—show how you recover
- The goal is to demonstrate value, not perfection
- You built something impressive—be proud!

**Key message**:
> ClawMax makes managing 100 agents as easy as managing 10.

**If one thing goes wrong**: Stay calm, use backup plan, keep going
**If everything goes wrong**: Laugh, show screenshots, reschedule

**You got this!** 🚀

---

**Last updated**: March 11, 2026 (Evening)
**Review before demo**: Friday 3:30 PM
