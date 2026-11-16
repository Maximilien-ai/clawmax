import { randomUUID } from 'crypto'

// Shared across routers for this serving process; never persisted or configurable.
// This is evidence of Dashboard process identity, not Gateway health or authority.
export const dashboardBootObservation = Object.freeze({
  bootId: randomUUID(),
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  scope: 'dashboard-process' as const,
})
