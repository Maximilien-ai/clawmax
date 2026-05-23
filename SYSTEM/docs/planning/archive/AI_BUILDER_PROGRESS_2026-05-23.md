# AI Builder Progress Archive

Date: May 23, 2026
Branch: `ai-builder-designer`

## Completed Today

- expanded Builder design doc to reflect current implementation
- wrote initial web contract for Builder session and feedback sharing
- added privacy/TOS language for Builder prompt/response/feedback collection
- externalized Builder routing evals into `server/lib/ai-builder-evals.json`
- added a substantial second batch of Builder routing eval cases
- fixed multiple Builder routing issues exposed by the new eval set:
  - false refine matches from words like `updates`
  - explicit `create new ... template` requests collapsing into reuse/template-start
  - under-detection of `team_of_teams` scope for company/organization requests
  - explicit agent-template creation being hijacked by skills/tool wording
  - ambiguity confidence being too high on competing reuse-vs-new asks
- improved Builder starter prompts and prompt dedupe
- added `Improve with AI` to Builder
- upgraded the shared prompt editor:
  - markdown preview
  - improvement-direction field
  - resizable dialog
  - no outside-click dismissal
  - attachment add/remove support
  - attachment context included in Builder prompt improvement
- full `SYSTEM/test.sh` green: `104/104`

## Remaining High-Value Work

- keep growing Builder evals from real prompts
- tighten recommendation quality only where evals fail
- verify Builder handoff correctness end-to-end
- add Builder markdown/session export to DocHub
- implement remote Builder session/feedback sharing
- add built-in/system-agent metering and model selection
