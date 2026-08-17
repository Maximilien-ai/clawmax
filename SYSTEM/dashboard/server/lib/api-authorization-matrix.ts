export type ApiAuthorizationClass = 'public' | 'dashboard-auth' | 'capability' | 'share-token'

export interface ApiAuthorizationEntry {
  path: string
  methods: string
  authorization: ApiAuthorizationClass
  scope: string
}

export const API_AUTHORIZATION_MATRIX: ApiAuthorizationEntry[] = [
  { path: '/api/health', methods: 'GET', authorization: 'public', scope: 'Readiness only' },
  { path: '/api/auth/verify', methods: 'POST', authorization: 'public', scope: 'Legacy token verification' },
  { path: '/api/auth/*', methods: 'GET,POST', authorization: 'public', scope: 'Login, callback, logout, session discovery' },
  { path: '/api/auth/config', methods: 'GET', authorization: 'public', scope: 'Non-secret login/runtime flags' },
  { path: '/api/runtime/skill-broker/*', methods: 'POST', authorization: 'capability', scope: 'Agent-bound signed capability' },
  { path: '/api/runtime/mail/*', methods: 'POST', authorization: 'capability', scope: 'Agent-bound signed capability and persisted grant' },
  { path: '/api/workspace-dashboards/:token', methods: 'GET', authorization: 'dashboard-auth', scope: 'Authenticated dashboard user and opaque dashboard token' },
  { path: '/api/system', methods: 'GET', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/activity', methods: 'GET', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/budget', methods: 'GET,PUT', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/metering', methods: 'GET', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/system/logs', methods: 'GET', authorization: 'dashboard-auth', scope: 'Dashboard process' },
  { path: '/api/docs/*', methods: 'GET,POST,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace with path validation' },
  { path: '/api/agents/*', methods: 'GET,POST,PUT,PATCH,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace and selected agent' },
  { path: '/api/templates/*', methods: 'GET,POST,PUT,DELETE', authorization: 'dashboard-auth', scope: 'System catalog reads and active-workspace writes' },
  { path: '/api/template-registry/*', methods: 'GET,POST', authorization: 'dashboard-auth', scope: 'Remote catalog proxy and active-workspace imports' },
  { path: '/api/activity-export/*', methods: 'GET,POST,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace consent and queue' },
  { path: '/api/skills/*', methods: 'GET,POST,PUT,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/skill-secret-broker/*', methods: 'GET,POST,PUT,DELETE', authorization: 'dashboard-auth', scope: 'Operator secret and grant administration' },
  { path: '/api/mail/oauth/*', methods: 'GET,POST,DELETE', authorization: 'dashboard-auth', scope: 'OAuth connections and grant administration' },
  { path: '/api/workflows/*', methods: 'GET,POST,PUT,PATCH,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace and selected workflow' },
  { path: '/api/ai/*', methods: 'POST', authorization: 'dashboard-auth', scope: 'Active workspace AI editing' },
  { path: '/api/ai-builder/*', methods: 'POST', authorization: 'dashboard-auth', scope: 'Active workspace AI planning' },
  { path: '/api/workspaces/*', methods: 'GET,POST,PUT,PATCH,DELETE', authorization: 'dashboard-auth', scope: 'Explicit workspace id with manager validation' },
  { path: '/api/notifications/*', methods: 'GET,POST,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/integrations/*', methods: 'GET,POST,PUT', authorization: 'dashboard-auth', scope: 'Active workspace configuration' },
  { path: '/api/plugins/*', methods: 'GET,POST,PUT,PATCH,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace and installed plugin host' },
  { path: '/api/teams/*', methods: 'GET,POST,PUT,PATCH,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace' },
  { path: '/api/groups/* and /api/communities/*', methods: 'GET,POST,PUT,DELETE', authorization: 'dashboard-auth', scope: 'Active workspace channels' },
]
