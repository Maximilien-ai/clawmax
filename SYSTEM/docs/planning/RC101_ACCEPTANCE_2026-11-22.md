# RC101 workflow acceptance and release queue

Sunday’s candidate source is `11c09f66` on `release/rc101`. It includes RC100, the November 20 triage inventory and the tested coverage collection fix. [Source CI](https://github.com/Maximilien-ai/clawmax/actions/runs/45047675406).

## Owner acceptance

Owner accepted all four fixes after rechecking #357 on November 22. The accepted tag is `v2.0.0-test-rc101`. [Public image build](https://github.com/Maximilien-ai/clawmax/actions/runs/45051799506).

Open [the local Workflows preview](http://localhost:5188/workflows) and choose List. If the workspace tour appears, dismiss it. On a phone, scroll the table horizontally to Schedule.

- [x] **#357** Compare **RC101 Manual Review** and **RC101 Scheduled Review**. The enabled manual workflow should tell you to use Run. The disabled Monday workflow should explain how to enable scheduling. Is the distinction clear?
- [x] **#370 / #374** Search for **RC101 Resume**, choose Select, click the table header checkbox to select both visible rows, and click Resume. Expect two successes, selection mode to close, and both workflows to remain Ready after refresh.

- [x] **#354** Switch between Grid and List. This isolated preview should show **Metering off** in both. In a metered workspace each workflow shows its own all-time estimate or **No recorded cost**.

## Repeating the local tests

From the repository root on `release/rc101`, after the previous run exits:

```sh
env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

## Engineering evidence

Browser-only metering fixtures verified that the same two workflows showed $0.61 and $0.06 respectively in both Grid and List and that an unrun workflow showed no recorded cost. The preview itself uses the real metering response.

Full isolated integration, validation and coverage passed 584/584 on the product source. Coverage reached 84.17% for lines and statements, 82.06% for branches and 92.49% for functions. The local source preview reports `2.0.0-dev.11c09f66`.

The focused tests cover manual and scheduled workflows, disabled workflows, pipeline pause, HTTP errors, and transport failures. Against the isolated API, successful, failed and mixed batches produced the expected persisted enabled flags. The two sample workflows were reset for owner acceptance. Chrome verified the header from empty, partial and full selection with four unfiltered rows and two filtered rows, including deselection. Chrome verified the list at 1440px and 390px.

The RC100 Picomatch advisory was withdrawn November 18 because its maintainers determined it was not a security issue. The withdrawal also covers the previously identified bundled copies for this advisory. The RC101 audit passed without an exception. npm reported 574 dependencies, 10 moderate findings across the full tree and three moderate in production, with zero high or critical in either audit. [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

## Feedback closeout

Closed #354, #357, #370 and #374. Five linked reports received replies and notification requests. Four reports were closed as addressed. FB-07af8e63 remains open for #388 and #396. Email delivery is unverified.

## Daily release cadence

Target at most one accepted candidate per day through Wednesday. Two or three candidates may suffice. The number follows the urgent and must-have fixes ready for review. Dashboard finishes the batch and automated validation, then provides one local preview and a short checklist for owner acceptance. After acceptance, tag the accepted source, build the public and combined images, verify both architectures and GCP mirror digests, and share pinned image references with on-prem, cloud, and tester teams. Capture deployment and tester results separately.

Chrome also verified all-success, all-failure and mixed bulk Resume notifications, persisted state and retry selection after the list refreshed.

## Proposed release queue

GitHub had 114 open issues on November 22, all triaged. The 67 labeled feedback comprise 21 high, 34 medium and 12 low. Across all issues the split is 35 high, 58 medium and 21 low. Review every high-priority issue for release impact and disposition. Address urgent and must-have defects first, then other high-priority issues and feasible medium-priority fixes. The following batches are starting points pending reproduction. Combine them when practical and retain unresolved issues in the priority queue.

| Date | Candidate | Scope and acceptance |
| --- | --- | --- |
| Sun Nov 22 | RC101 | #354, #357, #370 and #374. One Workflows list session. |
| Mon Nov 23 | RC102 | Document integrity first. #352 for rapid file switching and #353 for preview/download fidelity. Verify with two documents and a binary file. |
| Tue Nov 24 | RC102 or RC103 | Agent continuity. Reproduce #420 and #440 together on a disposable upgraded workspace. Verify saved history and model-change failure/recovery. |
| By Wed Nov 25 | Final candidate if needed | Workflow execution truthfulness. Start with #438 for empty results and missing outputs. Recheck earlier accepted paths and use remaining time for release blockers. |

Before a full release, review remaining high-priority items, including security reports #281/#285, destructive operations #245 and scheduler isolation #247. A candidate passing its own checklist does not resolve those issues. The release team should explicitly disposition remaining blockers before promotion. [Full priority inventory](ISSUE_PRIORITIES_2026-11-20.md).
