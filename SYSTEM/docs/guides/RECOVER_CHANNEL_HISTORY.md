# Recovering older channel history

This guide is for the workspace owner. A recovery notice means ClawMax cannot
safely decide which channel owns an older history file. The messages have not
been automatically deleted, overwritten, or assigned to the first channel opened.

New group and community histories use separate identities. Older names such as
`Sales Team` and `Sales_Team` could previously share `sales_team.json`. Removing
one name does not resolve the ownership of messages already in that file.
ClawMax records the recovery requirement before supported channel deletions and
keeps it after later catalog changes.

## Owner procedure

1. Stop Dashboard instances that can write to this workspace. Back up the entire
   workspace, including `ORG` and `SYSTEM/messages`, before changing anything.
2. Review the affected legacy file privately. Check the matching channel catalog
   and legacy archives too. Do not publish message content or participant details
   in a GitHub issue or handoff.
3. If ownership cannot be established, retain the original files for reviewed
   recovery. An owner may explicitly quarantine them in a private recovery folder
   outside the active history locations. Preserve original filenames and a record
   of what was moved. Move only the exact legacy history and its matching archives;
   an archive for `sales_team_other` does not belong to `sales_team`.
4. Keep the blocked ownership receipt under the channel store's `.v2/legacy-owners`
   directory. Do not delete or edit it merely to make the notice disappear.
   Creating a uniquely named channel or deleting a conflicting channel is not
   proof of historical ownership.
5. Once the owner intentionally quarantines all ambiguous legacy files and archives,
   restart Dashboard. Existing unambiguous new histories remain available, and
   affected channels can start fresh histories. Quarantined messages still need
   separate reviewed recovery; this fix does not automatically split mixed history.

For unambiguous old histories, ClawMax records the existing declared owner and
keeps the original bytes. Later messages and archives are written to the new
store. Channel creation preserves an already provable legacy owner before a
similar name is added.

## Backups and rollback

Workspace ZIP export includes dot directories and therefore includes the new
`.v2` histories and ownership records. Keep full backups rather than copying
only the legacy JSON files.

Older Dashboard builds do not read the new store. After new history writes,
rolling back against the same workspace can show stale legacy history, including
messages now archived by the newer build. Restore a full pre-upgrade backup to a
separate workspace for rollback, and retain the newer data for later recovery.
Do not automatically merge old and new files.
