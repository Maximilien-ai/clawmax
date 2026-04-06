# Tomorrow Sprint: April 6, 2026

> Primary theme: cloud runtime truth
> Release posture: hold any broader rollout until cloud agents run real sessions instead of fixtures

## Current Root Cause

- Live audit on April 6, 2026 confirmed the cloud dashboard pod is shipping fixture OpenClaw, not the real CLI/runtime.
- In the live pod, `/usr/local/bin/openclaw` points to `/opt/openclaw/openclaw.mjs`, and that file prints `openclaw fixture`.
- The `clawmax-cli` cloud publish path currently stages `.ci/fixtures/openclaw` into the dashboard image build context.
- This explains all three cloud symptoms at once:
  - agent chat returns `openclaw fixture`
  - Skills page is empty because `~/.openclaw/openclaw.json` is missing
  - Doctor/runtime registration cannot become healthy because there is no real OpenClaw runtime in the image

## Top Priority

1. **Cloud runtime/bootstrap debug on live instance**
   - Target instance: `http://23eb5821-72ba-4ba5-b431-56e2d40065d3.k8s.civo.com/`
   - Fix the `clawmax-cli` cloud image build to package real OpenClaw instead of `.ci/fixtures/openclaw`
   - Rebuild and redeploy a cloud image, then verify the live pod has a real `openclaw --version`
   - Verify whether gateway, workspace registration, and agent sessions become healthy once the real runtime is present

2. **Cloud skill discovery parity**
   - Recheck Skills only after the real OpenClaw runtime is in the image
   - Confirm `~/.openclaw/openclaw.json` is created and agent registration matches `/workspace/AGENTS`

3. **Cloud log-stream stability**
   - Trace repeated `Connection lost. Reconnecting...`
   - Decide whether the issue is websocket transport, gateway/log source churn, or frontend reconnect behavior

## Cloud Debug Checklist

Run these on the cloud pod/container for the target instance:

1. **Doctor / runtime state**
   - full Doctor output
   - whether Auto-Fix changes registration/session state

2. **OpenClaw install and config**
   - `which openclaw && openclaw --version`
   - `cat ~/.openclaw/openclaw.json`
   - `ls -la ~/.openclaw`
   - `ls -la ~/.openclaw/workspaces`

3. **Workspace and agent registration**
   - `ls -la /app/WORKSPACES/default/AGENTS`
   - compare workspace agents vs `openclaw.json` registered agents
   - confirm whether agent session directories exist

4. **Gateway health**
   - `openclaw config get gateway.mode`
   - gateway process status
   - gateway port binding / health
   - whether Doctor and actual runtime tell the same story

5. **Environment**
   - `printenv | grep -E 'OPENCLAW|HOME|DASHBOARD|AUTH|GATEWAY'`
   - verify `HOME=/app` and expected workspace paths

6. **Dashboard health**
   - `curl -s http://127.0.0.1:3001/api/system`
   - `curl -s http://127.0.0.1:3001/api/health`

## Expected Outcomes

- Cloud agents no longer return `openclaw fixture`
- Skills page reflects actual workspace/runtime state
- log reconnect noise is reduced or precisely attributed
- remaining deployment blockers are narrowed to one concrete seam

## Secondary If Time Allows

- Template audit follow-through from [TEMPLATE_AUDIT_2026-04-05.md](/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/planning/TEMPLATE_AUDIT_2026-04-05.md)
  - first queue: `rag-team`, `support-team`, `data-team`, `convenience-store`, `travel-planning-desk`, `small-event-planning-desk`
- Senso/external result notification design
- onboarding follow-through scope for richer first-user setup
