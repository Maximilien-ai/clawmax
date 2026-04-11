# Blaxel

Blaxel provides sandbox infrastructure that agents can use like disposable cloud computers. This unlocks safer application deployment, code execution, and experimentation flows in ClawMax.

## Validation

Blaxel declares a partner-level `Check keys` action. ClawMax validates the API key against the live Blaxel API from the integrations wizard.

### Auth contract

- Use `Authorization: Bearer <BLAXEL_API_KEY>`
- Validation should follow a documented, stable read endpoint
- Workspace defaults such as project, sandbox, and region are optional runtime context, not part of the key validation contract

### Current validation path

- Endpoint: `GET https://api.blaxel.ai/v0/models`
- Success criteria: any `2xx` response means the API key is accepted
- `401` / `403` means the key was rejected
- `404` means the API path is wrong or has changed

### Why this endpoint

We intentionally validate against a simple documented read endpoint instead of a project-specific endpoint.

That avoids a common integration mistake:
- validating auth with an endpoint that also depends on account, project, or workspace state
- then treating a project-context failure as if the API key itself were invalid

For future partners, prefer the same pattern:
- validate the secret against the simplest stable authenticated read
- keep optional runtime identifiers separate
- document both the auth format and the exact validation endpoint in the partner definition
