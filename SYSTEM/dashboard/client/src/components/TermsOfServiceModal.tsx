import { DASHBOARD_TERMS_SECTIONS, DASHBOARD_TERMS_UPDATED_AT } from '../content/termsOfService'

export function TermsOfServiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Terms of Service</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Applies to dashboard use, external skills, imported agents, machine-level setup actions, and connected integrations.
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Last updated: {DASHBOARD_TERMS_UPDATED_AT}</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Close Terms of Service"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5 text-sm leading-6 text-gray-700 dark:text-gray-200">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            Review these terms before importing third-party agents, installing external skills, or running setup and requirements commands from the Dashboard.
          </div>

          {DASHBOARD_TERMS_SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{section.title}</h3>
              <div className="mt-2 space-y-3">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
