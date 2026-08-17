import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { getDashboardAuthReturnTo } from './lib/dashboardAuth'

assert.strictEqual(getDashboardAuthReturnTo({
  origin: 'https://cloud.example.com',
  pathname: '/dashboards/secret-token',
  search: '?view=detail',
  hash: '#results',
} as Location), 'https://cloud.example.com/dashboards/secret-token?view=detail#results')

const mainSource = fs.readFileSync(path.join(__dirname, 'main.tsx'), 'utf8')
assert(mainSource.includes('<AuthProvider>'), 'Shared dashboard entry must initialize dashboard authentication')
assert(mainSource.includes('<AuthGate>'), 'Shared dashboard entry must block unauthenticated rendering')
assert(mainSource.includes('<SharedWorkspaceDashboard token={dashboardMatch[1]} />'), 'Authenticated entry must render the requested dashboard token')
assert(mainSource.includes('^\\/dashboards\\/([^/]+)\\/?$'), 'OAuth redirects with a trailing slash must preserve dashboard routing')

console.log('WorkspaceDashboardAuth.test.ts: 5 assertions passed')
