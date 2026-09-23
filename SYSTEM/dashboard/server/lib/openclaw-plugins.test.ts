import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { OpenClawPlugins } from './openclaw-plugins'

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-control-test-'))
  const commands: string[][] = []
  let enabled = false
  let fail = false
  const run = async (args: string[]) => {
    commands.push(args)
    if (args[1] === 'list') return JSON.stringify({ plugins: [{ id: 'example', name: 'Example', enabled, status: enabled ? 'loaded' : 'disabled', apiKey: 'must-not-leak' }, { id: '../invalid' }] })
    if (fail) throw new Error('secret-key-do-not-log')
    enabled = args[1] === 'enable'
    return ''
  }
  try {
    const manager = new OpenClawPlugins(run, () => directory)
    assert.equal((await manager.list()).length, 1)
    assert(!JSON.stringify(await manager.list()).includes('must-not-leak'))
    await assert.rejects(manager.change('example', true, false), /confirmation/)
    await assert.rejects(manager.change('../invalid', true, true), /installed plugin/)
    await assert.rejects(manager.change('example', 'true', true), /boolean/)
    await assert.rejects(manager.change('not-installed', true, true), /not installed/)
    assert.equal(manager.history().length, 0)
    assert.deepEqual(await manager.change('example', true, true), { changed: true, restartRequired: true })
    assert.equal((await manager.list())[0].enabled, true)
    assert.deepEqual(await manager.change('example', true, true), { changed: false, restartRequired: false })
    assert.equal(manager.history().length, 1)
    const restarted = new OpenClawPlugins(run, () => directory)
    assert.equal(restarted.history()[0].status, 'saved')
    fail = true
    await assert.rejects(manager.change('example', false, true), /could not be confirmed/)
    assert.equal(manager.history()[1].status, 'failed')
    assert(!JSON.stringify(manager.history()).includes('secret-key'))
    assert.equal(fs.statSync(path.join(directory, 'clawmax-plugin-changes.json')).mode & 0o777, 0o600)
    let release!: () => void
    const blocked = new OpenClawPlugins(async args => { await new Promise<void>(resolve => { release = resolve }); return run(args) }, () => directory)
    const first = blocked.change('example', true, true)
    await assert.rejects(blocked.change('example', false, true), /in progress/)
    release(); await first
    assert(commands.every(args => args[0] === 'plugins' && ['list', 'enable', 'disable'].includes(args[1])))
    await assert.rejects(new OpenClawPlugins(async () => '{}', () => directory).list(), /Unsupported/)
    console.log('OpenClaw plugin control tests passed')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
