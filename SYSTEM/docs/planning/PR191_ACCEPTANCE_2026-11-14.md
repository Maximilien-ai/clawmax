# PR #191 — compatible-provider model selection

Stable remains **v1.9.9**; development is **2.0.0** on OpenClaw **2026.9.7**
and Node **24.22.0**. RC98 has not been cut. Dashboard owns this public-source
work; no provider deployment or RC image readiness is claimed.

[Existing PR #191](https://github.com/Maximilien-ai/clawmax/pull/191) is refreshed
onto merged #296/main `703d65eb`. Product checkpoint **`737b413a`** preserves main's
endpoint allowlist, redirect rejection, salted credential cache identities,
retired-model handling, chat Clear/History/Continue and generation isolation.
The contributor fork permits maintainer edits; updates use its existing branch,
without force pushes or a replacement PR.

A checked OpenAI-compatible endpoint may advertise its chat model when BYOK's
optional **Default model** is empty. Explicit models keep priority. Discovery,
generation, chat and agent defaults pair the endpoint with the credential and
model belonging to it; user execution retains its separate SYSTEM-key policy.
Untouched compatible defaults do not displace working hosted providers or an
explicitly enabled CLI. New nested-empty generation scopes always own their
credential container, restore their parent on success/failure, and snapshot keys.

## Minimal check on your provider

This is one **external-environment** check before relying on the path in RC98;
automated protocol/security checks are engineering-owned below. Use an approved
local or remote compatible endpoint you normally use; no credentials are included
in this file or copied into the preview.

- [ ] In the isolated dev instance's **Model Integration / BYOK**, select your
  OpenAI-compatible endpoint. Leave **Default model** empty, run **Check Key**,
  and save. It should verify without asking you to type an OpenAI model name.
- [ ] Create an agent with the endpoint's offered chat model and send a short
  message. It should reply through that service. Reopen Builder and use an AI
  generation action; it should not warn that a default model is mandatory or
  silently switch to OpenAI.

These two rows are one provider workflow. Reply **`accept #191`** with the provider
name when satisfied, or report the failing step. If you have no compatible service
available, keep this external check pending; synthetic evidence is not a live
provider claim. Server trust remains required: standard local LM Studio/Ollama
origins are enabled locally; other origins require the operator's
`CLAWMAX_MODEL_ENDPOINT_ORIGINS` configuration. Query strings, embedded credentials
and redirects remain rejected by discovery.

Local dev will be served on **http://localhost:5181** (API **3008**), using a
committed source snapshot, private home/workspace/registry and gateway. The exact
source/root and readiness receipt will be recorded on the PR when started. The
older preview on port 5180 is separate.

## Engineering checklist

- [x] BYOK **39**, model discovery **41**, agent-default selection **12**, AI
  generation **68**, agent execution **74**, chat edges **15**, agent routes **88**,
  templates **83**, dynamic security **133** and CLI generation-runtime **33**
  cases pass in private unit fixtures. The unit caller supplies local deployment
  mode; tests approve only their explicit synthetic model origins.
- [x] Real HTTP tests reject a credential-bearing redirect, coalesce concurrent
  catalogs only within one credential, and use the actual OpenAI SDK to generate
  through each tenant's own discovered model/key. No real provider receives these
  synthetic requests. Nested-empty context success, rejection and mutable-input
  snapshot cases pass alongside real HTTP request/keep-alive isolation.
- [x] Lint, server TypeScript and production build pass. Dependency files are
  unchanged. URL normalization retains main's linear trailing-separator handling.
- [ ] Desktop/mobile, light/dark browser check of optional-model readiness and
  persistence; actual provider protocol calls remain separately checked above.
- [ ] Full local integration/validation/coverage, disposable gateway/workspace,
  before/after operator-registry preservation guard. Expected **12–15 minutes**.
  The top-level group total remains **582**; cases added to existing suites do not
  each create a new top-level group. Their actual case counts are listed above.
- [ ] Strict frontend typing compared with main's **290-diagnostic** baseline;
  any new diagnostic must be resolved rather than counted as baseline.
- [ ] Final-head required CI/CodeQL, normally **27–43 minutes**. Final receipts
  will be added to the PR without resetting CI for evidence-only edits.
- [ ] Fresh-main review and merge, preserving any pending external-provider
  release check rather than claiming it completed by CI.

Focused evidence: `/private/tmp/clawmax-191-{focused-summary,runtime-summary,
http-summary,types,lint,build}.log`. The full run and browser artifacts will have
separate receipts. The unrelated security follow-ups #418 and #419 stay open;
o feedback report or contributor PR is closed merely because related code exists.
