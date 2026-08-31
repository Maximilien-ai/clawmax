import assert from 'assert'
import fs from 'fs'
import path from 'path'

const panelSource = fs.readFileSync(path.join(__dirname, 'AgentChannelsPanel.tsx'), 'utf-8')
const agentsSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'Agents.tsx'), 'utf-8')

assert(panelSource.includes('role="dialog"') && panelSource.includes('aria-modal="true"'), 'Channel panel must expose dialog semantics')
assert(panelSource.includes('max-h-[92vh]') && panelSource.includes('overflow-y-auto'), 'Channel panel must remain scrollable at mobile and desktop heights')
assert(panelSource.includes('/channels`') && panelSource.includes('/channels/telegram`'), 'Channel panel must load state and use the Telegram endpoint')
assert(panelSource.includes('/channels/discord`') && panelSource.includes('Connect Discord'), 'Channel panel must expose the Discord endpoint and connect action')
assert(panelSource.includes('/channels/discord/probe`') && panelSource.includes('Check connection and permissions'), 'Channel panel must expose bounded Discord diagnostics')
assert(panelSource.includes('/channels/slack`') && panelSource.includes('Connect Slack'), 'Channel panel must expose the Slack endpoint and connect action')
assert(panelSource.includes('/channels/slack/probe`') && panelSource.includes('Slack probe passed'), 'Channel panel must expose bounded Slack diagnostics')
assert(panelSource.includes("method: 'POST'") && panelSource.includes("method: 'DELETE'"), 'Channel panel must support connect and disconnect')
assert(panelSource.includes('type="password"') && panelSource.includes('autoComplete="off"'), 'Telegram token input must not expose or autocomplete the token')
assert(panelSource.includes("setToken('')"), 'Channel panel must clear the token after mutations')
assert(panelSource.includes('confirmDisconnect') && panelSource.includes('Yes, disconnect'), 'Disconnect must require inline confirmation')
assert(panelSource.includes("releaseState === 'planned'") && panelSource.includes('Coming next'), 'Unreleased providers must be visibly non-interactive')
assert(panelSource.includes('uses pairing mode') && panelSource.includes('explicit allowlist'), 'Telegram direct-message policy must be disclosed')
assert(panelSource.includes('Message Content Intent') && panelSource.includes('Server Members Intent'), 'Discord privileged intent requirements must be visible')
assert(panelSource.includes('With no server ID, guild messages are disabled') && panelSource.includes('Require an @mention'), 'Discord guild access defaults must be visible and editable')
assert(panelSource.includes('Pairing is required for new Discord direct-message users'), 'Discord pairing-required state must remain visible')
assert(panelSource.includes('Socket Mode') && panelSource.includes('connections:write'), 'Slack Socket Mode prerequisites must be visible')
assert(panelSource.includes('With no channel IDs, workspace channels are disabled') && panelSource.includes('Require an @mention in selected Slack channels'), 'Slack channel access must be fail-closed and editable')
assert(panelSource.includes('Pairing is required for new Slack direct-message users'), 'Slack pairing-required state must remain visible')
assert(panelSource.includes('Shared runtime configuration') && panelSource.includes('profile mode'), 'Non-profile credential sharing must be disclosed')
assert(agentsSource.includes('<AgentChannelsPanel') && (agentsSource.match(/label="Channels"/g) || []).length >= 3, 'Every agent presentation must route channel management through the shared panel')

console.log('AgentChannelsPanel.test.ts: 21 assertions passed')
