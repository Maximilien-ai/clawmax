# ClawMax

**Multiagent orchestration platform for OpenClaw**

ClawMax provides a web-based platform to manage, monitor, and orchestrate OpenClaw AI agent teams. Deploy team [templates](https://github.com/Maximilien-ai/templates), visualize workflow DAGs, track progress, and coordinate agents across your entire ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.4.9-green.svg)](https://github.com/Maximilien-ai/clawmax/releases)
[![Tests](https://img.shields.io/badge/tests-72%20default--safe-brightgreen.svg)](SYSTEM/test.sh)

---

## 🔥 Latest Release: v1.4.9

- Agent chat history now persists reliably across reopen:
  - dashboard chat uses stable agent-scoped sessions
  - persisted runtime session mapping is recovered more defensively when aliases drift
- Skills are much more operator-friendly:
  - imported registry skills preserve richer metadata
  - skill tags are editable after import/creation
  - Skills page now supports explicit tag filtering
  - setup-needed skills are flagged more consistently and setup/install states stay distinct
- Runtime/setup alignment improved:
  - Opik tracing and metering now honor workspace-stored Opik workspace/project settings when env does not override them
  - `setup.sh` no longer silently defaults auth mode or Opik project names in open-source setup

## 🔥 Previous Release: v1.4.8

- Managed on-prem Ollama BYOK now follows the runtime contract correctly:
  - the BYOK wizard now prefers the runtime-provided `defaultOllamaBaseUrl` over stale browser-local `localhost` values on managed on-prem instances
  - model discovery, runtime validation, and saved Ollama defaults now use that effective runtime URL
  - explicit non-local custom Ollama overrides still win when the user intentionally sets them
- BYOK layout is tighter:
  - removed the redundant second provider selector row
  - collapsed the stacked intro/status sections so the provider editor cards start higher and no longer leave a large blank gap above them

## 🔥 Previous Release: v1.4.7

- On-prem/dashboard identity is now more reliable:
  - Opik metering traces now carry `instance_key`, `machine_id`, and `machine_name`
  - Budget and metering views now key on-prem usage by runtime identity, not just generic dashboard hostname
  - this prevents different Macs or on-prem instances from colliding when older runtime hostnames are reused
- Gateway health is stricter and more trustworthy:
  - gateway health now requires authenticated success instead of treating an open port as a healthy runtime
  - cloud/on-prem instances stop showing a false green gateway state when token/authenticated RPC is actually failing
- On-prem Ollama UI is now conservative:
  - dashboard only shows Ollama BYOK/UI when both `ollamaEnabled` is true and a non-empty `defaultOllamaBaseUrl` are present
  - this avoids showing Ollama as available on package lines where the runtime has not wired the base URL yet

Older releases are kept in [CHANGELOG.md](CHANGELOG.md).

---

## 🌟 Features

### Agent Management
- **Visual Agent Roster** - View all agents with status, tags, and activity
- **Agent Creation** - Bootstrap new agents from templates or use built-in system agents to generate your agents passing description
- **Organization Templates** - Import pre-configured agent teams or organizations
- **Skills Assignment** - Assign 50+ built-in skills to agents or import your own skill and assign
- **Tag-based Filtering** - Organize agents by role, project, or capability

### Communication & Monitoring
- **Real-time Chat** - Interactive chat with any agent via CLI proxy
- **Group Conversations** - Multiagent group chats and communities
- **Activity Feed** - Track agent actions, file changes, and workflow executions
- **Status Dashboard** - System health, agent count, workspace metrics, and optionally costs and budget via Opik (requires Comet Opik service)
- **Budget Controls** - Workspace-level budget visibility and enforcement to pause costly execution before spend drifts
- **Opik Trace Attribution** - Manual chats and workflow runs now stamp workspace, agent/workflow, and real dashboard user identity into trace metadata so shared projects can still be filtered cleanly by user and workspace

### Authentication & Keys
- **GitHub OAuth Login** - GitHub remains the primary general-purpose dashboard login path
- **Email OTP Login** - Single-user hosted/operator-managed login mode with allowlisted email(s), short-lived codes, and persistent session cookies after verification
- **Workspaces Integrations / BYOK** - Users can configure hosted and local model providers plus optional integrations for their agents and workflows
- **Keys & Secrets Browser Vault** - A central browser-local vault can capture reusable provider and partner keys once, then prefill matching template, workflow, skill, and integration inputs
- **Browser-Local Runtime Secrets** - Templates, workflows, and skills can request browser-local secrets like API keys, event slugs, or export paths without persisting them to the server by default
- **Separated Key Policy** - Dashboard/system actions use `SYSTEM_*` keys; user execution prefers BYOK or `USER_*` keys

Keys & Secrets safety model:
- Values in `Keys & Secrets` are stored in the current browser only. They are meant to centralize capture and reuse across dashboard forms, not to act as a secure remote secrets manager.
- ClawMax uses the browser vault to prefill matching inputs for templates, workflows, skills, and visible partner integrations. Users can still override values locally for a specific apply/run/edit flow.
- Browser-local values are not a substitute for proper server-side or infrastructure secret management. For production hosted or operator-managed deployments, keep system/runtime secrets in environment variables, secret stores, or your platform’s native secret manager.
- If you share a browser profile or machine, treat browser-local vault contents as locally accessible to that profile. Clear or rotate values when changing environments or handing a machine to someone else.

### Workflows & DAG
- **Workflow DAG Visualization** - Interactive dependency graph with parallel lanes and connecting lines
- **DAG Execution Engine** - Auto-advance pipeline: complete → check deps → trigger next
- **Workflow Designer** - Create scheduled or manual workflows
- **Progress Tracking** - Real-time progress bars from agent stdout activity
- **Blocker Surfacing** - Agents declare blockers, rendered as actionable notifications
- **Agent Targeting** - Route workflows by tags, groups, or communities
- **Execution History** - Track workflow runs and results
- **Structured Workflow Inputs** - Persist kickoff/start input summaries in execution records for better dashboards and traceability
- **Cron Scheduling** - Set recurring workflows with flexible schedules
- **WORKFLOW.md Format** - Define workflows as YAML frontmatter + markdown

### Templates
- **50+ Organization Templates** - Business, technical, personal, science, travel, hobbies, family, events, markets, product research, and launch proposal templates
- **25 Reusable Agent Templates** - Leadership, engineering, research, events, testing, market, product, competitive, astronomy, and prototype roles that can be reused independently
- **Editable Workspace Variants** - Start from built-in agent and organization templates, refine them, and save workspace-local variants without overwriting system templates
- **5-Step Template Wizard** - Team Type → Composition → Communication → Workflows → Preview
- **Secrets Step for Secure Inputs** - Templates with secret or runtime-input requirements now get a browser-local `Secrets` step during apply
- **AI Generate** - Describe a team, AI fills all wizard steps
- **Local-First Template Feedback** - Templates can collect star ratings and short optional feedback locally in the active workspace, and can optionally proxy the same payload to a remote web sink when configured
- **Smart Workflow Customization** - Dynamic form fields (dropdowns, checkboxes) from template placeholders
- **GitHub Coordination** - Toggle to add github skills and inject repo instructions into all workflows
- **Category Filters** - Business, Technical, Personal, Events, Science, Travel, Hobbies, and Family template categories
- **Collapsible Template Sections** - Collapse or expand Agent / Organization / Workflow sections while browsing
- **TEMPLATE.md Format** - Lean markdown format with structured body sections
- **Import/Export** - Download and upload templates and workflows as `.md` files

Local template feedback for developers:
- Template ratings and short feedback are stored in the active workspace at `WORKSPACE/SYSTEM/template-feedback.json` by default
- This is intentional for local dev and OSS use: you can inspect, back up, diff, or clear that file directly
- If you set all three remote feedback env vars below, the dashboard will submit feedback to the remote sink instead of the local workspace file:
  - `TEMPLATE_FEEDBACK_REMOTE_URL`
  - `TEMPLATE_FEEDBACK_SUMMARY_URL`
  - `TEMPLATE_FEEDBACK_TOKEN`
- The dashboard client still uses the same local `/api/templates/.../feedback` routes either way; the server decides whether to use local workspace JSON or the configured remote sink

### Workspace Visibility
- **Shareable Workspace Dashboards** - Generate public read-only links for workspace status, workflows, costs, results, and group chats
- **Compact Summary Charts** - Dense compact-mode agent/workflow/notification visual summaries
- **Display Modes** - Compact, Standard, and Detail views for different audiences
- **Live Theme Toggle** - Shared dashboards follow ClawMax light/dark preference with a top-right toggle

### Skills Marketplace
- **50+ Built-in Skills** - github, slack, web-search, code-review, and more
- **Shipables.dev Registry** - Search, browse, and install from 1,000+ skills
- **Bulk Assignment** - Add skills to multiple agents at once
- **Custom Skills** - Import from local directory or GitHub
- **Partner Skills** - Surface partner-backed skill references and curated install actions from Workspaces Integrations
- **AI Skill Creation** - Generate a new skill scaffold from intent, refine it iteratively, and fill missing `SKILL.md` sections with guidance

### Notifications
- **Dynamic Blocker UI** - Approval buttons, choice pills, input fields, delegation picker
- **Agent Actions** - Restart, pause agents directly from notifications
- **Progress Bars** - Workflow progress in notification dropdown
- **Search** - Filter notifications by title, message, or type

### Open Template & Workflow Registries

ClawMax templates and workflows are open source and community-driven:

- **[Maximilien-ai/templates](https://github.com/Maximilien-ai/templates)** — 40+ organization templates with [TEMPLATE.md spec](https://github.com/Maximilien-ai/templates/blob/main/spec/template-spec.md)
- **[Maximilien-ai/workflows](https://github.com/Maximilien-ai/workflows)** — 18+ workflow definitions with [WORKFLOW.md spec](https://github.com/Maximilien-ai/workflows/blob/main/spec/workflow-spec.md)

**Contribute your own!** Submit a PR with your TEMPLATE.md or WORKFLOW.md — help the community build better multiagent teams.

### Multi-Workspace Support
- **Workspace Switching** - Manage multiple isolated agent environments
- **Workspace Tagging** - Color-code and label workspaces
- **Independent Configs** - Each workspace has its own agents and settings

---

## 🚀 Quick Start

### Prerequisites

- **OpenClaw** installed and running ([Installation Guide](https://docs.openclaw.ai))
  - **Tested Version**: commit `55c2aaf` (March 2026)
  - **Version Note**: ClawMax evolves quickly with OpenClaw. Prefer a recent OpenClaw build from March 2026 or later.
- **Node.js** 18+ and npm
- **Git** for cloning the repository
- **API Keys** (required for agents):
  - Anthropic API key (`ANTHROPIC_API_KEY`) for Claude models
  - OpenAI API key (`OPENAI_API_KEY`) for GPT models

### Automated Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/Maximilien-ai/clawmax.git
cd clawmax

# Run automated setup
./setup.sh
```

The setup script will:
- ✅ Check prerequisites (Node.js, Git, OpenClaw)
- ✅ Verify OpenClaw version compatibility
- ✅ Install dashboard dependencies
- ✅ Configure workspace structure
- ✅ Offer auth setup choices for local dev and production
- ✅ Generate authentication token
- ✅ Set up environment variables
- ✅ Verify API keys (with instructions if missing)
- ✅ Optionally install OpenClaw Gateway for chat

For local development, `./setup.sh` now offers:
- `Email OTP` dev mode, which asks what login email you want in `SYSTEM/dashboard/.env`
- `bypass` mode, if you explicitly do not want auth

When you choose local dev `Email OTP`, the latest login code is written to:
- `.clawmax-otp-dev.json`

To uninstall a local ClawMax setup cleanly, run:

```bash
./uninstall.sh
```

This removes the local ClawMax/OpenClaw runtime setup while preserving:
- `WORKSPACES/`
- `~/.openclaw/agents/`
- `~/.openclaw/workspace/`
- `~/.openclaw/workspaces/`

### Manual Installation (Alternative)

```bash
# Clone the repository
git clone https://github.com/Maximilien-ai/clawmax.git
cd clawmax

# Install dependencies
cd SYSTEM/dashboard && npm install && cd ../..

# Set up workspace directories
mkdir -p WORKSPACES/default/{AGENTS,WORKFLOWS,ORG,TEMPLATES,PARTNERS,SYSTEM}
mkdir -p WORKSPACES/default/SKILLS/custom

# Configure dashboard-local env
cp SYSTEM/dashboard/.env.example SYSTEM/dashboard/.env
# Then edit SYSTEM/dashboard/.env with your auth mode and provider keys

# Start the dashboard
./SYSTEM/start.sh

# Dashboard will be available at http://localhost:5173
# API server runs on http://localhost:3001

# Alternate local ports when another instance is already running:
DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5174 DASHBOARD_APP_URL=http://localhost:5174 ./SYSTEM/start.sh
```

Auth options:

```bash
# GitHub OAuth
DASHBOARD_AUTH_MODE=github_oauth

# Email OTP for single-user hosted/operator-managed installs
DASHBOARD_AUTH_MODE=email_otp
OTP_ALLOWED_EMAILS=you@example.com
RESEND_API_KEY=your_resend_api_key
OTP_FROM_EMAIL=max@clawmax.ai

# Local developer OTP flow without live email
OTP_DEV_MODE=log
# Latest code is written to .clawmax-otp-dev.json

# Optional partner visibility in Workspaces Integrations
WORKSPACES_INTEGRATIONS_THIRD_PARTIES=senso,opik,github

# Optional Ollama visibility override for Workspaces Integrations.
# Default:
# - local/native or operator-managed runtime with dashboard .env present: enabled
# - non-interactive hosted runtime with no dashboard .env: hidden
DASHBOARD_ENABLE_OLLAMA=false

# Optional local Ollama runtime endpoint used by dashboard/server execution paths.
# This is the env var the runtime actually reads. Do not use DASHBOARD_OLLAMA_BASE_URL.
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Optional extra partner roots
CLAWMAX_EXTRA_PARTNER_DIRS=$PWD/WORKSPACES/default/PARTNERS
```

Notes:
- Built-in partner definitions ship in the repo-level `PARTNERS/` directory.
- `WORKSPACES/default/PARTNERS` is a good place for local or experimental partner definitions without editing built-ins.
- If you build or deploy the dashboard in a container, make sure the image includes the repo `PARTNERS/` directory.
- `DASHBOARD_ENABLE_OLLAMA` controls only whether Ollama appears in the dashboard UI. It does not provision an Ollama runtime for hosted deployments.
- `OLLAMA_BASE_URL` is the runtime env var used by dashboard/server execution. `DASHBOARD_OLLAMA_BASE_URL` is not used.
- Browser-local BYOK / Workspaces Integrations Ollama settings help the UI and request-scoped execution, but operator-managed local runtime setups should still prefer setting `OLLAMA_BASE_URL` in `SYSTEM/dashboard/.env` so chat/workflows have a stable local execution path after restart.

### First Steps

1. **Create Your First Agent**
   - Open http://localhost:5173
   - Navigate to **Templates** → **Organizations**
   - Import "Small Startup Team" to get CEO, Engineer, and Product Manager agents

2. **Assign Skills**
   - Go to **Skills** tab
   - Select an agent
   - Click skills to assign (github, web-search, email, etc.)

3. **Start a Conversation**
   - Go to **Agents** tab
   - Click on an agent
   - Click the 💬 Chat icon to start a conversation

4. **Create a Workflow**
   - Go to **Workflows** tab
   - Click "New Workflow"
   - Set schedule, target agents, and content
   - Save and enable

5. **Explore Templates & DAG**
   - Go to **Templates** and browse 35+ team templates by category (Business, Technical, Personal, Science, Travel, Hobbies, Family)
   - Try **"Technical Writing"** — creates a full writing team with editor, writers, reviewer, and publisher
   - Try **"ClawMax System Test"** — a test template with 3 agents and a 5-step workflow DAG (kickoff → sequential → parallel → final)
   - After applying a template, go to **Workflows** → click the **◇ DAG view** button to see the dependency graph
   - Each template creates a complete team: agents, communities, groups, and interconnected workflows with kickoff

---

## 🔑 API Key Configuration

ClawMax has two key scopes and one explicit precedence policy:

- `SYSTEM/dashboard/.env` system keys:
  used by dashboard-owned features such as agent generation, workflow generation, cron/system agents, and future platform automations.
- user BYOK/default user keys:
  used by the logged-in user's own agents and workflows by default.

Important:
- provider keys are resolved from `SYSTEM/dashboard/.env` policy, not from shell exports like `~/.zshrc`
- user execution precedence is:
  1. BYOK keys provided in-app
  2. `USER_*` defaults from `SYSTEM/dashboard/.env`
  3. system keys only if `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=true`
- system/dashboard-owned execution precedence is:
  1. `SYSTEM_*` keys from `SYSTEM/dashboard/.env`
  2. `USER_*` fallback only if no system key is configured

Recommended `SYSTEM/dashboard/.env` setup:

```env
SYSTEM_ANTHROPIC_API_KEY=sk-ant-your-system-key
SYSTEM_OPENAI_API_KEY=sk-your-system-key
# Optional default user keys
# USER_ANTHROPIC_API_KEY=sk-ant-your-user-key
# USER_OPENAI_API_KEY=sk-your-user-key
# Optional temporary fallback for user execution
# ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION=false
```

| Variable | Provider | Required |
|---|---|---|
| `SYSTEM_ANTHROPIC_API_KEY` | Anthropic system key | At least one system key |
| `SYSTEM_OPENAI_API_KEY` | OpenAI system key | At least one system key |
| `USER_ANTHROPIC_API_KEY` | Optional default user Anthropic key | Optional |
| `USER_OPENAI_API_KEY` | Optional default user OpenAI key | Optional |
| `ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION` | Lets user agents/workflows fall back to system keys | Optional, defaults to `false` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Required for GitHub auth |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | Required for GitHub auth |
| `CORS_ORIGIN` | Frontend app origin | Required for local/proxied OAuth correctness |
| `DASHBOARD_APP_URL` | Frontend redirect target after login/logout | Optional but recommended |

Without system keys, the dashboard may still boot, but system-generated flows such as agent/workflow generation will be limited. Without user keys, end-user agents should eventually rely on BYOK capture after login.

## 🔐 Dashboard Auth Setup

ClawMax supports three dashboard auth modes:

- `github_oauth`
- `email_otp`
- `bypass`

If `DASHBOARD_AUTH_MODE` is omitted, ClawMax defaults to:

- `github_oauth`

Use:

- `github_oauth` for normal multi-user or GitHub-based owner access
- `email_otp` for single-user hosted or operator-managed installs
- `bypass` only for solo local development when you intentionally do not want auth

### GitHub OAuth

GitHub OAuth is the primary dashboard login path.

Minimum local setup in `SYSTEM/dashboard/.env`:

```env
CORS_ORIGIN=http://localhost:5173
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

Recommended when you want redirects to be explicit:

```env
DASHBOARD_PORT=3001
DASHBOARD_APP_URL=http://localhost:5173
# DASHBOARD_PUBLIC_URL=http://localhost:3001
```

GitHub OAuth app values:
- Homepage URL: `http://localhost:5173`
- Callback URL: `http://localhost:3001/api/auth/github/callback`

If you run on alternate local ports, keep the pair aligned. Example:

```env
DASHBOARD_PORT=3002
DASHBOARD_CLIENT_PORT=5174
DASHBOARD_APP_URL=http://localhost:5174
CORS_ORIGIN=http://localhost:5174
```

### Email OTP

Email OTP is the recommended login mode for single-user hosted and operator-managed installs.

Minimum setup in `SYSTEM/dashboard/.env`:

```env
DASHBOARD_AUTH_MODE=email_otp
OTP_ALLOWED_EMAILS=you@example.com
RESEND_API_KEY=your_resend_api_key
OTP_FROM_EMAIL=ClawMax <onboarding@your-verified-domain.com>
OTP_EMAIL_SUBJECT=Your ClawMax login code
```

Recommended:

```env
OTP_EXPIRY_MINUTES=15
DASHBOARD_APP_URL=http://localhost:5173
# DASHBOARD_PUBLIC_URL=http://localhost:3001
```

Developer mode:

```env
DASHBOARD_AUTH_MODE=email_otp
OTP_ALLOWED_EMAILS=dev@example.com
OTP_DEV_MODE=log
```

`OTP_DEV_MODE` currently supports only:

- `log`

If `OTP_DEV_MODE` is unset, or set to any other value:

- dev OTP logging is disabled
- `email_otp` then requires real email delivery such as `RESEND_API_KEY`

When `OTP_DEV_MODE=log` is enabled:

- no live email is sent
- the OTP is logged to the main dashboard server stdout/stderr stream
- the latest code is written to `.clawmax-otp-dev.json`
- the login UI shows the path after requesting a code

For real email delivery:

- set `RESEND_API_KEY`
- set a verified sender in `OTP_FROM_EMAIL`
- or let OTP fall back to `SIGNUP_FROM_EMAIL` if you intentionally share the sender config with the web app

Recommended local-tool/bootstrap defaults:

```env
DASHBOARD_AUTH_MODE=email_otp
OTP_ALLOWED_EMAILS=developer@example.com
OTP_DEV_MODE=log
OTP_EXPIRY_MINUTES=15
```

### Bypass Auth

Use bypass only for local-only development when you explicitly want no login wall:

```env
DASHBOARD_AUTH_MODE=bypass
```

Legacy compatibility still exists:

```env
BYPASS_OAUTH=true
```

But prefer `DASHBOARD_AUTH_MODE=bypass` going forward.

Detailed setup and troubleshooting:
- [SYSTEM/docs/OAUTH_SETUP.md](SYSTEM/docs/OAUTH_SETUP.md)

---

## 📖 Documentation

### User Guides
- **[Testing Guide](SYSTEM/docs/TESTING_GUIDE.md)** - Unit, API, integration, and manual testing
- **[Release Checklist](SYSTEM/docs/RELEASE_CHECKLIST.md)** - Final pre-release validation
- **[Security Guide](SYSTEM/docs/SECURITY.md)** - Security best practices

### Developer Resources
- **[System Documentation](SYSTEM/docs/README.md)** - Architecture and development
- **[Known Issues](SYSTEM/docs/KNOWN_ISSUES.md)** - Active bugs and workarounds
- **[Backlog](SYSTEM/docs/BACKLOG.md)** - Prioritized backlog and roadmap

### Specifications
- **[TEMPLATE.md Format](https://github.com/Maximilien-ai/templates/blob/main/spec/template-spec.md)** - Template specification
- **[WORKFLOW.md Format](https://github.com/Maximilien-ai/workflows/blob/main/spec/workflow-spec.md)** - Workflow specification

### OpenClaw Integration
- **[OpenClaw Docs](https://docs.openclaw.ai)** - Core platform documentation
- **[Agent Configuration](https://docs.openclaw.ai/agents)** - Agent setup and skills
- **[Gateway Setup](https://docs.openclaw.ai/gateway)** - WebSocket gateway for chat

---

## 🧪 Testing

ClawMax includes 212+ tests across unit, API, and integration suites:

```bash
# Unit + API tests (134 tests, fast, no LLM cost)
./SYSTEM/test.sh

# + Integration tests with live agents (~$0.03, requires keys)
./SYSTEM/test.sh integration

# Check dashboard status
./SYSTEM/status.sh
```

**Test Suites:**
- 78 unit tests (notifications, workflows, validator, templates, skills, and more)
- 134 API tests (26 sections covering all endpoints)
- Integration tests with ClawMax System Test template (live agent DAG execution)

See **[TESTING_GUIDE.md](SYSTEM/docs/TESTING_GUIDE.md)** for full details.

---

## 🛠️ Development

### Project Structure

```
clawmax/                        # ClawMax repo root
├── WORKSPACES/                 # All ClawMax-managed workspaces (v1.0.2+)
│   ├── default/                # Default workspace
│   │   ├── AGENTS/             # Agent configurations
│   │   ├── WORKFLOWS/          # Workflow definitions
│   │   ├── ORG/                # Organization files
│   │   └── TEMPLATES/          # Workspace-local templates (optional)
│   └── TEMPLATES/              # Shared workspace templates
├── TEMPLATES/                  # Global system templates (shared across all workspaces)
│   ├── agents/                 # System agent templates
│   └── organizations/          # System organization templates
├── SYSTEM/
│   ├── dashboard/              # Main dashboard application
│   │   ├── server/             # Express API server
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── routes/         # API routes
│   │   │   └── lib/            # Business logic
│   │   └── client/             # React frontend
│   │       └── src/
│   │           ├── pages/      # Main page components
│   │           └── components/ # Reusable components
│   ├── docs/                   # Documentation
│   ├── start.sh                # Start dashboard
│   ├── stop.sh                 # Stop dashboard
│   ├── status.sh               # Check status
│   └── test.sh                 # Run tests
├── setup.sh                    # Automated installation script
├── LICENSE                     # MIT License
└── README.md                   # This file
```

### Development Commands

```bash
# Start in development mode (hot reload)
./SYSTEM/start.sh --follow

# Stop the dashboard
./SYSTEM/stop.sh

# Check if dashboard is running
./SYSTEM/status.sh

# Run tests
./SYSTEM/test.sh

# Build the dashboard bundle
cd SYSTEM/dashboard
npm run build
```

### Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Node.js, Express, TypeScript
- **Storage**: File-based (markdown files with YAML frontmatter)
- **Communication**: WebSocket (via OpenClaw Gateway), REST API
- **Testing**: Custom test framework with curl + jq

---

## 🔒 Security

ClawMax follows security best practices:

- **Token Authentication** - Dashboard token required for API access
- **Local-first** - All data stored locally, no external services
- **Workspace Isolation** - Each workspace is completely independent
- **Input Validation** - All user inputs validated and sanitized
- **No Secret Commits** - `.env` and token files in `.gitignore`

**For detailed security information**, see [SECURITY.md](SYSTEM/docs/SECURITY.md).

**To report security issues**: Please email security@clawmax.ai (do not open public issues).

---

## 🐛 Known Issues

See **[KNOWN_ISSUES.md](SYSTEM/docs/KNOWN_ISSUES.md)** for active issues and workarounds.

---

## 🗺️ Roadmap

- **Now** — Workflow v2 polish (DAG run buttons, per-workspace budget, cron cascade)
- **Next** — Agent-to-agent messaging, community rules, workflow DAG visualization improvements
- **Later** — Secure multi-user BYOK storage, broader hosted/operator-managed packaging, public template registry

**Full backlog**: [BACKLOG.md](SYSTEM/docs/BACKLOG.md)

---

## 🤝 Contributing

We welcome contributions! Whether it's bug fixes, new features, or documentation improvements.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes**
4. **Run tests** (`./SYSTEM/test.sh`)
5. **Commit your changes** (`git commit -m 'Add amazing feature'`)
6. **Push to branch** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Development Guidelines

- Write tests for new features
- Follow existing code style (TypeScript, React best practices)
- Update documentation for user-facing changes
- Keep commits focused and descriptive

---

## 📄 License

ClawMax is released under the [MIT License](LICENSE).

```
Copyright (c) 2026 ClawMax AI LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 🙋 Support

### Getting Help

- **Documentation**: [SYSTEM/docs/](SYSTEM/docs/)
- **Issues**: [GitHub Issues](https://github.com/Maximilien-ai/clawmax/issues)
- **Blog**: [ClawMax Launch Post](https://maximilien.substack.com/p/clawmax-openclaw-to-the-max)
- **Launch Talk**: [AI Agents 1:1 Event](https://luma.com/hovkz2i1)
- **Talk Recording**: [Google Drive](https://drive.google.com/file/d/1OZAC0d-qMAHsLP-GLp48QQyde_ECJxVy/view?usp=drive_link)
- **LinkedIn Stream**: [Event Page](https://www.linkedin.com/events/aiagents-11-aiassistants-opencl7438349612089851904/theater/)
- **OpenClaw Docs**: [https://docs.openclaw.ai](https://docs.openclaw.ai)

### Commercial Support

Visit **[ClawMax.ai](https://clawmax.ai)** for commercial offerings:

**ClawMax Cloud**
- Fully managed multiagent orchestration platform
- Deploy teams from 35+ templates in minutes
- Built-in workflow DAG visualization and monitoring
- Shipables.dev skill marketplace integration
- No infrastructure to manage

**ClawMax On-Premise**
- Run ClawMax entirely on your own infrastructure
- Full data sovereignty — all agent data, conversations, and API keys stay within your network
- Works behind corporate firewalls with no external dependencies
- Deploy via Docker, Kubernetes, or bare metal
- Connect to your own LLM endpoints (Azure OpenAI, AWS Bedrock, self-hosted models)
- Integrate with internal tools (Jira, Confluence, Slack, custom APIs) via skills
- Ideal for personal use and regulated industries (finance, healthcare, government) requiring data residency

**ClawMax Enterprise**
- Everything in On-Premise, plus:
- Custom agent templates and workflows tailored to your organization
- Priority support with SLA
- SSO/SAML authentication
- Dedicated success manager
- Training and onboarding for your teams

For pricing and inquiries: **contact@clawmax.ai** | **[clawmax.ai](https://clawmax.ai)**

---

## 🌟 Acknowledgments

ClawMax is built on top of [OpenClaw](https://openclaw.ai), the open-source AI agent platform.

Special thanks to:
- The OpenClaw team for the core agent framework
- All contributors who helped shape ClawMax
- Early adopters who provided valuable feedback

---

**Built with ❤️ by the Maximilien.ai ClawMax team**

🦞 **Powered by OpenClaw** | 🚀 **Ready to take for a spin** | 📖 **Well Documented**
