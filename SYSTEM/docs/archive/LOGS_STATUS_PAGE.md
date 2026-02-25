# Logs & Status Page Feature

**Status:** Planned for Weekend (Stretch Goal)
**Priority:** Medium-High
**Estimated Effort:** 1-1.5 hours
**Created:** 2026-02-20

---

## Overview

A dedicated **Logs & Status** page in the dashboard that provides:
- Real-time server crash logs
- Per-agent log tailing
- System health monitoring
- Process status tracking
- Resource usage metrics

**Why Important:**
- Visibility into what's happening across the system
- Quick debugging when things go wrong
- Proactive monitoring before issues become critical
- Central operations hub for the entire agent network

---

## Features

### 1. Dashboard Server Logs
**What:** View recent crash.log entries in the UI

**UI:**
```
┌─────────────────────────────────────────────────┐
│ Dashboard Server Logs                           │
├─────────────────────────────────────────────────┤
│ Filter: [All ▼] [Info] [Warn] [Error] [Crash]  │
│                                                 │
│ [2026-02-21 02:18:39] SERVER STARTING          │
│ [2026-02-21 02:18:39] Server started on 3001   │
│ [2026-02-21 02:18:39] Workspace: ~/.openclaw   │
│                                                 │
│ [Auto-scroll ☑]  [Clear]  [Download]           │
└─────────────────────────────────────────────────┘
```

**Features:**
- Last 100 lines by default
- Filter by event type
- Auto-scroll toggle
- Download full log
- Refresh button

---

### 2. Agent Logs
**What:** View and tail logs for each agent

**UI:**
```
┌─────────────────────────────────────────────────┐
│ Agent Logs                                      │
├─────────────────────────────────────────────────┤
│ Select Agent: [engineer ▼]                     │
│                                                 │
│ [2026-02-21 14:30] [INFO] Agent started        │
│ [2026-02-21 14:31] [INFO] WhatsApp connected   │
│ [2026-02-21 14:32] [WARN] Rate limit reached   │
│ [2026-02-21 14:33] [ERROR] Message failed      │
│                                                 │
│ [Live Stream ☑]  [Filter: All ▼]  [Download]   │
└─────────────────────────────────────────────────┘
```

**Features:**
- Dropdown to select agent
- Live streaming (SSE) toggle
- Filter by log level
- Search/grep within logs
- Download agent logs

**Log Sources:**
1. OpenClaw gateway logs (if available via CLI)
2. Agent memory files (`maxN/memory/YYYY-MM-DD.md`)
3. Process stdout/stderr (if captured)

---

### 3. System Status Overview
**What:** Dashboard health and metrics

**UI:**
```
┌─────────────────────────────────────────────────┐
│ System Status                                   │
├─────────────────────────────────────────────────┤
│ Dashboard Server                                │
│   Status: ● Running                             │
│   Uptime: 2h 34m                                │
│   Port: 3001                                    │
│   Memory: 145 MB                                │
│                                                 │
│ OpenClaw Gateway                                │
│   Status: ● Running (3 instances)               │
│   Processes: gateway, max1-watcher, max2-watcher│
│                                                 │
│ Workspace                                       │
│   Path: /Users/max/.openclaw/workspace          │
│   Agents: 8 total, 5 online, 2 offline, 1 idle  │
│   Disk Usage: 234 MB / 10 GB                    │
│                                                 │
│ Git Repository                                  │
│   Branch: main                                  │
│   Status: ✓ Clean (0 uncommitted changes)      │
│   Last Commit: 2 hours ago                      │
└─────────────────────────────────────────────────┘
```

**Metrics:**
- Server uptime (process.uptime())
- Memory usage (process.memoryUsage())
- Agent counts by status
- OpenClaw process status
- Git status (branch, uncommitted changes)
- Workspace disk usage

---

### 4. Process Manager
**What:** View and manage running processes

**UI:**
```
┌─────────────────────────────────────────────────┐
│ Running Processes                               │
├─────────────────────────────────────────────────┤
│ PID    │ Name              │ Status  │ Actions  │
├────────┼───────────────────┼─────────┼──────────┤
│ 12345  │ dashboard-server  │ Running │ [Restart]│
│ 12346  │ openclaw-gateway  │ Running │ [Stop]   │
│ 12347  │ max1-instance     │ Running │ [Restart]│
│ 12348  │ max2-instance     │ Running │ [Restart]│
│ 12349  │ whatsapp-conn     │ Running │ [Stop]   │
└────────┴───────────────────┴─────────┴──────────┘
```

