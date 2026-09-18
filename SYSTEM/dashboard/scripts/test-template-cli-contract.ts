/** Cross-repository acceptance without installed profiles or operator resources.
 * Usage: npx ts-node --transpileOnly scripts/test-template-cli-contract.ts /absolute/clawmax-cli
 * Requires the CLI checkout's Go toolchain. Does not edit that checkout.
 */
import assert from 'assert'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createInstanceTemplatesRouter } from '../server/routes/instance-templates'
import { templateFixture } from '../server/lib/portable-template.test'

async function main() {
  const cli = path.resolve(process.argv[2] || '../missing-cli-source')
  assert(fs.existsSync(path.join(cli, 'go.mod')), 'Pass the CLI source checkout path')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-cli-template-contract-'))
  const app = express()
  app.use('/api/cli/v1/workspaces/:workspaceId', createInstanceTemplatesRouter({
    authorize: (req, res) => {
      if (req.get('Authorization') !== 'Bearer synthetic-contract-token' || req.params.workspaceId !== 'contract') {
        res.status(403).json({ apiVersion: 'clawmax.instance/v1', kind: 'Error', error: { code: 'forbidden', message: 'Forbidden', retryable: false } })
        return null
      }
      return { workspaceId: 'contract', workspacePath: path.join(root, 'workspace'), actorId: 'contract-actor' }
    },
    dashboardVersion: () => 'source-contract', openClawVersion: () => 'not-used',
  }))
  const server = http.createServer(app)
  try {
    const fixture = path.join(root, 'stability.zip')
    const nextFixture = path.join(root, 'stability-v2.zip')
    fs.writeFileSync(fixture, await templateFixture())
    fs.writeFileSync(nextFixture, await templateFixture((_files, manifest) => { manifest.version = '1.1.0' }))
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const port = (server.address() as { port: number }).port
    const { stdout } = await promisify(execFile)('go', ['run', path.resolve(__dirname, 'fixtures/template-cli-contract.go'), `http://127.0.0.1:${port}`, fixture, nextFixture], { cwd: cli, timeout: 120_000, maxBuffer: 128 * 1024 })
    process.stdout.write(stdout)
    assert.deepEqual(fs.readdirSync(path.join(root, 'workspace')), ['.clawmax'], 'Catalog contract must not materialize runtime resources')
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
