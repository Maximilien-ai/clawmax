// Run as the dashboard command under the real image entrypoint. The short
// shell exits before its child; PID 1 must adopt and reap that child.
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  if (fs.readFileSync('/proc/1/comm', 'utf8').trim() !== 'tini') {
    throw new Error('expected tini to own PID 1')
  }
  const child = execFileSync('/bin/sh', ['-c', 'sleep 1 </dev/null >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).trim()
  if (!/^\d+$/.test(child)) throw new Error('invalid orphan PID')
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!fs.existsSync(`/proc/${child}`)) {
      console.log('orphan reaped')
      process.on('SIGTERM', () => {
        console.log('termination forwarded')
        process.exit(0)
      })
      setInterval(() => {}, 1000)
      return
    }
    await wait(100)
  }
  throw new Error('orphan remained in /proc after exit')
}
main().catch(error => { console.error(error.message); process.exit(1) })
