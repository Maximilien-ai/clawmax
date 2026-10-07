import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function configuration(env) {
  const { MIRROR_KIND: kind, IMAGE_TAG: tag, IMAGE_DIGEST: digest, MIRROR_REGION: region } = env;
  if (!['public', 'private'].includes(kind)) throw new Error('Invalid mirror kind');
  if (!['us-west1', 'us-east1'].includes(region)) throw new Error('Invalid mirror region');
  if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(tag || '')) throw new Error('Invalid image tag');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) throw new Error('Exact sha256 digest required');
  const image = kind === 'public' ? 'clawmax-dashboard' : 'clawmax-plugins';
  return { kind, tag, digest, region, source: `ghcr.io/maximilien-ai/${image}`,
    destination: `${region}-docker.pkg.dev/clawmax-ai/clawmax-${kind}/${image}` };
}

export function verifyIndex(raw, digest) {
  if (`sha256:${createHash('sha256').update(raw).digest('hex')}` !== digest) throw new Error('Manifest digest mismatch');
  const index = JSON.parse(raw);
  for (const arch of ['amd64', 'arm64']) {
    const matches = (index.manifests || []).filter(m => m.platform?.os === 'linux' && m.platform.architecture === arch);
    if (matches.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(matches[0].digest)) throw new Error(`Missing or ambiguous linux/${arch}`);
  }
}

function run(args) {
  const result = spawnSync('skopeo', args, { encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
  // Do not propagate registry diagnostics: credentials can appear in third-party errors.
  if (result.error || result.status !== 0) throw new Error(`Registry operation failed (${args[0]}); inspect registry access and connectivity`);
  return result.stdout;
}

export function mirror(config, execute = run, smoke = true) {
  const { source, destination, digest, tag } = config;
  const raw = execute(['inspect', '--raw', `docker://${source}@${digest}`]);
  verifyIndex(raw, digest);
  // Require the operator's release tag to resolve to the approved immutable index.
  verifyIndex(execute(['inspect', '--raw', `docker://${source}:${tag}`]), digest);
  execute(['copy', '--all', '--preserve-digests', '--retry-times', '3', `docker://${source}@${digest}`, `docker://${destination}:${tag}`]);
  verifyIndex(execute(['inspect', '--raw', `docker://${destination}:${tag}`]), digest);
  if (smoke) {
    for (const arch of ['amd64', 'arm64']) {
      const directory = mkdtempSync(join(tmpdir(), 'clawmax-mirror-pull-'));
      try {
        execute(['copy', '--override-os', 'linux', '--override-arch', arch, '--retry-times', '3', `docker://${destination}@${digest}`, `dir:${directory}`]);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }
  console.log(JSON.stringify({ destination, tag, digest, architectures: ['amd64', 'arm64'], pullVerified: smoke }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { mirror(configuration(process.env)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
