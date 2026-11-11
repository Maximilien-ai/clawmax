import assert from 'assert'
import { INTEGRATION_VALIDATION_CSRF_REJECTED, INTEGRATION_VALIDATION_UNAVAILABLE, IntegrationValidationError, readIntegrationValidationResponse } from './integrationValidationResponse'

async function main() {
  for (const response of [
    new Response('<html>proxy failure</html>', { status: 502 }),
    new Response('<html>login</html>'),
    new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    Response.json({}), Response.json([]), Response.json(null),
    Response.json({ error: 'private upstream detail sk-test-secret' }, { status: 503 }),
    Response.json({ error: 'Forbidden sk-test-secret', code: 'workspace_forbidden' }, { status: 403 }),
    new Response('<html>forbidden</html>', { status: 403 }),
    new Response('{broken', { status: 403, headers: { 'content-type': 'application/json' } }),
  ]) await assert.rejects(readIntegrationValidationResponse(response), (error: unknown) =>
    error instanceof IntegrationValidationError && error.message === INTEGRATION_VALIDATION_UNAVAILABLE)
  // The guard's 403 maps to a fixed, actionable message; nothing from the body reaches the user.
  const csrf = Response.json({ error: 'Cross-origin request denied sk-test-secret', code: 'csrf_rejected' }, { status: 403 })
  await assert.rejects(readIntegrationValidationResponse(csrf), (error: unknown) =>
    error instanceof IntegrationValidationError && error.message === INTEGRATION_VALIDATION_CSRF_REJECTED)
  for (const status of ['valid', 'invalid', 'error']) {
    const body = { openai: { status, message: 'synthetic' } }
    assert.deepEqual(await readIntegrationValidationResponse(Response.json(body)), body)
  }
}
main().then(() => console.log('Integration validation response tests passed')).catch(error => { console.error(error); process.exitCode = 1 })
