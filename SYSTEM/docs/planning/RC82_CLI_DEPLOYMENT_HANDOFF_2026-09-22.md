# RC82 deployment failures — CLI handoff

Status: MBP14 storage recovered; no deployment retry performed here. Test10
routing failure identified, not repaired. Neither installed instance has passed
RC82 acceptance. Keep schedules disabled and preserve unrelated resources.

## Candidate identity

- Public source: `48f333b895148bc1ab5a4a65531d80667c78e492`.
- Private source: `ce2516d8a07ef96796ca138b748e6bd501672547`.
- Combined tag: `ghcr.io/maximilien-ai/clawmax-plugins:2.0.0-test-rc82`.
- Combined manifest: `sha256:d7147f7008ad9f2bff57b602b541266a7db764b0042df44467234b9771aa3d6e`.
- [Public build and lifecycle checks](https://github.com/Maximilien-ai/clawmax/actions/runs/35689504050): passed.
- [Combined build and architecture smoke checks](https://github.com/Maximilien-ai/clawmax-plugins/actions/runs/35710846683): passed.

## MBP14: storage exhaustion and deployment churn

Installed CLI: `2.0.0-test-rc9-repair.1`. Podman VM: `podman-clawmax`.
The RC82 pull failed creating `/var/tmp/auth.json.*`: no space left on device.
Agent logs show attempted automatic cleanup, fallback to RC81, repeated
candidate retries, then a four-attempt stop. This is not evidence of an RC82
runtime crash. Container-state operations also failed while storage was full.

Direct VM inspection found XFS `/var` at 60 GB used of 60 GB, with effectively
no available inodes. A transient 1.5 GB free observation disappeared before
image removal. Even non-force removal could not create Podman's temporary
`overlay-images/.tmp-images.json*` metadata.

User-authorized recovery performed:

1. Verified every container image reference, including stopped containers.
2. Vacuumed archived system journals to a 512 MB target. Output reported
   3.4 GB removed. No backup of that older diagnostic history was made; active
   journals were not explicitly rotated or deleted.
3. Removed only these three unused older combined Dashboard image IDs, without
   force or broad prune:
   - `02384cbf1e8be62ad100f3c9b69b2002fcb3a0f4c76e499497b91da7aef4b0bf`
   - `8f8f0b5cf344c0fc541a2d112281ac498a3e511208b57e08d151a667fdd32b06`
   - `b14b052d891b250b19238f93a72a98f5a13ae283e3e7c0ec7661ec58be2f66e6`
   Published images can be pulled again. Shared-layer image sizes are not
   additive; the observed filesystem delta is the useful recovery measurement.

Final check: 12 GB available, 80% disk usage, 5% reported inode usage;
`/api/system` reports RC81. Container `clawmax-dashboard-240e10` retained its
10-hour uptime and image `1995f62ad41aa1e23238de940f8b755c67e9e518b2d69e1b62b99f44ab101ecf`.
No VM/agent/container restart, deployment retry, volume removal, workspace/model
deletion or unrelated image cleanup was performed. This verifies identity and
capacity, not chat/workflow acceptance. The prior RC81 startup overlay caveat
still applies.

CLI owns the permanent fix:

- Preflight VM bytes and inodes with extraction/metadata headroom before pull.
- Retain running, last-known-good and desired candidate image IDs/digests;
  preserve all container-referenced and unrelated images. Deduplicate when
  running and last-known-good are the same. Do not rely only on mutable tags.
- Review `reclaimPodmanPullSpace` and `cleanupSupersededPodmanImages` in
  `src/pkg/stack/{kubernetes,runtime}.go`: cleanup already exists but did not
  prevent this incident. Avoid force removal and unscoped dangling-image prune.
- Bound VM diagnostic retention with an explicit policy; recover enough
  metadata space before asking the image store to delete images. Never remove
  raw overlay directories, volumes, model caches or user workspaces as recovery.
- A failed download must leave a healthy current stack alone. Surface a
  persistent storage-blocked state and bounded retry/operator recovery.
- Regression tests: full disk, inode exhaustion, cleanup itself failing ENOSPC,
  untagged old images, shared layers, stopped-container references, preserved
  last-known-good, no unrelated deletion and no healthy-runtime restart.

## Test10: worker selected the wrong cluster

The user's requests were received. Worker pod
`clawmax-system/clawmax-cloud-worker-54c7b5765c-4pjbt`, accessed through context
`clawmax-workers`, logged five failed test10 actions in the inspected 12-hour
window. Example action: `58ad1e31-906b-44e8-81c1-107d3ff39336`.

Failure:

```text
capture previous cloud runtime environment before redeploy:
kubectl --context civo-nyc1-clawmax-cloud
  -n clawmax-cld-test10-molljk0d get deployment clawmax-dashboard -o json
Error from server (NotFound): namespaces "clawmax-cld-test10-molljk0d" not found
```

The namespace exists in context `clawmax-cloud-nyc1-2`, not the selected old
cluster. Its deployment generation and observed generation were both 442;
the running pod reported zero restarts and discovery reports RC79. Current
image digest: `sha256:017be1d8c648239096c2f0ae186556303688fd2b0dde76d6adfe8d474e82b82f`.
No RC82 ReplicaSet was observed. Failure is before runtime-environment capture
and redeploy, explaining why a requested upgrade produced no new pod.

CLI/cloud worker owners should trace the persisted instance cluster identity
through action routing and environment capture at `src/pkg/agent/agent.go`
(`capture previous cloud runtime environment before redeploy`). Bind every
read and mutation to that exact cluster; do not fall back to an ambient or
first matching NYC context. Do not create a duplicate namespace in the wrong
cluster or bypass environment preservation to make this error disappear.

Add multi-cluster regression tests with two NYC contexts, wrong-context
NotFound, concurrent instance operations and visible failed-action evidence.
After correcting routing, retry one correlated RC82 action and verify it
changes only the existing test10 deployment in the intended cluster.

## Return to Dashboard acceptance

CLI team owns changes, tests, worker/agent packaging and coordinated installation.
Report exact versions, SHAs, test results and action IDs; coordinate before
VM/agent stops. Existing streaming-timeout and deployment-deadline issues in
[the recovery handoff](RC81_MBP14_RECOVERY_2026-09-21.md) remain separate gates.
After successful upgrades, verify actual chat, Group communication, Template
execution, Workflow completion/results/cancellation and restart persistence.
Green image CI or health alone does not approve tester distribution.
