import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, 'App.tsx'), 'utf-8')

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

assert(source.includes('h-[100dvh] max-h-[100dvh] overflow-hidden bg-gray-900'), 'Sidebar must keep its background constrained to the dynamic mobile viewport')
assert(source.includes('min-h-0 flex-1 overflow-y-auto overscroll-contain'), 'Sidebar navigation must scroll independently')
assert(source.includes('<div className="shrink-0"><UserBadge'), 'Sidebar user area must remain outside the scrolling navigation')
assert(source.includes('shrink-0 border-t border-gray-700'), 'Sidebar footer must remain visible')
assert(source.includes('label={getPluginNavLabel(plugin)}'), 'Plugin navigation must use compact manifest labels')
assert(source.includes('<span className="truncate">{label}</span>'), 'Navigation labels must not wrap or widen the sidebar')

console.log('AppSidebar.test.ts: 6 tests passed')
