# Model admission and Agent Doctor verification

Dashboard team — 2026-09-29, America/Los_Angeles. Development branch:
`feat-2.0-maintenance-parity`. This is source/dev evidence, not RC or fleet approval.

## Model evidence ledger

Admission, runtime connectivity, and a successful model response are separate claims.
Never mark a model working solely because it appears in discovery or passes a mock test.
Record model ID, runtime version, date, environment, outcome, and failure category;
do not store credentials, raw prompts, or private model output in this ledger.

| Model | Current OpenAI picker policy | Live evidence |
| --- | --- | --- |
| `openai/gpt-5.5` | Allowed; requested minimum generation | Local OpenClaw 2026.9.5 smoke did not reach provider: gateway connection refused. Not yet verified. |
| `openai/gpt-5.4` and older | Excluded from new discovery and fallback options | Previous user-reported 5.4 response is historical evidence, not current approval. |

Exact local runtime allowlist updated from `openai/gpt-5.4-mini` to
`openai/gpt-5.5`, with a private config backup. No wildcard was added.
Saved agents and unrelated providers are not silently migrated; an existing agent
using an older model may need an explicit model edit. Other installations retain
their operator-owned runtime policies. API credentials were not changed.

Official model identity: https://developers.openai.com/api/docs/models/gpt-5.5
This source confirms the model, not this account's access or execution success.

Engineering checks: model discovery 14 passed, agent model 46 passed, TypeScript
passed. Model-selection change: `a72d101f`.

## Doctor behavior and evidence

- Scoped agent Doctor now runs the editor's content validation, repairs missing or
  alternate Name fields and missing document headings, and backs up changed files
  in a private `.doctor-backup-*` directory under the agent directory.
- Existing instructions, model selection, tools, credentials, and permissions are
  preserved. Empty tools are supported. Missing purpose/instructions and optional
  personality fields are not invented; remaining errors/warnings stay visible.
- An agent-specific repair does not repair other agents or restart the shared
  gateway. Existing explicit workspace-wide Doctor remains available.
- The editor offers **Doctor — fix draft**. It repairs the submitted draft without
  disk writes, preserves edits made during an in-flight request, and requires
  normal Save for persistence. Failures remain visible.
- Changed saved configuration produces a lifecycle audit entry. Linked config
  files require manual review rather than following them during repair.

Checks passed: config validation 21; config edge routes 16; Doctor recovery 4;
TypeScript; synthetic Chromium at 1440px and 390px (repair, no implicit save,
error retention, preserved draft, no horizontal overflow). Live draft-only API
check returned a valid repaired synthetic draft without saving AstroGuide.
Implementation: `f86cc5d6`; scope/linked-file regression: `0b97fbf1`.

## Remaining acceptance

1. Keep the dev gateway healthy; recent cold startup also encountered a lost
   startup migration lease. Do not delete leases or run broad repair blindly.
2. Get a nonempty GPT-5.5 response through Dashboard and record actual model,
   runtime version, latency, and outcome here. Earlier provider 401 is unresolved.
3. User checks AstroGuide's editor, repairs a draft, reviews changes, saves, and
   reopens it. A missing API key or ambiguous instructions must remain actionable,
   not be called automatically fixed.
4. Run the full integration/validation/coverage suite before any RC. No image or
   release was requested or created for these changes.
