# Workflow Templates

Pre-built workflow templates for common team coordination and automation scenarios.

## Available Templates

### 1. **Daily Standup** (`daily-standup.md`)
**When to use**: Every weekday morning
**Target**: Engineering teams, project teams
**Schedule**: `0 9 * * 1-5` (9 AM weekdays)

Morning sync workflow for team alignment. Prompts agents to provide:
- Yesterday's accomplishments
- Today's priorities
- Blockers and dependencies

**Best for**: Distributed teams, async standup automation

---

### 2. **Weekly Status Report** (`weekly-status-report.md`)
**When to use**: End of each week
**Target**: Managers, team leads
**Schedule**: `0 17 * * 5` (5 PM Friday)

Comprehensive weekly summary including:
- Week accomplishments and metrics
- Next week's plans
- Risks, blockers, and resource needs
- Team health assessment

**Best for**: Leadership visibility, project tracking

---

### 3. **Code Review Reminder** (`code-review-reminder.md`)
**When to use**: Twice daily during work hours
**Target**: Engineers
**Schedule**: `0 10,14 * * 1-5` (10 AM and 2 PM weekdays)

Automated PR review reminders:
- Check open pull requests
- Prioritize reviews by urgency
- Identify blocking PRs
- Plan review schedule

**Best for**: Keeping PR queue moving, reducing bottlenecks

---

### 4. **Sprint Planning** (`sprint-planning.md`)
**When to use**: Start of each sprint cycle
**Target**: Product managers, engineering managers
**Schedule**: `0 9 * * 1` (Monday 9 AM - adjust for your sprint cycle)

Sprint planning preparation workflow:
- Review previous sprint performance
- Capacity planning for upcoming sprint
- Backlog prioritization
- Sprint goal proposal
- Risk assessment

**Best for**: Agile/Scrum teams, two-week sprint cycles

---

### 5. **Security Audit** (`security-audit.md`)
**When to use**: Monthly security review
**Target**: DevOps, security engineers
**Schedule**: `0 9 1 * *` (First day of month, 9 AM)

Comprehensive security review:
- Dependency vulnerability scan
- Access control audit
- Infrastructure security check
- Compliance verification
- Prioritized remediation plan

**Best for**: Security-conscious teams, compliance requirements

---

### 6. **Customer Feedback Review** (`customer-feedback-review.md`)
**When to use**: Weekly feedback analysis
**Target**: Customer success, product teams
**Schedule**: `0 14 * * 1` (Monday 2 PM)

Analyze customer feedback to drive product improvements:
- Support ticket analysis
- Feature request aggregation
- Pain point identification
- Quick win opportunities

**Best for**: Product-market fit iteration, customer-driven development

---

### 7. **Onboarding Checklist** (`onboarding-checklist.md`)
**When to use**: New hire first week
**Target**: New team members, onboarding buddies
**Schedule**: Manual trigger (not automated)

Guided onboarding workflow covering:
- Day 1: Account setup and access
- Days 1-2: System configuration
- Days 2-3: Knowledge transfer
- Days 3-4: Team integration
- Days 4-5: First tasks
- End of week reflection

**Best for**: Consistent onboarding experience, reducing new hire ramp time

---

### 8. **Release Preparation** (`release-preparation.md`)
**When to use**: Before production deployments
**Target**: Release managers, DevOps
**Schedule**: Manual trigger (not automated)

Pre-release checklist ensuring production readiness:
- Code freeze and branch prep
- Testing and QA verification
- Documentation updates
- Deployment preparation
- Stakeholder communication
- Go/no-go decision framework

**Best for**: Production releases, minimizing deployment risks

---

## How to Use Templates

### Option 1: Via Dashboard UI
1. Navigate to Workflows page in ClawMax Dashboard
2. Click "New Workflow" button
3. Select "Use Template" option
4. Choose a template from the list
5. Customize targeting and schedule
6. Save and enable

### Option 2: Via CLI
```bash
# Copy template to active workflows
cp ~/.openclaw/workspace/WORKFLOWS/templates/daily-standup.md \\
   ~/.openclaw/workspace/WORKFLOWS/my-daily-standup.md

# Edit to customize
vim ~/.openclaw/workspace/WORKFLOWS/my-daily-standup.md

# Trigger manually
openclaw workflow run my-daily-standup
```

### Option 3: Direct File Copy
```bash
# List available templates
ls ~/.openclaw/workspace/WORKFLOWS/templates/

# Copy and customize
cp ~/.openclaw/workspace/WORKFLOWS/templates/sprint-planning.md \\
   ~/.openclaw/workspace/WORKFLOWS/sprint-planning-eng-team.md
```

---

## Customization Guide

### Targeting Options

**By Community**:
```yaml
targeting:
  communities:
    - Engineering Team
    - Product & Design
```

**By Group**:
```yaml
targeting:
  groups:
    - Daily check-ins
    - Maximilien.ai - OpenClaw
```

**By Tag**:
```yaml
targeting:
  tags:
    - engineer
    - manager
```

**By Specific Agent**:
```yaml
targeting:
  agents:
    - agent0
    - max0
```

### Schedule Format (Cron Expression)

```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-7, Sun-Sat)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

**Common Schedules**:
- Every weekday 9 AM: `0 9 * * 1-5`
- Every Monday 10 AM: `0 10 * * 1`
- Twice daily: `0 9,17 * * *`
- First of month: `0 9 1 * *`
- Every 2 hours: `0 */2 * * *`

### Execution Modes

**Automated** (workflows run automatically on schedule):
```yaml
executionMode: automated
```

**Managed** (requires manual approval before execution):
```yaml
executionMode: managed
owner: agent0  # Agent who approves execution
```

---

## Best Practices

### 1. Start with Fewer Workflows
- Begin with 1-2 workflows to establish patterns
- Add more as team adopts the system
- Avoid workflow fatigue

### 2. Clear, Actionable Instructions
- Be specific about expected outputs
- Provide context and examples
- Keep instructions concise

### 3. Right-Size Targeting
- Target the right people with the right workflows
- Use tags and groups for flexible targeting
- Avoid over-notifying team members

### 4. Iterate Based on Feedback
- Adjust schedules based on team preferences
- Refine instructions based on agent responses
- Remove workflows that aren't providing value

### 5. Monitor Execution
- Review execution logs regularly
- Check for failed executions
- Ensure agents are responding appropriately

---

## Template Contribution

Have a workflow template you'd like to share?

1. Create your workflow in `WORKFLOWS/templates/`
2. Follow the existing format
3. Add clear documentation
4. Test with your team
5. Submit via pull request or share with community

---

## Support

Questions about workflows?
- Check [ClawMax Documentation](https://github.com/Maximilien-ai/maxclaw)
- Review [OpenClaw Workflow Docs](https://docs.openclaw.org)
- Ask in community channels

**Version**: v1.0.0
**Last Updated**: March 6, 2026
