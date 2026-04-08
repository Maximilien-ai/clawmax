# Sprint: April 6, 2026

> Primary theme: cloud runtime truth
> Release posture: hold any broader rollout until cloud agents run real OpenClaw sessions successfully

## Current Root Cause

- The original fixture-runtime blocker was confirmed and addressed in the image contract: cloud is no longer expected to ship `.ci/fixtures/openclaw`.
- The current cloud blocker is different:
  - the real OpenClaw package is now present
  - but the image is installing source without the built `dist/entry.(m)js` output
  - cloud logs now fail with `openclaw: missing dist/entry.(m)js (build output).`
- The canonical fix has been pushed in [Dockerfile](/Users/maximilien/github/Maximilien-ai/clawmax-codex/Dockerfile):
  - add an `openclaw-builder` stage
  - clone pinned OpenClaw ref `1116ae97662cce066dd130bc07d925fdd1dd3f32`
  - run `npm install` and `npm run build`
  - install the built package into the runtime image

## Top Priority

1. **Cloud runtime/bootstrap debug on live instance**
   - Target instance: `http://23eb5821-72ba-4ba5-b431-56e2d40065d3.k8s.civo.com/`
   - Rebuild and redeploy a cloud image from `clawmax` `main` including Docker commit `23aaf52`
   - Verify the live pod has a real `openclaw --version`
   - Verify the missing-build-output error is gone
   - Verify whether gateway, workspace registration, and agent sessions become healthy once the built runtime is present

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

- Cloud agents no longer fail on missing OpenClaw build output
- Skills page reflects actual workspace/runtime state
- log reconnect noise is reduced or precisely attributed
- remaining deployment blockers are narrowed to one concrete seam

## Secondary If Time Allows

- Cloud retest follow-through on:
  - `openclaw --version`
  - one agent chat
  - Skills page
  - Doctor output
- Senso/external result notification design
- onboarding follow-through scope for richer first-user setup
