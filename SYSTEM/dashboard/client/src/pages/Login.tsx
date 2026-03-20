import React from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, config } = useAuth()

  // Check for auth error in URL
  const params = new URLSearchParams(window.location.search)
  const authError = params.get('auth_error')
  const deniedLogin = params.get('login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">ClawMax</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Multiagent Dashboard</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 text-center">
            Sign in to continue
          </h2>

          {authError && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">
                {authError === 'not_allowed'
                  ? `Access denied for GitHub user "${deniedLogin}". Contact the workspace owner.`
                  : `Authentication failed: ${decodeURIComponent(authError)}`
                }
              </p>
            </div>
          )}

          {config?.githubEnabled ? (
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Sign in with GitHub
            </button>
          ) : (
            <div className="text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                GitHub OAuth is not configured.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Add <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">GITHUB_CLIENT_ID</code> and{' '}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">GITHUB_CLIENT_SECRET</code> to your .env file.
              </p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          ClawMax.ai — Multiagent Platform
        </p>
      </div>
    </div>
  )
}
