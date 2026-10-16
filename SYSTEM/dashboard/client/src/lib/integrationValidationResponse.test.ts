import assert from 'assert'
import { readIntegrationValidationResponse } from './integrationValidationResponse'

async function main() {
  for (const response of [
    new Response('<html>proxy failure</html>', { status: 502 }),
    new Response('<html>login</html>'),
    new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    Response.json({}), Response.json([]), Response.json(null),
    Response.json({ error: 'private upstream detail' }, { status: 503 }),
  ]) await assert.rejects(readIntegrationValidationResponse(response), /not verified/)
  for (const status of ['valid', 'invalid', 'error']) {
    const body = { openai: { status, message: 'synthetic' } }
    assert.deepEqual(await readIntegrationValidationResponse(Response.json(body)), body)
  }
}
main().then(() => console.log('Integration validation response tests passed')).catch(error => { console.error(error); process.exitCode = 1 })
