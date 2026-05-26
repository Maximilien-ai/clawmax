# AI Builder Web Contract

## Goal

Define the minimum web-team contract required for Dashboard to optionally share AI Builder sessions and feedback with ClawMax.ai in a way that is consistent with template feedback/share.

## Scope

This contract covers:

- Builder prompt / response session sharing
- Builder thumbs up / thumbs down feedback
- attribution/auth
- privacy/TOS support

It does not yet cover:

- full transcript replay UI on the web side
- autonomous Builder creation actions
- Builder-specific analytics dashboards

## Recommended Auth Direction

Mirror the direction already recommended for Template Registry writes:

- trusted dashboard-to-web service auth
- short-lived signed token
- user attribution in token claims
- no extra login prompt inside Dashboard
- no long-lived raw user bearer as the main contract

Suggested env:

- `AI_BUILDER_REMOTE_URL`
- `AI_BUILDER_WRITE_TOKEN`

## Data Types

### 1. Session Share

`POST /api/ai-builder/sessions`

Body:

```json
{
  "workspaceName": "Personal",
  "workspaceId": "personal",
  "sessionId": "builder-archive-123",
  "source": "dashboard_builder",
  "messages": [
    { "role": "user", "content": "I need a support escalation team." },
    { "role": "assistant", "content": "Start from Support Escalation Team..." }
  ],
  "recommendation": {
    "intent": "team_template",
    "scope": "team",
    "operation": "use_template",
    "confidence": "high"
  },
  "matchedAssets": ["support-escalation-team"],
  "feedback": "up"
}
```

Server-side attribution should come from signed token claims, not request body fields.

### 2. Feedback Share

`POST /api/ai-builder/feedback`

Body:

```json
{
  "workspaceName": "Personal",
  "workspaceId": "personal",
  "sessionId": "builder-archive-123",
  "recommendationKey": "team_template|team|use_template|support-escalation-team",
  "feedback": "up"
}
```

## Required Token Claims

- `sub = "ai_builder_write"`
- `iss = "clawmax-web"`
- `aud = "clawmax-dashboard"`
- `iat`
- `exp`
- `instance_key`
- `deployment_kind`
- `user_id`
- `user_email`
- `customer_id`

## Dashboard Requirements

- local-first behavior when no remote URL/token is configured
- clear disclosure when remote sharing is enabled
- ability to export/save sessions locally even if remote share is disabled
- ability to send thumbs feedback independently of full session export

## Web Requirements

- validate signed token
- persist canonical user attribution server-side
- support explicit opt-out / disabled mode for local and on-prem deployments
- reject malformed payloads with stable error payloads
- avoid requiring a separate Builder sign-in flow

## Privacy / Terms Requirements

Before remote sharing is enabled by default:

- Dashboard terms/privacy copy must mention:
  - Builder prompts
  - Builder responses
  - Builder feedback
- product/web should expose deployment-level controls for whether collection is enabled
- on-prem/local installations should be able to keep Builder data local-only
