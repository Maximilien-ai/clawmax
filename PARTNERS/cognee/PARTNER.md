# Cognee

Use Cognee when workspaces need durable agent memory, semantic recall, and shared context across teams of agents.

## First cut in ClawMax

- surfaces Cognee as an optional Context / Memory partner,
- supports Cloud and self-hosted configuration fields:
  - `COGNEE_API_KEY`
  - `COGNEE_BASE_URL`
  - `COGNEE_DATASET_NAME`
  - `COGNEE_SEARCH_TYPE`
- exposes runtime-managed configuration in cloud/on-prem deployments,
- links users to Cognee docs and the official OpenClaw integration,
- surfaces Cognee during template apply as an optional semantic memory layer.

## Official OpenClaw path

Cognee documents the official OpenClaw plugin:

```text
@cognee/cognee-openclaw
```

The documented plugin path indexes OpenClaw memory files, recalls relevant context before agent runs, and syncs deleted memory files. ClawMax should prefer this official path before adding first-party `clawmax-cognee-*` skills.

## V1 notes

- Live Cognee API validation is intentionally not enabled yet.
- Partner Skills shows the official plugin as planned until package/runtime install behavior is verified.
- Template apply can inject Cognee guidance into workflows, but it does not auto-ingest data or assign a non-existent skill.
- Memory ingestion must remain opt-in because Cognee can retain workspace and agent context outside the local workspace.
