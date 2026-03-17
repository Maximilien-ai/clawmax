# ClawMax Dashboard

**The visual management dashboard for OpenClaw multi-agent systems**

ClawMax provides a powerful web-based interface to manage, monitor, and orchestrate OpenClaw AI agents. Build teams of specialized agents, assign skills, create workflows, and track activity across your entire agent ecosystem.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/Maximilien-ai/clawmax)
[![Tests](https://img.shields.io/badge/tests-92%2F92-brightgreen.svg)](SYSTEM/test.sh)

---

## 🌟 Features

### Agent Management
- **Visual Agent Roster** - View all agents with status, tags, and activity
- **Agent Creation** - Bootstrap new agents from templates
- **Organization Templates** - Import pre-configured agent teams
- **Skills Assignment** - Assign 50+ built-in skills to agents
- **Tag-based Filtering** - Organize agents by role, project, or capability

### Communication & Monitoring
- **Real-time Chat** - Interactive chat with any agent via WebSocket
- **Group Conversations** - Multi-agent group chats and communities
- **Activity Feed** - Track agent actions, file changes, and workflow executions
- **Status Dashboard** - System health, agent count, and workspace metrics

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

# Configure API keys (add to ~/.openclaw/openclaw.json or export)
export ANTHROPIC_API_KEY='your-key-here'
export OPENAI_API_KEY='your-key-here'

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

ClawMax requires API keys for agent creation and AI model access. Add at least one to `SYSTEM/dashboard/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

| Variable | Provider | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | At least one key |
| `OPENAI_API_KEY` | OpenAI (GPT) | At least one key |
| `GOOGLE_API_KEY` | Google (Gemini) | Optional |

Without API keys, the dashboard will run but agent creation and model selection will be unavailable.

---

## 📖 Documentation

### User Guides
- **[Testing Guide](SYSTEM/docs/TESTING_GUIDE.md)** - Running tests and validation
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
│   ├── demo/                   # Demo workspace
│   ├── test/                   # Test workspace
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

ClawMax v1.0.0 has some known limitations:

1. **Legacy Agent Compatibility** - Agents created before v1.0.0 may show "missing module" errors. **Workaround**: Delete and recreate from templates.

2. **Empty Workspace Skills Page** - When workspace has no agents, Skills page may show loading state. **Workaround**: Create at least one agent first.

3. **Gateway RPC Test** - Advanced integration test may fail if agent not in global OpenClaw config. This is expected for workspace-only agents.

**For full issue list and workarounds**, see [BUGS.md](SYSTEM/docs/BUGS.md).

---

## 🗺️ Roadmap

### v1.0.0 (Current)
- ✅ Agent management and organization
- ✅ Skills assignment (50+ built-in skills)
- ✅ Real-time agent chat
- ✅ Workflow creation and scheduling
- ✅ Multi-workspace support
- ✅ Template system for agents and orgs
- ✅ Activity feed and monitoring

### v1.1.0 (Q2 2026)
- 🔄 Agent performance analytics
- 🔄 Bulk agent operations
- 🔄 Advanced workflow conditions
- 🔄 Custom skill creation UI
- 🔄 Export/import workspace configs

### v2.0.0 (Q3 2026)
- 🔄 Distributed agent deployment
- 🔄 Team collaboration features
- 🔄 Advanced monitoring and alerts
- 🔄 Plugin system for extensions

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

ClawMax is built on top of [OpenClaw](https://openclaw.ai), the open-source multi-agent platform.

Special thanks to:
- The OpenClaw team for the core agent framework
- All contributors who helped shape ClawMax
- Early adopters who provided valuable feedback

---

**Built with ❤️ by the Maximilien.ai ClawMax team**

🦞 **Powered by OpenClaw** | 🚀 **Ready for take for a spin** | 📖 **Well Documented**
