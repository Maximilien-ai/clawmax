/**
 * Channels routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/channels.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function getRouteHandler(method: 'get' | 'post' | 'delete', routePath: string) {
  delete require.cache[require.resolve('./channels')]
  const router = require('./channels').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Channels Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-channels-routes-home-'))
  const workspacePath = path.join(tmpHome, 'workspace')
  ensureWorkspaceScaffold(workspacePath)
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('community and group creation reject missing names', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const createGroup = getRouteHandler('post', '/groups')

    const communityRes = makeRes()
    await createCommunity(makeReq({ body: {} }), communityRes)
    assert.strictEqual(communityRes.statusCode, 400, 'Expected missing community name to return HTTP 400')

    const groupRes = makeRes()
    await createGroup(makeReq({ body: {} }), groupRes)
    assert.strictEqual(groupRes.statusCode, 400, 'Expected missing group name to return HTTP 400')
  })

  await test('community and group routes create, list, and delete channel structures', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const createGroup = getRouteHandler('post', '/groups')
    const listCommunities = getRouteHandler('get', '/communities')
    const listGroups = getRouteHandler('get', '/groups')
    const deleteGroup = getRouteHandler('delete', '/groups/:name')
    const deleteCommunity = getRouteHandler('delete', '/communities/:name')

    const communityRes = makeRes()
    await createCommunity(makeReq({
      body: {
        name: 'Research Hub',
        description: 'Shared research coordination',
        tags: ['research'],
        members: ['analyst1'],
      },
    }), communityRes)
    assert.strictEqual(communityRes.statusCode, 200, 'Expected community create success')
    assert.strictEqual(communityRes.jsonBody?.ok, true, 'Expected ok community response')

    const groupRes = makeRes()
    await createGroup(makeReq({
      body: {
        name: 'Analysts',
        description: 'Analyst execution lane',
        community: 'Research Hub',
        tags: ['analysis'],
        members: ['analyst1'],
      },
    }), groupRes)
    assert.strictEqual(groupRes.statusCode, 200, 'Expected group create success')
    assert.strictEqual(groupRes.jsonBody?.ok, true, 'Expected ok group response')

    const communitiesRes = makeRes()
    await listCommunities(makeReq(), communitiesRes)
    assert((communitiesRes.jsonBody?.communities || []).some((community: any) => community.name === 'Research Hub'), 'Expected created community in list')

    const groupsRes = makeRes()
    await listGroups(makeReq(), groupsRes)
    assert((groupsRes.jsonBody?.groups || []).some((group: any) => group.name === 'Analysts' && group.community === 'Research Hub'), 'Expected created group in list')

    const deleteGroupRes = makeRes()
    await deleteGroup(makeReq({ params: { name: encodeURIComponent('Analysts') } }), deleteGroupRes)
    assert.strictEqual(deleteGroupRes.statusCode, 200, 'Expected group delete success')

    const deleteCommunityRes = makeRes()
    await deleteCommunity(makeReq({ params: { name: encodeURIComponent('Research Hub') } }), deleteCommunityRes)
    assert.strictEqual(deleteCommunityRes.statusCode, 200, 'Expected community delete success')
  })

  await test('message-counts returns empty counts for a fresh workspace', async () => {
    const handler = getRouteHandler('get', '/message-counts')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected message-counts success')
    assert.deepStrictEqual(res.jsonBody?.counts || {}, {}, 'Expected no message counts in a fresh workspace')
  })

  await test('delete routes return 404 for missing groups and communities', async () => {
    const deleteGroup = getRouteHandler('delete', '/groups/:name')
    const deleteCommunity = getRouteHandler('delete', '/communities/:name')

    const groupRes = makeRes()
    await deleteGroup(makeReq({ params: { name: encodeURIComponent('Missing Group') } }), groupRes)
    assert.strictEqual(groupRes.statusCode, 404, 'Expected missing group delete to return HTTP 404')

    const communityRes = makeRes()
    await deleteCommunity(makeReq({ params: { name: encodeURIComponent('Missing Community') } }), communityRes)
    assert.strictEqual(communityRes.statusCode, 404, 'Expected missing community delete to return HTTP 404')
  })

  await test('group messages can be sent, listed, and archived', async () => {
    const createGroup = getRouteHandler('post', '/groups')
    const sendGroupMessage = getRouteHandler('post', '/groups/:name/messages')
    const listGroupMessages = getRouteHandler('get', '/groups/:name/messages')
    const clearGroupMessages = getRouteHandler('delete', '/groups/:name/messages')
    const listGroupArchives = getRouteHandler('get', '/groups/:name/archives')
    const getGroupArchive = getRouteHandler('get', '/groups/:name/archives/:filename')

    await createGroup(makeReq({
      body: {
        name: 'Ops Team',
        description: 'Operations chat lane',
      },
    }), makeRes())

    const sendRes = makeRes()
    await sendGroupMessage(makeReq({
      params: { name: encodeURIComponent('Ops Team') },
      body: { content: 'Daily status update', from: 'User' },
    }), sendRes)
    assert.strictEqual(sendRes.statusCode, 200, 'Expected group message send success')

    const listRes = makeRes()
    await listGroupMessages(makeReq({ params: { name: encodeURIComponent('Ops Team') } }), listRes)
    assert.strictEqual(listRes.statusCode, 200, 'Expected group messages list success')
    assert.strictEqual((listRes.jsonBody?.messages || []).length, 1, 'Expected one group message')

    const clearRes = makeRes()
    await clearGroupMessages(makeReq({ params: { name: encodeURIComponent('Ops Team') } }), clearRes)
    assert.strictEqual(clearRes.statusCode, 200, 'Expected group clear success')
    assert.strictEqual(clearRes.jsonBody?.ok, true, 'Expected archive-on-clear success')

    const archivesRes = makeRes()
    await listGroupArchives(makeReq({ params: { name: encodeURIComponent('Ops Team') } }), archivesRes)
    assert.strictEqual(archivesRes.statusCode, 200, 'Expected group archives list success')
    assert((archivesRes.jsonBody?.archives || []).length >= 1, 'Expected at least one group archive')

    const archiveName = archivesRes.jsonBody.archives[0]?.filename
    assert(archiveName, 'Expected archive filename in archive metadata')
    const archiveRes = makeRes()
    await getGroupArchive(makeReq({
      params: { name: encodeURIComponent('Ops Team'), filename: archiveName },
    }), archiveRes)
    assert.strictEqual(archiveRes.statusCode, 200, 'Expected archived group messages fetch success')
    assert.strictEqual((archiveRes.jsonBody?.messages || []).length, 1, 'Expected archived group messages to include cleared message')
  })

  await test('community messages update message counts', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const sendCommunityMessage = getRouteHandler('post', '/communities/:name/messages')
    const getCounts = getRouteHandler('get', '/message-counts')

    await createCommunity(makeReq({
      body: {
        name: 'Leadership',
        description: 'Leadership community',
      },
    }), makeRes())

    const sendRes = makeRes()
    await sendCommunityMessage(makeReq({
      params: { name: encodeURIComponent('Leadership') },
      body: { content: 'Leadership kickoff', from: 'User' },
    }), sendRes)
    assert.strictEqual(sendRes.statusCode, 200, 'Expected community message send success')

    const countsRes = makeRes()
    await getCounts(makeReq(), countsRes)
    assert.strictEqual(countsRes.statusCode, 200, 'Expected message counts success')
    assert.strictEqual(countsRes.jsonBody?.counts?.['community:Leadership'], 1, 'Expected community count to reflect sent message')
  })

  await test('direct messages can be created and listed', async () => {
    const sendDirectMessage = getRouteHandler('post', '/direct-messages/:from/:to')
    const getDirectMessages = getRouteHandler('get', '/direct-messages/:from/:to')
    const listDirectConversations = getRouteHandler('get', '/direct-messages')

    const sendRes = makeRes()
    await sendDirectMessage(makeReq({
      params: { from: 'agent-a', to: 'agent-b' },
      body: { content: 'Please review the draft', callAgent: false },
    }), sendRes)
    assert.strictEqual(sendRes.statusCode, 200, 'Expected direct message send success')
    assert.strictEqual(sendRes.jsonBody?.ok, true, 'Expected ok direct message response')

    const threadRes = makeRes()
    await getDirectMessages(makeReq({ params: { from: 'agent-a', to: 'agent-b' } }), threadRes)
    assert.strictEqual(threadRes.statusCode, 200, 'Expected direct message thread fetch success')
    assert.strictEqual((threadRes.jsonBody?.messages || []).length, 1, 'Expected one direct message in thread')

    const listRes = makeRes()
    await listDirectConversations(makeReq(), listRes)
    assert.strictEqual(listRes.statusCode, 200, 'Expected direct conversation list success')
    assert((listRes.jsonBody?.conversations || []).some((conversation: any) => {
      const agents = conversation.agents || []
      return agents.includes('agent-a') && agents.includes('agent-b')
    }), 'Expected direct message conversation to be discoverable')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  console.error(err)
  process.exit(1)
})
