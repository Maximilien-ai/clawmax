import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { configuration, verifyIndex } from './mirror-gcp-image.mjs';

const workflows = new Set(['Test Container Image', 'Release Container Image']);

export function recordTarget({ tag, sourceSha, runId, workflow }, inspect) {
  if (!workflows.has(workflow)) throw new Error('Unexpected image workflow');
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('Invalid source SHA');
  if (!/^[1-9][0-9]*$/.test(String(runId))) throw new Error('Invalid run ID');
  configuration({ MIRROR_KIND: 'public', MIRROR_REGION: 'us-west1', IMAGE_TAG: tag, IMAGE_DIGEST: `sha256:${'0'.repeat(64)}` });
  const raw = inspect(`ghcr.io/maximilien-ai/clawmax-dashboard:${tag}`);
  const digest = `sha256:${createHash('sha256').update(raw).digest('hex')}`;
  verifyIndex(raw, digest);
  return { image_tag: tag, image_digest: digest, source_sha: sourceSha, run_id: String(runId), workflow };
}

export function resolveTarget(target, event) {
  if (!workflows.has(event.workflow_run?.name) || event.workflow_run.conclusion !== 'success') throw new Error('Image workflow did not pass');
  if (event.workflow_run.head_repository?.full_name !== 'Maximilien-ai/clawmax') throw new Error('Unexpected source repository');
  if (target.run_id !== String(event.workflow_run.id) || target.workflow !== event.workflow_run.name) throw new Error('Artifact does not match completed workflow');
  if (!/^[a-f0-9]{40}$/.test(target.source_sha)) throw new Error('Invalid source SHA');
  configuration({ MIRROR_KIND: 'public', MIRROR_REGION: 'us-west1', IMAGE_TAG: target.image_tag, IMAGE_DIGEST: target.image_digest });
  return target;
}

function inspectRaw(image) {
  const result = spawnSync('skopeo', ['inspect', '--raw', `docker://${image}`], { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Cannot inspect published image index');
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'record') {
      const target = recordTarget({ tag: process.env.IMAGE_TAG, sourceSha: process.env.SOURCE_SHA,
        runId: process.env.GITHUB_RUN_ID, workflow: process.env.GITHUB_WORKFLOW }, inspectRaw);
      writeFileSync(process.env.TARGET_FILE, `${JSON.stringify(target)}\n`);
      console.log(JSON.stringify(target));
    } else if (process.argv[2] === 'resolve') {
      const target = process.env.GITHUB_EVENT_NAME === 'workflow_run'
        ? resolveTarget(JSON.parse(readFileSync(process.env.TARGET_FILE, 'utf8')), JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')))
        : { image_tag: process.env.IMAGE_TAG, image_digest: process.env.IMAGE_DIGEST };
      configuration({ MIRROR_KIND: 'public', MIRROR_REGION: 'us-west1', IMAGE_TAG: target.image_tag, IMAGE_DIGEST: target.image_digest });
      appendFileSync(process.env.GITHUB_OUTPUT, `image_tag=${target.image_tag}\nimage_digest=${target.image_digest}\n`);
      console.log(JSON.stringify(target));
    } else throw new Error('Expected record or resolve');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
