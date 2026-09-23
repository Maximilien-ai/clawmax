const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { test } = require('node:test')
const { setTimeout: delay } = require('node:timers/promises')

test('supervisor waits for gateway cleanup on TERM and Dashboard failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-shutdown-'))
  const fixture = path.join(root, 'child.cjs')
  fs.writeFileSync(fixture, `
    const fs = require('node:fs');
    const [mode, root] = process.argv.slice(2);
    fs.writeFileSync(root + '/' + mode + '-ready', 'ready');
    let signals = 0;
    process.on('SIGTERM', () => { if (++signals > 1) process.exit(41); setTimeout(() => {
      fs.writeFileSync(root + '/' + mode + '-stopped', 'stopped'); process.exit(0);
    }, mode === 'gateway' ? 250 : 0); });
    setInterval(() => {
      if (mode === 'dashboard' && fs.existsSync(root + '/fail-dashboard')) process.exit(23);
    }, 20);
  `)
  try {
    for (const failure of [false, true]) {
      const runRoot = path.join(root, failure ? 'failure' : 'term')
      fs.mkdirSync(runRoot)
      const child = spawn('/bin/sh', ['-c', `
        . "$ENTRYPOINT"
        ensure_runtime_dirs() { :; }
        log_runtime_version_diagnostics() { :; }
        verify_runtime_version_matches_image() { :; }
        ensure_openclaw_cli() { :; }
        sync_gateway_config() { :; }
        migrate_openclaw_2_state() { :; }
        ensure_gateway_auth_token() { :; }
        get_gateway_port() { echo 18789; }
        ensure_gateway_running() { "$NODE_BINARY" "$FIXTURE" gateway "$RUN_ROOT" & gateway_pid=$!; }
        main "$NODE_BINARY" "$FIXTURE" dashboard "$RUN_ROOT"
      `], { env: { ...process.env, CLAWMAX_ENTRYPOINT_TEST_MODE: 'true', CLAWMAX_AUTO_START_GATEWAY: 'true',
        CLAWMAX_GATEWAY_WATCHDOG: 'true', CLAWMAX_GATEWAY_WATCHDOG_INTERVAL_SEC: '30', ENTRYPOINT: path.resolve(__dirname, '../docker-entrypoint.sh'),
        NODE_BINARY: process.execPath, FIXTURE: fixture, RUN_ROOT: runRoot }, stdio: 'pipe' })
      const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)) })
      try {
        const deadline = Date.now() + 5000
        while (!fs.existsSync(path.join(runRoot, 'gateway-ready')) || !fs.existsSync(path.join(runRoot, 'dashboard-ready'))) {
          assert(Date.now() < deadline, 'children must become ready')
          await delay(20)
        }
        if (failure) fs.writeFileSync(path.join(runRoot, 'fail-dashboard'), 'fail')
        else child.kill('SIGTERM')
        const timeout = setTimeout(() => child.kill('SIGKILL'), 5000)
        try { assert.equal(await closed, failure ? 23 : 143) } finally { clearTimeout(timeout) }
        assert(fs.existsSync(path.join(runRoot, 'gateway-stopped')), 'gateway cleanup must finish before supervisor exits')
        if (!failure) assert(fs.existsSync(path.join(runRoot, 'dashboard-stopped')))
      } finally { child.kill('SIGTERM') }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
