import assert from 'assert'
import fs from 'fs'
import path from 'path'

const dashboardRoot = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(dashboardRoot, '../..')
const dashboardPackage = JSON.parse(fs.readFileSync(path.join(dashboardRoot, 'package.json'), 'utf8'))
const dashboardLock = JSON.parse(fs.readFileSync(path.join(dashboardRoot, 'package-lock.json'), 'utf8'))
const ciSource = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8')
const baselineSource = fs.readFileSync(path.join(repoRoot, 'SYSTEM/docs/security/SECURITY_BASELINE_2_0_RC15.md'), 'utf8')
const auditSource = fs.readFileSync(path.join(dashboardRoot, 'scripts/security-audit.js'), 'utf8')

assert.equal(dashboardPackage.engines.node, '>=22.19.0', 'Dashboard runtime must enforce the tested Node baseline')
assert.equal(dashboardLock.packages[''].engines.node, '>=22.19.0', 'Lockfile runtime metadata must match package.json')
assert.equal(dashboardPackage.dependencies.archiver, '^8.0.0', 'Archive exports must use the remediated Archiver major')
assert.equal(dashboardPackage.devDependencies.vite, '^8.1.5', 'Builds must use the remediated Vite line')
assert.equal(dashboardPackage.scripts['security:audit'], 'node scripts/security-audit.js', 'Package scripts must expose the release dependency gate')
assert(auditSource.includes("spawnSync('npm', ['audit', '--audit-level=high', '--json']"), 'Security audit wrapper must execute the high-severity npm audit')
assert(!auditSource.includes('GHSA-5p4m-2wfm-xmqj'), 'Security audit must not allowlist the resolved js-yaml advisory')
assert.equal(dashboardLock.packages['node_modules/js-yaml'].version, '3.15.1', 'gray-matter must resolve to the fixed js-yaml 3.x release')
assert(ciSource.includes('npm run security:audit'), 'Main CI must reject High and Critical dependency advisories')
assert(baselineSource.includes('- 0 Critical') && baselineSource.includes('- 0 High'), 'Security evidence must record the achieved release threshold')
assert(baselineSource.includes('Initial RC15 dependency/configuration evidence') || baselineSource.includes('initial baseline, not the complete'), 'Security evidence must not claim to be the complete 2.0 audit')

console.log('security-baseline.test.ts: 9 tests passed')
