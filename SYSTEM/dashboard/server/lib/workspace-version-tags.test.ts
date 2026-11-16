import assert from 'assert'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getLatestReachableTag } from './workspace'

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-version-tags-'))
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' })

try {
  git('init', '-q')
  git('config', 'user.name', 'ClawMax Test')
  git('config', 'user.email', 'test@example.invalid')
  fs.writeFileSync(path.join(repo, 'release'), '1.9')
  git('add', 'release')
  git('commit', '-qm', 'first release')
  git('tag', 'v1.9.9')
  git('tag', 'not-a-release')
  assert.equal(getLatestReachableTag(repo), 'v1.9.9')

  fs.writeFileSync(path.join(repo, 'release'), '2.0')
  git('add', 'release')
  git('commit', '-qm', 'second release')
  git('tag', 'v2.0.0-test-rc1')
  assert.equal(getLatestReachableTag(repo), 'v2.0.0-test-rc1')

  git('checkout', '-q', 'v1.9.9')
  assert.equal(getLatestReachableTag(repo), 'v1.9.9', 'unreachable newer release must not leak into 1.9 checkout')
  assert.equal(getLatestReachableTag(path.join(repo, 'missing')), null)
  console.log('Reachable release tag tests passed')
} finally {
  fs.rmSync(repo, { recursive: true, force: true })
}
