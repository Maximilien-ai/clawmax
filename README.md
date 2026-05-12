# ClawMax

**ClawMax dashboard for cloud and on-prem multiagent workspaces**

ClawMax is the dashboard/runtime layer used by the ClawMax cloud and on-prem products. It manages templates, workflows, agents, BYOK integrations, on-prem runtime state, and cloud workspace operations.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.7-green.svg)](https://github.com/Maximilien-ai/clawmax/releases/tag/v1.4.7)

## Recent Releases

Only the latest three dashboard releases are summarized here. For full release history, see [CHANGELOG.md](./CHANGELOG.md).

### v1.4.7
- Agent-to-agent direct messaging API for tighter multiagent coordination.
- Template library expansion with science, personal assistant, travel, hobbies, and family proposal templates.
- Template actions cleanup: actions menu, emoji metadata coverage, and confirmed delete flow.
- Workflow/dashboard polish: markdown import, customization validation, integrations status surfacing, and cost-summary refinement.

### v1.4.6
- CI-stable dashboard line used for cloud/on-prem image verification.
- Includes the template apply onboarding wizard, Gemini provider support, and Ollama workspace integration.
- Carried the recent template/discovery and runtime validation line forward without retargeting older releases.

### v1.4.5
- Earlier execution-path hardening release for template apply and runtime checks.
- Keeps healthy on-prem embedded gateway runtimes visible as online when agents are idle/fresh.
- Preserves the on-prem Ollama contract checks that later releases build on.

## Core Areas

- **Agents & Workflows**: dashboards, workflow execution, workflow import, validation, and agent coordination.
- **Templates**: onboarding wizard, proposal templates, catalog actions, and organization/team setup.
- **BYOK & Integrations**: workspace integrations, provider defaults, and on-prem runtime configuration.
- **Cloud & On-Prem Runtime**: health visibility, maintenance behavior, and deployment-oriented runtime state.

## Development

```bash
git clone https://github.com/Maximilien-ai/clawmax.git
cd clawmax
cd SYSTEM/dashboard && npm install && cd ../..
./SYSTEM/start.sh
```

The dashboard client/server live under `SYSTEM/dashboard`.
