import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import SharedWorkspaceDashboard from './SharedWorkspaceDashboard'
import './index.css'

const dashboardMatch = window.location.pathname.match(/^\/dashboards\/([^/]+)$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {dashboardMatch ? <SharedWorkspaceDashboard token={dashboardMatch[1]} /> : <App />}
  </React.StrictMode>
)
