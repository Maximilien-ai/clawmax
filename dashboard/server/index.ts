import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import docsRouter from './routes/docs'
import agentsRouter from './routes/agents'
import { WORKSPACE } from './lib/workspace'

const app = express()
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10)

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

// Health
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    workspace: WORKSPACE,
    time: new Date().toISOString(),
  })
})

// Workspace system info
app.get('/api/system', (_req, res) => {
  let gitBranch = 'unknown'
  try {
    const head = fs.readFileSync(path.join(WORKSPACE, '.git', 'HEAD'), 'utf-8').trim()
    gitBranch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : head.slice(0, 7)
  } catch {}

  res.json({
    workspace: WORKSPACE,
    gitBranch,
  })
})

// API routes
app.use('/api/docs', docsRouter)
app.use('/api/agents', agentsRouter)

// Serve built client in production
const clientDist = path.join(__dirname, '..', '..', 'dist', 'client')
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`ClawMax Dashboard server running at http://localhost:${PORT}`)
  console.log(`Workspace: ${WORKSPACE}`)
})
