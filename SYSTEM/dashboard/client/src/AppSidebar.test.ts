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
assert(source.includes('{coreUserNav.map((item, index) => ('), 'All core navigation must render before the plugin section')
assert(!source.includes('pluginAnchorIndex'), 'Plugins must not split the core navigation at an anchor tab')
assert(source.includes('aria-expanded={pluginNavExpanded}'), 'Plugin navigation must expose an accessible collapsible section')
assert(source.includes('pluginNavExpanded && orderedPlugins.map'), 'Collapsed plugin navigation must hide plugin entries')
assert(source.indexOf('{coreUserNav.map((item, index) => (') < source.indexOf('aria-expanded={pluginNavExpanded}'), 'Plugins must render after all core navigation')
assert(source.indexOf('aria-expanded={pluginNavExpanded}') < source.indexOf('onClick={() => setSystemNavExpanded'), 'Plugins must render immediately before the System section')
assert(source.includes("plugin.objectKind === 'optimization-plan') return BarChartIcon"), 'Optimize must use a distinct bar chart icon')
assert(source.includes("plugin.objectKind === 'lifecycle-view' || plugin.icon === 'activity') return ActivityIcon"), 'Lifecycle must retain the activity history icon')
assert(source.includes('aria-label="Manage plugins"'), 'Plugin section must expose the plugin manager')

console.log('AppSidebar.test.ts: 15 tests passed')
