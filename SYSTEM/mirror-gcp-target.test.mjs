import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { recordTarget, resolveTarget } from './mirror-gcp-target.mjs';

const raw = JSON.stringify({ manifests: ['amd64', 'arm64'].map(architecture => ({ digest: `sha256:${'a'.repeat(64)}`, platform: { os: 'linux', architecture } })) });
const sha = 'b'.repeat(40);
const event = { workflow_run: { id: 123, name: 'Test Container Image', conclusion: 'success', head_repository: { full_name: 'Maximilien-ai/clawmax' } } };

test('records exact multiarchitecture index for a completed image run', () => {
  const target = recordTarget({ tag: '1.9.10-test-christen', sourceSha: sha, runId: 123, workflow: event.workflow_run.name }, () => raw);
  assert.equal(target.image_digest, `sha256:${createHash('sha256').update(raw).digest('hex')}`);
  assert.deepEqual(resolveTarget(target, event), target);
  assert.equal(resolveTarget({ ...target, workflow: 'Release Container Image' }, { workflow_run: { ...event.workflow_run, name: 'Release Container Image' } }).image_tag, target.image_tag);
});

test('rejects failed, foreign, mismatched, or invalid image evidence', () => {
  const target = recordTarget({ tag: '2.0.0-test-rc92', sourceSha: sha, runId: 123, workflow: event.workflow_run.name }, () => raw);
  for (const changed of [
    { ...event, workflow_run: { ...event.workflow_run, conclusion: 'failure' } },
    { ...event, workflow_run: { ...event.workflow_run, id: 124 } },
    { ...event, workflow_run: { ...event.workflow_run, head_repository: { full_name: 'elsewhere/repo' } } },
  ]) assert.throws(() => resolveTarget(target, changed));
  assert.throws(() => resolveTarget({ ...target, image_tag: '../other' }, event));
  assert.throws(() => recordTarget({ tag: 'x', sourceSha: sha, runId: 123, workflow: 'Other' }, () => raw));
  assert.throws(() => recordTarget({ tag: 'x', sourceSha: sha, runId: 123, workflow: event.workflow_run.name }, () => '{}'));
});
