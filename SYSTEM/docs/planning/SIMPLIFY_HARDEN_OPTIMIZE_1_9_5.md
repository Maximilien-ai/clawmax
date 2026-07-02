# Simplify / Harden / Optimize 1.9.5

> Status: active after `1.9.4`
> Last updated: July 2, 2026

## Goal

Establish a lightweight, repeatable performance baseline for core dashboard/runtime actions so later releases can be compared against something concrete instead of anecdotal “it feels slower.”

`1.9.5` is not a broad product feature release. It is the baseline-and-measurement release that prepares `1.9.6`.

## Scope

### 1. Baseline timing artifacts

Record timings from the existing integration harness into a machine-readable artifact:

- workflow list / first workflow collection load
- direct agent chat round-trip
- workflow trigger request latency
- workflow kickoff to first visible progress
- workflow kickoff to completion

Store the result as a JSON artifact so later RCs and releases can compare before/after values.

### 2. Wrapper visibility

Make the wrapper print a compact performance summary after integration runs, similar to coverage summary output.

### 3. Stability over strict thresholds

Do not fail the suite on performance yet.

The first pass should:

- record timings
- surface them clearly
- keep the measurements stable enough to compare over time

Only after we have a few real runs should we consider warnings or regression thresholds.

### 4. Follow-up candidates inside `1.9.5`

If the first baseline works cleanly, extend it carefully to include:

- workspace switch timing
- templates/workflows page first meaningful data timing
- maybe a second chat sample for variance comparison

But keep `1.9.5` small enough that it remains a reliable measurement release.

## Why this matters

This prepares `1.9.6`:

- the OpenClaw update should be judged with before/after timing data
- not just “faster/slower” impressions

It also gives us a durable trend line for:

- chat responsiveness
- workflow responsiveness
- integration-harness responsiveness

## Expected artifacts

- `SYSTEM/dashboard/perf/perf-summary.json`
- wrapper console summary in `SYSTEM/test-with-server.sh`

## Out of scope

- no hard fail gates on timing yet
- no broad runtime rewrite
- no OpenClaw update inside `1.9.5`
