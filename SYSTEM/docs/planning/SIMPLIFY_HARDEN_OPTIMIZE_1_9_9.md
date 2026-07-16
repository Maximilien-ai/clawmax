# Simplify / Harden / Optimize 1.9.9

> Status: reserved
> Baseline: `1.9.8` follow-through toward `2.0.0`
> Last updated: July 13, 2026

## Goal

Keep a second bounded release line available for small features and tester feedback that should ship before the complete `2.0.0` plugin platform is ready.

## Candidate Intake

Add named features here as they are defined. For each candidate, record:

- user problem and expected outcome
- dependency on `1.9.8` or `2.0.0` work
- affected product surfaces and runtime environments
- focused automated and manual validation
- whether it can ship independently or must remain in the `2.0.0` track

## Guardrails

- Do not turn `1.9.9` into a partial, incompatible copy of the `clawmax.ai/v2` plugin architecture.
- Keep OpenClaw/runtime upgrades on their own explicit RC validation path.
- Preserve `1.9.7` as the known rollback baseline until a later release is promoted and validated.
- Prefer small complete features over broad unfinished frameworks.
