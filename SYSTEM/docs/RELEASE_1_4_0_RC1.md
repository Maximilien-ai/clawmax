# 1.4.0 RC1 Checklist

Use this as the focused manual pass for the tagged `v1.4.0` line.

## Scope

This RC covers the merged build-a-company line plus the recent runtime and customer UX fixes:

- company templates, company org/dashboard flows, and workflow handoffs
- scheduler timezone correctness and gateway cron sync
- gateway fallback / container startup / builder reliability
- Gemini / Ollama / BYOK runtime compatibility
- metering visibility and caching
- agent-card UX, quick budget action, waiting-for-input follow-through
- communication chat stability
- skill-centric reverse assignment
- event-planning template refinement

## Automated Gate

Run:

```bash
DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/test-with-server.sh
```

Expected:

- all `72` default-safe tests pass
- dashboard auto-start path succeeds
- Docker entrypoint and Dockerfile OpenClaw builder smoke tests pass

## Manual RC1 Smoke

### 1. Agent Cards and Budgets

- Open `Agents` in light mode and dark mode
- Confirm the vertical overflow action button is clearly visible on grid and list cards
- Click the new budget shortcut on an agent card
- Confirm the detail panel opens in budget-edit mode
- Confirm workspace budget context is shown alongside the agent budget

### 2. Waiting-for-Input Notifications

- Trigger an agent/workflow that asks for user input
- Confirm the notification text explains the request clearly
- Confirm opening the notification can take you to the waiting agent details path
- Confirm replying from the inline input still reaches the agent correctly

### 3. Communications Stability

- Open `Communications`
- Open a group/community chat and leave it open through refreshes
- Confirm the thread does not visibly flicker, blank, or reset during polling

### 4. Skills Reverse Assignment

- Open `Skills`
- Open any skill card
- Confirm `Assigned Agents` and `Add Agents` are visible
- Remove one agent from the skill
- Add one agent back from the same skill view
- Confirm the assignment persists

### 5. Metering and Activity

- Open `Activity & Budget`
- Confirm existing metering data appears immediately
- Switch away and back
- Confirm the page does not flash empty/loading again before showing the cached data
- Trigger new agent/workflow activity
- Confirm totals can still increase after fresh traces arrive

### 6. Scheduler / Timezone

- Create or edit a scheduled workflow with timezone `America/Los_Angeles`
- Set cron `0 16 * * *`
- Confirm next-run preview aligns to `4 PM` Los Angeles time
- Confirm the schedule still saves and later executes at the intended local time

### 7. Company Template / Dashboard Smoke

- Apply a company template such as the hack-test company or B2B company
- Confirm one rooted company renders in Organization without duplicate roots
- Run a kickoff workflow and at least one downstream handoff path
- Confirm output/handoff documents are linked from the workflow/dashboard surfaces
- Open the company dashboard in compact and detail modes
- Confirm company input, org summary, workflow output/handoffs, and spend surfaces render without crashing
- Delete and reapply one company to confirm no stale agent/workflow residue blocks reuse

### 8. Event Template Refinement

- Open these templates:
  - `Small Event Planning Desk`
  - `Speaker Event Studio`
  - `Conference Ops Hub`
- Confirm kickoff workflows ask for richer planning constraints
- Confirm downstream workflows ask for concrete markdown outputs and host/operator-ready deliverables

## Release Follow-Through

- Update README and changelog if manual RC1 testing finds wording gaps
- Remind the reporting customer to verify `#122`, `#123`, and `#124`
- Notify the CLI team to build/test the `1.4.0` image from the tagged release commit
- If image or manual validation finds issues, aggregate them into `1.4.1`
