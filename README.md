# ClawMax Dashboard

**The visual management dashboard for OpenClaw multiagent systems**

ClawMax provides a powerful web-based interface to manage, monitor, and orchestrate OpenClaw AI agents. Build teams of specialized agents, assign skills, create workflows, and track activity across your entire agent ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.8-green.svg)](https://github.com/Maximilien-ai/clawmax)
[![Tests](https://img.shields.io/badge/tests-local%20and%20CI-brightgreen.svg)](SYSTEM/test.sh)

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

### Authentication & Keys
- **GitHub OAuth Login** - GitHub is the primary dashboard login path
- **BYOK Preview** - Users can provide their own model keys for their agents and workflows
- **Separated Key Policy** - Dashboard/system actions use `SYSTEM_*` keys; user execution prefers BYOK or `USER_*` keys

### Workflows & Automation
- **Workflow Designer** - Create scheduled or manual workflows
- **Agent Targeting** - Route workflows by tags, groups, or communities
- **Execution History** - Track workflow runs and results
- **Cron Scheduling** - Set recurring workflows with flexible schedules

### Multi-Workspace Support
- **Workspace Switching** - Manage multiple isolated agent environments
- **Workspace Tagging** - Color-code and label workspaces
- **Independent Configs** - Each workspace has its own agents and settings

---

## 🚀 Quick Start

### Prerequisites

- **OpenClaw** installed and running ([Installation Guide](https://docs.openclaw.ai))
  - **Tested Version**: commit `55c2aaf` (March 2026)
  - **Version Note**: ClawMax v1.0.1 is tested with OpenClaw v0.3.0
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
- ✅ Generate authentication token
- ✅ Set up environment variables
- ✅ Verify API keys (with instructions if missing)
- ✅ Optionally install OpenClaw Gateway for chat

### Manual Installation (Alternative)

```bash
# Clone the repository
git clone https://github.com/Maximilien-ai/clawmax.git
cd clawmax

# Install dependencies
cd SYSTEM/dashboard && npm install && cd ../..

# Set up workspace directories
mkdir -p AGENTS WORKFLOWS GROUPS COMMUNITIES

# Configure dashboard-local env
cp SYSTEM/dashboard/.env.example SYSTEM/dashboard/.env
# Then edit SYSTEM/dashboard/.env with your GitHub OAuth values and provider keys

# Start the dashboard
./SYSTEM/start.sh

# Dashboard will be available at http://localhost:5173
# API server runs on http://localhost:3001
```

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
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | Required for login |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | Required for login |
| `CORS_ORIGIN` | Frontend app origin | Required for local/proxied OAuth correctness |
| `DASHBOARD_APP_URL` | Frontend redirect target after login/logout | Optional but recommended |

Without system keys, the dashboard may still boot, but system-generated flows such as agent/workflow generation will be limited. Without user keys, end-user agents should eventually rely on BYOK capture after login.

## 🔐 GitHub OAuth Setup

GitHub OAuth is now the primary dashboard login path.

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

Detailed setup and troubleshooting:
- [SYSTEM/docs/OAUTH_SETUP.md](SYSTEM/docs/OAUTH_SETUP.md)

---

## 📖 Documentation

### User Guides
- **[Testing Guide](SYSTEM/docs/TESTING_GUIDE.md)** - Running tests and validation
- **[Release Checklist](SYSTEM/docs/RELEASE_CHECKLIST.md)** - Final pre-release validation
- **[Workflows Guide](SYSTEM/docs/WORKFLOWS.md)** - Creating and managing workflows
- **[Security Guide](SYSTEM/docs/SECURITY.md)** - Security best practices

### Developer Resources
- **[System Documentation](SYSTEM/docs/README.md)** - Architecture and development
- **[Known Issues](SYSTEM/docs/BUGS.md)** - Bug tracker and workarounds
- **[Roadmap](SYSTEM/docs/ROADMAP.md)** - Future features and timeline

### OpenClaw Integration
- **[OpenClaw Docs](https://docs.openclaw.ai)** - Core platform documentation
- **[Agent Configuration](https://docs.openclaw.ai/agents)** - Agent setup and skills
- **[Gateway Setup](https://docs.openclaw.ai/gateway)** - WebSocket gateway for chat

---

## 🧪 Testing

ClawMax includes a comprehensive test suite covering all major features:

```bash
# Run all tests (92 tests)
./SYSTEM/test.sh

# Run with validation tests (modifies files, use with caution)
./SYSTEM/test.sh --with-validation

# Check dashboard status
./SYSTEM/status.sh

# View logs
tail -f /tmp/dashboard.log
```

**Test Coverage:**
- ✅ TypeScript compilation
- ✅ API endpoints (Health, Agents, Skills, Workflows)
- ✅ Skills assignment and validation
- ✅ Workflow CRUD operations
- ✅ Gateway RPC compatibility
- ✅ Document search and indexing

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

Current known limitations include:

1. **Legacy Agent Compatibility** - Agents created before v1.0.0 may show "missing module" errors. **Workaround**: Delete and recreate from templates.

2. **Empty Workspace Skills Page** - When workspace has no agents, Skills page may show loading state. **Workaround**: Create at least one agent first.

3. **Gateway RPC Test** - Advanced integration test may fail if agent not in global OpenClaw config. This is expected for workspace-only agents.

**For full issue list and workarounds**, see [BUGS.md](SYSTEM/docs/BUGS.md).

---
## 🗺️ Roadmap

- **Now** - workflow scale UX, bulk agent pause, workshop readiness, and issue cleanup
- **Next** - secure multi-user BYOK storage, forward-to-group, and workflow cron reliability
- **Later** - richer templates, community rules, and packaging for cloud/on-prem deployments

**For detailed roadmap**, see [ROADMAP.md](SYSTEM/docs/ROADMAP.md).

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

ClawMax offers two tiers of support:

**Cloud Tier**
- Hosted dashboard solution
- 3 months support (renewable)
- Built-in system agents
- Expanded template library

**On-Premise Tier**
- Self-hosted installation
- 1 year support (renewable)
- Custom agent templates
- Priority support response

For pricing and inquiries: contact@clawmax.ai

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
