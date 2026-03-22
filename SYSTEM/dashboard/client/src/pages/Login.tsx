import React from 'react'
import heroBg from '../assets/clawmax-front-back-offices.jpg'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login, config } = useAuth()

  const params = new URLSearchParams(window.location.search)
  const authError = params.get('auth_error')
  const deniedLogin = params.get('login')

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#07111c] text-white">
      <div className="absolute inset-0">
        <img
          src={heroBg}
          alt=""
          className="h-full w-full object-cover object-center opacity-35 md:object-top"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#07111c]/35 via-[#07111c]/62 to-[#07111c]/92" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,transparent_0%,transparent_26%,rgba(7,17,28,0.16)_54%,rgba(7,17,28,0.7)_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)',
            backgroundSize: '72px 72px',
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-sky-300/90">
              ClawMax.ai Owner Console
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white">
              Manage 100s of agents
              <span className="block text-sky-300">without losing the thread.</span>
            </h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Sign in to the dashboard for orchestration, workflows, communication, and workspace controls.
            </p>
          </div>

          <div className="rounded-2xl border border-white/12 bg-slate-950/72 p-6 shadow-2xl shadow-black/35 backdrop-blur-md">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">GitHub Authorization</div>
                <div className="mt-1 text-sm text-slate-400">Workspace owner access with persistent local session.</div>
              </div>
              <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Secure
              </div>
            </div>

            {authError && (
              <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                <p className="text-sm text-rose-200">
                  {authError === 'not_allowed'
                    ? `Access denied for GitHub user "${deniedLogin}". Contact the workspace owner.`
                    : `Authentication failed: ${decodeURIComponent(authError)}`}
                </p>
              </div>
            )}

            {config?.githubEnabled ? (
              <button
                onClick={login}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-sky-400/30 bg-sky-500/12 px-4 py-3 font-medium text-white transition-colors hover:bg-sky-500/22"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                Continue with GitHub
              </button>
            ) : (
              <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
                GitHub OAuth is not configured. Add <code className="rounded bg-black/20 px-1.5 py-0.5">GITHUB_CLIENT_ID</code> and{' '}
                <code className="rounded bg-black/20 px-1.5 py-0.5">GITHUB_CLIENT_SECRET</code> to the dashboard env file.
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-slate-400">
              <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                OAuth session
                <div className="mt-1 text-sm text-slate-200">GitHub sign-in with local cookie auth</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/5 p-3">
                Workspace scope
                <div className="mt-1 text-sm text-slate-200">Owner dashboard for agents, workflows, and comms</div>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            ClawMax.ai multiagent orchestration dashboard
          </p>
        </div>
      </div>
    </div>
  )
}
