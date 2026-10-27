import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SharedWorkspaceDashboard from './SharedWorkspaceDashboard'
import { AuthProvider } from './contexts/AuthContext'
import { AuthGate } from './components/AuthGate'
import { ApiReadinessGate } from './components/ApiReadinessGate'
import './index.css'

const dashboardMatch = window.location.pathname.match(/^\/dashboards\/([^/]+)\/?$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ApiReadinessGate>
      {dashboardMatch ? (
        <AuthProvider>
          <AuthGate>
            <SharedWorkspaceDashboard token={dashboardMatch[1]} />
          </AuthGate>
        </AuthProvider>
      ) : <App />}
    </ApiReadinessGate>
  </React.StrictMode>
)