**Features:**
- List all related processes
- Show PID, name, status
- Restart/stop actions (with confirmation)
- Memory/CPU per process (optional)

---

## Technical Implementation

### Backend API

#### 1. Server Logs Endpoint
```typescript
// GET /api/logs/server?lines=100&level=all
router.get('/server', (req, res) => {
  const lines = parseInt(req.query.lines as string) || 100
  const level = req.query.level as string || 'all'

  const logPath = path.join(__dirname, 'logs', 'crash.log')
  const content = fs.readFileSync(logPath, 'utf-8')
  const allLines = content.split('\n').slice(-lines)

  // Filter by level if needed
  const filtered = level === 'all'
    ? allLines
    : allLines.filter(line => line.includes(level.toUpperCase()))

  res.json({ logs: filtered })
})
```

#### 2. Agent Logs Endpoint
```typescript
// GET /api/logs/agents/:id?lines=100
router.get('/agents/:id', (req, res) => {
  const { id } = req.params
  const lines = parseInt(req.query.lines as string) || 100

  // Option 1: Read from agent memory files
  const memoryPath = path.join(WORKSPACE, id, 'memory', `${today}.md`)

  // Option 2: Read from OpenClaw logs
  // const logs = execSync(`openclaw logs ${id} --lines ${lines}`)

  const content = fs.readFileSync(memoryPath, 'utf-8')
  const recentLines = content.split('\n').slice(-lines)

  res.json({ logs: recentLines })
})
```

#### 3. Agent Logs Streaming (SSE)
```typescript
// GET /api/logs/agents/:id/stream
router.get('/agents/:id/stream', (req, res) => {
  const { id } = req.params

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // Tail agent logs and stream updates
  const tailProcess = spawn('tail', ['-f', logPath])

  tailProcess.stdout.on('data', (data) => {
    res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`)
  })

  req.on('close', () => {
    tailProcess.kill()
  })
})
```

#### 4. System Status Endpoint
```typescript
// GET /api/status
router.get('/status', (req, res) => {
  const agents = listAgents()

  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      port: PORT,
    },
    workspace: {
      path: WORKSPACE,
      agentCount: agents.length,
      onlineCount: agents.filter(a => a.status === 'online').length,
      diskUsage: getDiskUsage(WORKSPACE), // du -sh
    },
    git: {
      branch: getCurrentBranch(),
      uncommittedChanges: getUncommittedCount(),
      lastCommit: getLastCommitTime(),
    },
    processes: getRelatedProcesses(), // ps aux | grep openclaw/node
  })
})
```

#### 5. Process Management
```typescript
// POST /api/processes/:pid/restart
router.post('/processes/:pid/restart', (req, res) => {
  const { pid } = req.params
  // Kill and restart process
  // Implementation depends on process manager (PM2, systemd, etc.)
  res.json({ ok: true })
})

