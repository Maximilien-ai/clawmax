# RC99 acceptance fixes — November 17

## RC98 owner acceptance recorded

Owner reported “All looked good” with five follow-up items. Agent chat, Builder resize and model selection are explicitly accepted. Earlier RC98 spot checks are accepted subject to the issues below; actual event-device/restart acceptance is not inferred from that message.

- [x] Agent chat / Clear / History / Continue accepted.
- [x] Builder resize accepted.
- [x] Model selection accepted.
- [x] Other RC98 spot checks accepted with the reported exceptions tracked below.

## RC99 changes

- [x] Pipeline names wrap fully in bounded columns; controls occupy the next row.
- [x] Empty Workflows offers Create Workflow with AI first and retains provider readiness gating.
- [x] Secret example values no longer prefill inputs; optional collapsed guidance states no secret exists until saved.
- [x] Shared Markdown presentation and PDF rendering replace opaque provider citation tokens with “Source reference unavailable.” Actual Unicode, real links, code and original saved Markdown are preserved. URLs cannot be recovered without their source map.
- [x] Local dev persisted selection is Lifecycle and Review only. Private image defaults likewise disable Evals, Guardrails and Optimize; explicit operator choices and empty selection remain supported. Existing installations with explicit selections need their settings changed, not silently overwritten.
- [x] TypeScript/server build and focused regressions passed. Four desktop/mobile/theme visual cases passed.
- [x] Complete integration/validation/coverage suite: 583/583 passed; caller workspace registry unchanged. Statements/lines 59.71%, branches 76.93%, functions 66.07%.
- [ ] RC99 source CI and image builds; no RC99 image is published yet.

RC98 on localhost:3202 is unchanged except the requested persisted extension selection. UI changes are on public branch `release/rc99-acceptance-fixes`; private defaults are on `ci/rc98-image-revalidation` at `3006850`. Neither branch is claimed merged.

## Quick owner checks after RC99 dev is installed

- [ ] Read full long workflow names while another workflow runs; controls remain below.
- [ ] Empty Workflows starts with AI creation.
- [ ] Keys & Secrets starts blank with optional example instructions.
- [ ] The reported document shows readable missing-source notices, with ordinary Unicode and real links intact.
- [ ] Only Lifecycle and Review appear in Extensions by default.

Source CI: https://github.com/Maximilien-ai/clawmax/actions/runs/44120191763 (running). The inherited lifecycle acceptance correction is also carried forward and its seven behavior/eight contract checks pass.

## Required image dispatch preflight

Use `node SYSTEM/dispatch-test-image.mjs <candidate-tag> <expected-full-SHA> --dry-run`, then the same command without `--dry-run`. The helper verifies the existing remote tag resolves to the exact expected commit, including annotated tags, before sending full tag references to the image workflow. Never dispatch the image workflow with a raw SHA; its source input deliberately rejects that form. The expected SHA belongs in the helper's verification argument, not `source_ref`. The helper never creates or moves tags.

RC99 example:

```sh
node SYSTEM/dispatch-test-image.mjs v2.0.0-test-rc99 0c4272c76a7662102024683f727d38c826176361 --dry-run
```

Eight regression cases cover raw SHAs, branches, malformed inputs, missing/mismatched tags, dry-run, full-ref dispatch and annotated tags/cycles. Live RC99 preflight passed without dispatching another build. This tooling follow-up does not move the frozen RC99 tag or change its image source.

Corrected image build: https://github.com/Maximilien-ai/clawmax/actions/runs/44135914412 . Previous run 44135766090 stopped before checkout because an unsupported raw SHA was supplied.
