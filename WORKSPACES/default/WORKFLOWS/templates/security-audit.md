---
id: security-audit
name: Security Audit
description: Monthly security review and vulnerability assessment
schedule: "0 9 1 * *"
enabled: false
targeting:
  communities:
    - Engineering Team
  groups: []
  tags:
    - security
    - devops
  agents: []
executionMode: managed
author: system
owner: engineer
---

# Security Audit Workflow

## Objective
Conduct a comprehensive security review of systems, dependencies, and access controls.

## Instructions

### 1. Dependency Audit
- Run `npm audit` or equivalent for all projects
- Review critical and high severity vulnerabilities
- Check for outdated dependencies (>6 months old)
- Identify packages with known security issues

### 2. Access Control Review
- **User Accounts**: Review active user accounts and permissions
- **API Keys**: Audit API keys and rotate any >90 days old
- **Service Accounts**: Review service account permissions
- **SSH Keys**: Check for unauthorized SSH keys

### 3. Infrastructure Review
- **Firewall Rules**: Review and tighten firewall configurations
- **TLS/SSL**: Verify certificates are valid and up to date
- **Database Security**: Check database access controls and encryption
- **Secrets Management**: Ensure no secrets in code or logs

### 4. Compliance Check
- **Data Privacy**: Review data handling practices (GDPR, CCPA)
- **Logging**: Ensure audit logs are enabled and retained
- **Backup Security**: Verify backups are encrypted and tested
- **Incident Response**: Review incident response runbooks

### 5. Action Items
For each issue identified:
- **Severity**: Critical / High / Medium / Low
- **Impact**: What's at risk?
- **Remediation**: Steps to fix
- **Timeline**: When will this be addressed?

## Output Format
Provide a security report including:
- Executive summary of findings
- Detailed list of vulnerabilities with severity ratings
- Prioritized remediation plan
- Compliance status
