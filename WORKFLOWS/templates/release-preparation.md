---
id: release-preparation
name: Release Preparation
description: Pre-release checklist and preparation workflow
schedule: ""
enabled: false
targeting:
  communities:
    - Engineering Team
  groups: []
  tags:
    - release-manager
  agents: []
executionMode: managed
author: system
owner: release-engineer
---

# Release Preparation Workflow

## Objective
Ensure all pre-release tasks are completed before deploying to production.

## Instructions

### 1. Code Freeze & Branch Prep
- [ ] Release branch created from main (`release/v1.2.0`)
- [ ] Code freeze announced to team
- [ ] All intended PRs merged to release branch
- [ ] Version numbers updated in package files
- [ ] CHANGELOG.md updated with release notes

### 2. Testing & QA
- [ ] All automated tests passing on release branch
- [ ] Manual QA test plan executed
- [ ] Regression testing completed
- [ ] Performance testing completed (if applicable)
- [ ] Security scan passed
- [ ] Database migration tested (if applicable)

### 3. Documentation
- [ ] User-facing documentation updated
- [ ] API documentation updated (if applicable)
- [ ] Internal runbooks updated
- [ ] Known issues documented
- [ ] Migration guide written (for breaking changes)

### 4. Deployment Preparation
- [ ] Deployment plan reviewed and approved
- [ ] Rollback plan documented and tested
- [ ] Infrastructure capacity verified
- [ ] Database backup verified
- [ ] Feature flags configured (if applicable)
- [ ] Monitoring alerts configured

### 5. Communication
- [ ] Release notes drafted and reviewed
- [ ] Customer communication prepared (if customer-facing)
- [ ] Internal announcement prepared
- [ ] On-call engineer assigned for release window
- [ ] Stakeholders notified of deployment schedule

### 6. Sign-Off
- [ ] Engineering manager approval
- [ ] Product manager approval
- [ ] QA lead approval
- [ ] Security team approval (if security-sensitive)

### 7. Go/No-Go Decision
**Release Version**: v1.2.0

**Scheduled Deploy Time**: [Date/Time]

**Deployment Window**: [Duration]

**Go/No-Go Status**: ⏸️ PENDING

**Blockers** (if any):

**Risk Assessment**:
- **Impact**: High / Medium / Low
- **Reversibility**: Can be rolled back / Requires manual intervention
- **Customer Impact**: [Description]

## Output Format
Provide a complete checklist with status of all items and final go/no-go recommendation.
