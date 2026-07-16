import assert from 'assert'
import { renderToStaticMarkup } from 'react-dom/server'
import { RegistryResultRow } from './RegistryResultRow'

const longName = 'shipables/registry/a-very-long-skill-name-that-must-wrap-without-covering-actions'
const markup = renderToStaticMarkup(
  <RegistryResultRow
    skill={{
      full_name: longName,
      name: 'long-skill',
      description: 'A long description that should remain in the text region.\nIgnored second line.',
      latest_version: '2.4.0',
      downloads_weekly: 17,
      categories: ['api', 'productivity'],
    }}
    installName="long-skill"
    providerLabel="Shipables"
    showProvider
    isInstalled={false}
    isInstalling={false}
    installDisabled={false}
    onInstall={() => {}}
  />
)

assert(markup.includes('break-words'), 'long result text should use wrapping classes')
assert(markup.includes('flex flex-wrap'), 'metadata should wrap in narrow result panes')
assert(markup.includes('mt-2 flex justify-end'), 'install action should occupy a separate row')
assert(markup.indexOf(longName) < markup.indexOf('>Install<'), 'install action should render after result content')
assert(markup.includes('Shipables'), 'registry attribution should render when federated search is active')
assert(markup.includes('17/week'), 'result metadata should render')

const installedMarkup = renderToStaticMarkup(
  <RegistryResultRow
    skill={{ name: 'github' }}
    installName="github"
    providerLabel="ClawHub"
    showProvider={false}
    isInstalled
    isInstalling={false}
    installDisabled={false}
    onInstall={() => {}}
  />
)

assert(installedMarkup.includes('Installed'), 'installed state should replace the install button')
assert(!installedMarkup.includes('ClawHub'), 'single-registry searches should not repeat provider attribution')

console.log('RegistryResultRow.test.tsx: 8 assertions passed')
