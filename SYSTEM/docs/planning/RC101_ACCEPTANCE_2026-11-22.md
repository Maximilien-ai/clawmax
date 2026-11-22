# RC101 workflow acceptance and release queue

Sunday’s candidate source is `24fdb353` on `release/rc101`. It includes RC100, the November 20 triage inventory and the tested coverage collection fix. [Source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/45044436376).

## Owner acceptance

Open Workflows and choose List on the local source preview. If the workspace tour appears, dismiss it. On a phone, scroll the table horizontally to Schedule.

- [ ] **#357** Compare **RC101 Manual Review** and **RC101 Scheduled Review**. The enabled manual workflow should tell you to use Run. The disabled Monday workflow should explain how to enable scheduling. Is the distinction clear?
- [ ] **#374** Choose Select, check **RC101 Resume A** and **RC101 Resume B**, and click Resume. Expect two successes, selection mode to close, and both workflows to remain Ready after refresh.

## Engineering evidence

The focused tests cover manual and scheduled workflows, disabled workflows, pipeline pause, HTTP errors, and transport failures. Against the isolated API, successful, failed and mixed batches produced the expected persisted enabled flags. The two sample workflows were reset for owner acceptance. Chrome verified the list at 1440px and 390px.

The RC100 Picomatch advisory was withdrawn November 18 because its maintainers determined it was not a security issue. The withdrawal also covers the previously identified bundled copies for this advisory. The RC101 audit passed without an exception. npm reported 574 dependencies, 10 moderate findings across the full tree and three moderate in production, with zero high or critical in either audit. [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

## Daily release cadence

Target one candidate per day, Sunday through Wednesday. Dashboard finishes the batch and automated validation, then provides one local preview and a short checklist for owner acceptance. After acceptance, tag the accepted source, build the public and combined images, verify both architectures and GCP mirror digests, and share pinned image references with on-prem, cloud, and tester teams. Capture deployment and tester results separately.

Chrome also verified all-success, all-failure and mixed bulk Resume notifications, persisted state and retry selection after the list refreshed.

## Proposed release queue

GitHub had 114 open issues on November 22, all triaged. The 67 labeled feedback comprise 21 high, 34 medium and 12 low. Across all issues the split is 35 high, 58 medium and 21 low. The following batches are targets pending reproduction. Issues outside these batches stay in the priority queue.

| Date | Candidate | Scope and acceptance |
| --- | --- | --- |
| Sun Nov 22 | RC101 | #357 and #374. One Workflows list session. |
| Mon Nov 23 | RC102 | Document integrity first. #352 for rapid file switching and #353 for preview/download fidelity. Verify with two documents and a binary file. |
| Tue Nov 24 | RC103 | Agent continuity. Reproduce #420 and #440 together on a disposable upgraded workspace. Verify saved history and model-change failure/recovery. |
| Wed Nov 25 | RC104 | Workflow execution truthfulness. Start with #438 for empty results and missing outputs. Recheck earlier accepted paths and use remaining time for release blockers. |

Before a full release, review remaining high-priority items, including security reports #281/#285, destructive operations #245 and scheduler isolation #247. A candidate passing its own checklist does not resolve those issues. The release team should explicitly disposition remaining blockers before promotion. [Full priority inventory](ISSUE_PRIORITIES_2026-11-20.md).
