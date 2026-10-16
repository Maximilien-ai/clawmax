import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { configuration, verifyIndex, mirror } from './mirror-gcp-image.mjs';

const raw = JSON.stringify({ manifests: ['amd64', 'arm64'].map(architecture => ({ digest: `sha256:${'a'.repeat(64)}`, platform: { os: 'linux', architecture } })) });
const digest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
const env = { MIRROR_KIND: 'public', MIRROR_REGION: 'us-west1', IMAGE_TAG: '2.0.0-test-rc91', IMAGE_DIGEST: digest };
test('destinations are fixed and public/private remain separate', () => {
  assert.match(configuration(env).destination, /clawmax-public\/clawmax-dashboard$/);
  assert.match(configuration({ ...env, MIRROR_KIND: 'private' }).destination, /clawmax-private\/clawmax-plugins$/);
  for (const [key, value] of [['MIRROR_KIND', 'other'], ['MIRROR_REGION', 'evil.example'], ['IMAGE_TAG', 'x;echo secret'], ['IMAGE_DIGEST', 'latest']]) {
    assert.throws(() => configuration({ ...env, [key]: value }));
  }
});
test('reject wrong digest and missing architecture', () => {
  verifyIndex(raw, digest);
  assert.throws(() => verifyIndex(raw, `sha256:${'b'.repeat(64)}`));
  const empty = JSON.stringify({ manifests: [] });
  assert.throws(() => verifyIndex(empty, `sha256:${createHash('sha256').update(empty).digest('hex')}`));
});
test('copies immutable source with all manifests and checks destination', () => {
  const calls = [];
  mirror(configuration(env), args => { calls.push(args); return raw; }, false);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2].slice(0, 3), ['copy', '--all', '--preserve-digests']);
  assert.ok(calls[2][5].endsWith(`@${digest}`));
});
test('changed tag stops before copy; failed copy never reaches acceptance', () => {
  let count = 0;
  assert.throws(() => mirror(configuration(env), () => ++count === 1 ? raw : '{}', false));
  assert.equal(count, 2);
  assert.throws(() => mirror(configuration(env), args => { if (args[0] === 'copy') throw new Error('denied'); return raw; }, false));
});
test('downloads both platform images for pull verification', () => {
  const calls = [];
  mirror(configuration(env), args => { calls.push(args); return raw; });
  assert.deepEqual(calls.slice(4).map(args => args[4]), ['amd64', 'arm64']);
});
