# Message isolation #404 — November 10 investigation

Status: confirmed defect; not fixed, not accepted, not closed.
Source: merged main `da30720f8b1673092bfcd9b6137b23e335b4151a`.
The investigation branch currently adds documentation only to that product source.

## Confirmed storage collision

In a disposable workspace, the production `createGroup` function accepts both
`Sales Team` and `Sales_Team` as distinct groups. The production group-message
POST handler saves `SYNTHETIC_ALPHA_ONLY` to `Sales Team`, without mentions.
A GET of `Sales_Team` then returns that message despite no message being sent to
that group. The second group's in-memory key was initially cold.

`server/lib/messages.ts` keeps separate in-memory keys using the exact channel
name, but `getMessageFile` replaces punctuation/whitespace with underscores and
lowercases the name. Both names therefore use `SYSTEM/messages/groups/sales_team.json`.
The archive naming code uses the same normalization and needs coverage too.
This establishes a disk identity defect; it does not establish that every
reported cross-group message had this cause.

Evidence: `/private/tmp/clawmax-404-collision-repro.cjs`, executed with Node and
`ts-node/register/transpile-only`. It creates/removes a temporary workspace and
calls production creation/message handlers directly. The control demonstrated
that creation succeeds and the unrelated group's GET returns the synthetic
marker. No agent, model, gateway turn, participant data or real workspace was used.
This is a handler-level reproduction, not a completed live gateway or HTTP audit.

## Additional source findings awaiting reproduction

- GroupChatPanel initializes message/archive state from a channel cache only on
  mount. Communication reuses that component when switching channels, without a
  React identity key. Its polling effect depends on the name rather than the
  complete channel identity. Check stale state and delayed responses when
  switching between groups and same-named groups/communities.
- The browser cache key contains type/name, without the workspace identity.
  Verify cache behavior across workspace switches rather than assuming server
  workspace isolation also covers the browser cache.
- Verify that dispatch recipients are limited to the intended membership,
  including community messages and explicit mentions. The storage reproduction
  did not invoke recipients and makes no routing claim.

## Required fix and closure evidence

- [ ] Give distinct supported channel identities distinct persisted histories,
  including names differing by case, spaces, underscores or punctuation.
- [ ] Preserve existing histories. Ambiguous legacy ownership must not be silently
  assigned to the first reader, overwritten, deleted, or presented as empty.
  Provide a clear recovery state if the existing bytes cannot be safely assigned.
- [ ] Cover persistence across a fresh module/process, clear/archive/read/delete
  boundaries, ordinary noncolliding names, and workspace/type separation.
- [ ] Verify disjoint group memberships, community dispatch, and delayed UI
  responses/cache scope. Fix every confirmed path covered by #404 before closure.
- [ ] Run focused regression suites and TypeScript during implementation; retain
  the complete integration/validation/coverage result for the next RC candidate.
- [ ] Record source/runtime and the linked Management feedback disposition before
  closing #404. The report remains unresolved; no participant email was sent by
  this investigation.
