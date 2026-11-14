import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { stop } from './local-dev.mjs'

const system = path.dirname(fileURLToPath(import.meta.url))
const dashboard = path.join(system, 'dashboard')
const devCommand = JSON.parse(fs.readFileSync(path.join(dashboard, 'package.json'), 'utf8')).scripts.dev
const shellQuote = value => `'${value.replace(/'/g, `'\\''`)}'`
const posix = { skip: process.platform === 'win32', timeout: 30000 }

async function until(check, label, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (check()) return
    await delay(30)
  }
  throw new Error(`Timed out: ${label}`)
}

function stopped(pid) {
  assert(Number.isInteger(pid) && pid > 1)
  try { process.kill(pid, 0) } catch (error) { if (error.code === 'ESRCH') return true; throw error }
  const status = spawnSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' })
  return status.status === 1 || /^\s*Z/.test(status.stdout)
}

async function fixture(mode, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-concurrently-'))
  const script = path.join(root, 'child.cjs')
  fs.writeFileSync(script, `
    const fs = require('node:fs'), path = require('node:path');
    const { spawn } = require('node:child_process');
    const role = process.argv[2];
    const worker = process.env.DEV_FIXTURE_MODE === 'persistent'
      ? spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }) : null;
    const receipt = path.join(process.env.DEV_FIXTURE_ROOT, role + '.json');
    fs.writeFileSync(receipt + '.tmp', JSON.stringify({ pid: process.pid, worker: worker?.pid }));
    fs.renameSync(receipt + '.tmp', receipt);
    console.log('ready-' + role);
    if (worker) {
      setInterval(() => {}, 1000);
      process.on('SIGTERM', () => {
        worker.once('exit', () => process.exit(0));
        try { worker.kill('SIGTERM') } catch {}
        setTimeout(() => process.exit(0), 400);
      });
    } else setTimeout(() => process.exit(process.env.DEV_FIXTURE_MODE === 'failure' && role === 'server' ? 7 : 0), 50);
  `)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ private: true, scripts: {
    dev: devCommand,
    'dev:server': `${shellQuote(process.execPath)} ${shellQuote(script)} server`,
    'dev:client': `${shellQuote(process.execPath)} ${shellQuote(script)} client`,
  } }))
  const child = spawn('npm', ['run', 'dev'], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: path.join(dashboard, 'node_modules/.bin') + path.delimiter + process.env.PATH,
      DEV_FIXTURE_ROOT: root, DEV_FIXTURE_MODE: mode, npm_config_update_notifier: 'false' },
  })
  let output = '', error
  child.on('error', value => { error = value })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-8192) })
  const result = {
    child,
    output: () => output.replace(/\x1b\[[0-9;]*m/g, ''),
    ready: () => until(() => {
      if (error) throw error
      return ['server', 'client'].every(role => fs.existsSync(path.join(root, role + '.json')))
    }, 'both configured dev commands started'),
    ended: () => until(() => { if (error) throw error; return child.exitCode !== null || child.signalCode !== null }, 'launcher exit'),
    pids: () => ['server', 'client'].flatMap(role => {
      const record = JSON.parse(fs.readFileSync(path.join(root, role + '.json'), 'utf8'))
      return [record.pid, record.worker].filter(value => value !== undefined)
    }),
  }
  try { await run(result) } catch (failure) {
    throw new Error(`${failure.message}\nLauncher output:\n${result.output()}`, { cause: failure })
  } finally {
    await stop(child)
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('the configured npm dev command starts both named commands and reports success', posix, async () => {
  await fixture('success', async result => {
    await result.ready()
    await result.ended()
    assert.equal(result.child.exitCode, 0)
    assert.match(result.output(), /\[server\].*ready-server/)
    assert.match(result.output(), /\[client\].*ready-client/)
  })
})

test('a failed configured child cannot become a successful dev launch', posix, async () => {
  await fixture('failure', async result => {
    await result.ready()
    await result.ended()
    assert.notEqual(result.child.exitCode, 0)
  })
})

test('the local-dev stop helper terminates npm/concurrently descendants and preserves unrelated processes', posix, async () => {
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
  try {
    await fixture('persistent', async result => {
      await result.ready()
      const pids = result.pids()
      assert.equal(pids.length, 4, 'both dev commands have a worker descendant')
      assert(pids.every(pid => !stopped(pid)))
      await stop(result.child)
      await until(() => pids.every(stopped), 'all owned descendants stopped', 5000)
      assert.equal(unrelated.exitCode, null)
      assert.equal(unrelated.signalCode, null)
    })
  } finally { await stop(unrelated) }
})
