# Dashboard Runtime Split Investigation

Last updated: May 24, 2026

## Summary

This note captures the result of investigating whether the supervised dashboard runtime should move from the current 2-container pod shape:

- `dashboard`
- `gateway`

to a 3-container shape:

- `dashboard-ui`
- `dashboard-server`
- `gateway`

This is an architecture investigation only. It is not a committed runtime change.

## Current Recommendation

Do not prioritize the 3-container split right now.

Keep the current 2-container runtime as the default shape unless one of the following becomes a demonstrated problem:

- the Node dashboard server needs to scale independently from static UI serving
- per-container observability is materially blocked by the combined dashboard container
- restart isolation between static serving and Node API logic becomes operationally important

If a prototype is explored later, preserve same-origin browser behavior:

- browser still sees one origin
- `/api` is proxied internally to the server container
- do not introduce browser-visible cross-origin API traffic in the first prototype

If same-origin cannot be preserved cleanly, the split is not worth the complexity right now.

## What Was Evaluated

### Potential advantages

- clearer separation between static asset serving, API/server logic, and gateway behavior
- clearer restart/failure-domain analysis
- easier per-container monitoring and alerting
- cleaner long-term path for tuning server and gateway independently
- possible hardening benefit from a more minimal static-serving UI container

### Important caveats

- the frontend already builds to static assets, so runtime cost is likely still concentrated in the Node server and gateway
- a single pod still schedules on the sum of all container requests and limits
- a third container adds deployment, proxy, probe, and observability complexity
- a naive split risks CORS, cookie, auth, or session regressions
- parity work would be required across cloud, local, and on-prem runtime shapes if the split became permanent

## Recommended Prototype Plan

If this investigation is revisited later, use this order:

1. Capture a baseline from the current 2-container runtime.
   - CPU and memory for `dashboard` and `gateway`
   - startup time
   - readiness behavior
   - restart behavior

2. Define the target split precisely.
   - `dashboard-ui`: static assets only
   - `dashboard-server`: Node API/auth/server logic only
   - `gateway`: unchanged

3. Prototype in Kubernetes first.
   - preserve same-origin browser behavior
   - avoid starting with full local/podman parity work

4. Run functional checks.
   - login/session
   - dashboard navigation
   - template apply
   - workflows
   - agent chat/gateway paths

5. Run operational checks.
   - restart `ui` only
   - restart `server` only
   - restart `gateway` only
   - compare blast radius and recovery behavior

6. Compare before/after.
   - total pod CPU/memory
   - per-container CPU/memory
   - startup/readiness stability
   - operational clarity

7. Decide go/no-go.
   - keep only if observability/isolation improve without auth/routing pain
   - otherwise keep the current 2-container shape

## Decision

Status: investigated, documented, deferred.

The current 2-container runtime remains the recommended production shape for now.
