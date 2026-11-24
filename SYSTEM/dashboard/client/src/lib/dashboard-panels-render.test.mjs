import assert from 'node:assert/strict'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
}
try {
  const load = name => vite.ssrLoadModule('/client/src/' + name + '.tsx')
  const { AuthProvider } = await load('contexts/AuthContext')
  const { WorkspaceProvider } = await load('contexts/WorkspaceContext')
  const { ToastProvider } = await load('components/Toast')
  const { default: Builder } = await load('pages/Builder')
  const { default: AgentChat } = await load('components/AgentChatPanel')
  const render = component => renderToStaticMarkup(h(AuthProvider, null, h(ToastProvider, null, h(WorkspaceProvider, null, component))))

  const builder = render(h(Builder))
  assert.match(builder, /Describe what to build/)
  assert.match(builder, /Recommend Next Step/)
  assert.match(builder, /Shrink builder prompt/)

  const chat = () => render(h(AgentChat, { agentId: 'research', agentName: 'Research desk', onClose() {} }))
  const dialog = chat()
  assert.match(dialog, /Research desk/)
  assert.match(dialog, /aria-label="Close chat"/)
  assert.match(dialog, /Switch to slide/)
  storage.set('agent-chat-mode-research', 'slide')
  assert.match(chat(), /Switch to modal/)
  console.log('Builder and agent chat initial render checks passed')
} finally {
  await vite.close()
}
