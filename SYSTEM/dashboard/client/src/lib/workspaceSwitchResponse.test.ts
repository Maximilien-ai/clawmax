import assert from 'assert'
import { workspaceSwitchError } from './workspaceSwitchResponse'
async function main() {
  for (const response of [new Response('<html>proxy</html>', { status: 502 }),
    new Response('', { status: 503 }),
    new Response('{broken', { status: 500, headers: { 'content-type': 'application/json' } }),
    Response.json({ error: {} }, { status: 500 })]) {
    assert.match(await workspaceSwitchError(response), /Refresh the workspace list/)
  }
  assert.equal(await workspaceSwitchError(Response.json({ error: 'Workspace recovery required' }, { status: 503 })), 'Workspace recovery required')
}
main().then(() => console.log('Workspace switch response tests passed')).catch(error => { console.error(error); process.exitCode = 1 })
