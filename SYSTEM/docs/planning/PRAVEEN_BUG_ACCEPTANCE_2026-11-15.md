# Praveen bug fixes — one acceptance session

Stable is **v1.9.9**; development is **2.0.0** with Node **24.22.0** and
OpenClaw **2026.9.7**. RC98 has not been cut. This batch contains the two bug
PRs, **#191 then #194**. OpenCode **#292 is a separate feature**, excluded from
this preview and acceptance. No deployment or image readiness is claimed.

## Scope and source

- [#191](https://github.com/Maximilien-ai/clawmax/pull/191): a checked compatible
  provider can supply its own chat model when the optional Default model is empty.
  Tested head `66a71e15` passed **582/582** local integration/validation/coverage
  checks and [required CI](https://github.com/Maximilien-ai/clawmax/actions/runs/43665197656).
  Endpoint/credential pairing, user/system policy, redirect refusal, bounded
  salted cache identities and request isolation remain enforced.
- [#194](https://github.com/Maximilien-ai/clawmax/pull/194): reconcile Praveen’s
  original native-history report with the newer history fixes already on main.
  The current reader already handles native SQLite/compressed events. The remaining
  bug reproduced on `6fc8eaa3`: old timestamp-seeded conversations were missed.
  Product checkpoint `fa07f60c` recovers only an exact identity/model match and pins
  its session durably so the next turn continues the displayed conversation. It
  refuses ambiguous matches, reports stale indexes, and preserves Clear/Continue.
  A current legacy index also outranks a stale semantic native pointer (#196),
  while exact server-owned native sessions keep priority. Four route cases cover
  long/hyphenated IDs, both seed formats, compressed replies, reopen, errors,
  ambiguity, unrelated-session exclusion, Clear/History/Continue, byte-identical
  SQLite and no legacy index. An additional execution case covers mixed stores.

PR #194 includes #191 as a dependency. Review/merge in **#191 → #194** order after
acceptance and each PR’s current-head CI/security evidence. No replacement PR,
force push or security-policy exception is needed.

## Owner / Praveen checklist

**reviewReason: external-environment** — one real compatible-provider workflow.
Engineering checks below are not owner acceptance tasks. Use an approved compatible
endpoint and your own credential. Standard local endpoints are enabled; additional
origins need the operator’s `CLAWMAX_MODEL_ENDPOINT_ORIGINS` configuration.

- [ ] **#191 provider:** in Model Integration, choose OpenAI-Compatible, enter the
  endpoint/key, leave **Default model empty**, click **Check Connection**, then
  **Save & Close**. Reopening should keep the endpoint and empty model field.
- [ ] **#191 execution:** create an agent with its offered model, send a short
  message, and try one Builder AI-generation action. Both should use that provider
  without demanding a typed default or silently substituting OpenAI.
- [ ] **#194 persistence:** close/reopen that agent chat, then refresh the page.
  The question and complete reply should remain in order.
- [ ] **#194 conversation:** Clear should show a fresh empty conversation. Open
  History, view the old conversation and Continue it; the old messages should return
  and a follow-up should continue that conversation.

Reply **`accept #191/#194`** with the provider name, or accept one separately and
report the other failing step. Without a real compatible provider, these external
checks remain pending; synthetic tests are not your provider’s acceptance. Praveen
can use this checklist without granting access to unrelated customer data. No
email or outreach is sent by preparing this file.

## Engineering evidence and limits

- [x] Current #194 reconciliation: native-history fixtures, seven durable-conversation
  tests, **75/75** execution cases, **92/92** agent-route cases and server TypeScript pass in a private unit
  environment. The added cases extend the existing suites; they do not add two
  top-level test groups.
- [x] #191 browser checks: 1440px/390px, light/dark, empty-model verification,
  visible discovered models, save/reload, readiness, changed-key invalidation,
  no page errors/overflow. #194 changes no production UI; its chat response/error
  behavior is also checked through the production panel with synthetic API fixtures.
- [x] #191 strict frontend typing adds zero to main’s 290-diagnostic baseline.
  This is not a clean frontend type-check claim.
- [ ] Combined committed-source full integration/validation/coverage, with isolated
  gateway/workspace/registry and before/after operator-registry hash guard.
  Expected **12–15 minutes**; grouped total remains **582**.
- [ ] #194 final-head CI, normally **26–43 minutes**, and same-query local CodeQL
  comparison. GitHub default CodeQL setup skips fork PRs; no absent scan is called
  green. Final results/source identities go on the PR without evidence-only commits
  restarting CI.
- [ ] Independent live-provider workflow above; source merge remains separate from
  RC98 readiness and public/private amd64/arm64 image validation.

#191’s successful local CodeQL regression scan retained **558** raw results
(12 critical-rated, 539 high-rated, seven medium-rated), with zero added/removed
alert identities and no findings on changed lines. One unchanged local BYOK-storage
alert has additional source traces through the unchanged fingerprint helper.
Dashboard owns baseline disposition before RC98 promotion; none is silently waived.
Security follow-ups #418/#419 and the other RC98 gates remain open.

**Retained history boundary:** [#420](https://github.com/Maximilien-ai/clawmax/issues/420)
tracks owner-assisted recovery when an older identity timestamp/model no longer
reconstructs a verifiable seed. Records are unchanged; the fix does not guess a
newest or prefix-only session. #196/#216 remain open for their complete criteria
and current-source/owner confirmation. They are not closed by this partial overlap.

## Preview and local test command

The combined bug preview will use **http://localhost:5182** (API **3009**),
from the final committed bug-only source. Exact source/root/readiness receipts go
on #194. Private HOME/workspace/registry/gateway; no copied provider credentials.
Older previews 5180/5181 are separate and do not contain the new legacy recovery.
The primary checkout stays on clean main until acceptance/merge.

Run from the combined checkout `/private/tmp/clawmax-history-194`, using Node
24.22.0 on PATH and your configured integration provider:

```sh
env -u OPENCLAW_BIN DASHBOARD_PORT=3002 DASHBOARD_CLIENT_PORT=5176 DASHBOARD_APP_URL=http://localhost:5176 ./SYSTEM/test-with-server.sh integration --with-validation --coverage
```

Task-owned validation reads only the selected integration credential into child
memory; it does not copy the primary .env into this checkout. Logs and the final
registry-preservation receipt will be linked from #194.