// POST /api/processes/:pid/stop
router.post('/processes/:pid/stop', (req, res) => {
  const { pid } = req.params
  process.kill(parseInt(pid), 'SIGTERM')
  res.json({ ok: true })
})
```

---

### Frontend Components

#### 1. LogsPage.tsx
Main page with tabs:
```tsx
export default function LogsPage() {
  const [activeTab, setActiveTab] = useState<'server' | 'agents' | 'status'>('server')

  return (
    <div>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tab value="server">Server Logs</Tab>
        <Tab value="agents">Agent Logs</Tab>
        <Tab value="status">System Status</Tab>
      </Tabs>

      {activeTab === 'server' && <ServerLogsTab />}
      {activeTab === 'agents' && <AgentLogsTab />}
      {activeTab === 'status' && <SystemStatusTab />}
    </div>
  )
}
```

#### 2. ServerLogsTab.tsx
```tsx
export default function ServerLogsTab() {
  const [logs, setLogs] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [filter])

  const fetchLogs = async () => {
    const res = await fetch(`/api/logs/server?level=${filter}`)
    const data = await res.json()
    setLogs(data.logs)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
        </select>
        <button onClick={() => setAutoScroll(!autoScroll)}>
          Auto-scroll {autoScroll ? '✓' : ''}
        </button>
        <button onClick={downloadLogs}>Download</button>
      </div>

      <div className="bg-black text-green-400 p-4 font-mono text-sm h-96 overflow-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  )
}
```

#### 3. AgentLogsTab.tsx
```tsx
export default function AgentLogsTab() {
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])
  const [streaming, setStreaming] = useState(false)
  const agents = useAgents()

  useEffect(() => {
    if (!selectedAgent) return

    if (streaming) {
      // Open SSE connection
      const eventSource = new EventSource(`/api/logs/agents/${selectedAgent}/stream`)
      eventSource.onmessage = (event) => {
        const { log } = JSON.parse(event.data)
        setLogs(prev => [...prev, log])
      }
      return () => eventSource.close()
    } else {
      // Fetch static logs
      fetchAgentLogs()
    }
  }, [selectedAgent, streaming])

  return (
    <div className="space-y-4">
      <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
        <option value="">Select Agent</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>

      <button onClick={() => setStreaming(!streaming)}>
        {streaming ? 'Stop' : 'Start'} Live Stream
      </button>

      <div className="bg-black text-green-400 p-4 font-mono text-sm h-96 overflow-auto">
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  )
}
```

#### 4. SystemStatusTab.tsx
```tsx
export default function SystemStatusTab() {
  const [status, setStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    const res = await fetch('/api/status')
    setStatus(await res.json())
  }

  return (
    <div className="space-y-6">
      <StatusCard title="Dashboard Server">
        <StatusRow label="Status" value="● Running" valueClass="text-green-600" />
        <StatusRow label="Uptime" value={formatUptime(status?.server.uptime)} />
        <StatusRow label="Memory" value={formatBytes(status?.server.memory.heapUsed)} />
      </StatusCard>

      <StatusCard title="Workspace">
        <StatusRow label="Path" value={status?.workspace.path} />
        <StatusRow label="Agents" value={`${status?.workspace.agentCount} total, ${status?.workspace.onlineCount} online`} />
        <StatusRow label="Disk Usage" value={status?.workspace.diskUsage} />
      </StatusCard>

      <StatusCard title="Git Repository">
        <StatusRow label="Branch" value={status?.git.branch} />
        <StatusRow label="Status" value={status?.git.uncommittedChanges > 0 ? '⚠ Uncommitted changes' : '✓ Clean'} />
      </StatusCard>
    </div>
  )
}
```

---

## Implementation Plan

### Phase 1: Backend (30-45 min)
- [ ] Create `server/routes/logs.ts`
- [ ] Implement `/api/logs/server` endpoint
- [ ] Implement `/api/logs/agents/:id` endpoint
- [ ] Implement `/api/status` endpoint
- [ ] Add routes to main server

### Phase 2: Frontend UI (30-45 min)
- [ ] Create `client/src/pages/Logs.tsx`
- [ ] Create `ServerLogsTab.tsx` component
- [ ] Create `AgentLogsTab.tsx` component
- [ ] Create `SystemStatusTab.tsx` component
- [ ] Add "Logs & Status" to navigation menu

### Phase 3: Streaming & Polish (15-30 min - Optional)
- [ ] Implement SSE streaming for agent logs
- [ ] Add auto-refresh for status metrics
- [ ] Add download logs functionality
- [ ] Add search/filter within logs
- [ ] Mobile responsive layout

---

## Success Criteria

**Must Have:**
- ✅ View dashboard server crash logs in UI
- ✅ View agent logs (at least from memory files)
- ✅ System status overview (server, workspace, git)
- ✅ Refresh/auto-scroll functionality

**Nice to Have:**
- ✅ Live streaming agent logs (SSE)
- ✅ Process management (restart/stop)
- ✅ Search/filter logs
- ✅ Download logs as files

---

## Future Enhancements

### V2: Advanced Monitoring
- **Metrics Dashboard**: CPU, memory, disk over time
- **Alerts**: Trigger notifications on errors
- **Log Aggregation**: Combine logs from multiple agents
- **Query Builder**: Advanced log filtering

### V3: Observability
- **Request Tracing**: Track API calls across services
- **Performance Metrics**: Response times, throughput
- **Health Checks**: Automated system health monitoring
- **Incident Management**: Create issues from errors

---

## Integration Points

**Depends On:**
- Crash logging infrastructure (✅ completed today)
- Agent discovery (`listAgents()`) (✅ exists)
- Workspace utilities (✅ exists)

**Enables:**
- Proactive monitoring
- Faster debugging
- Better operations visibility
- Foundation for alerting/notifications

---

**Status:** 🟡 Stretch goal for Sunday (if time permits)
**Alternative:** Can move to next week if schemas take full weekend
**Owner:** Dr. Maximilien
