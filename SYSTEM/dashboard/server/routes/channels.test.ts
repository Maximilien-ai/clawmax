/**
 * Channels routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/channels.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { EventEmitter } from 'events'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'
import { callAgent } from './channels'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE

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

function getRouteHandler(method: 'get' | 'post' | 'delete' | 'patch', routePath: string) {
  resetWorkspaceManagerForTests()
  delete require.cache[require.resolve('../lib/messages')]
  delete require.cache[require.resolve('../lib/workspace')]
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

// Async-aware: awaits fn() *before* restoring, since an async fn only reaches its own
// `await` points after this synchronous call returns a pending promise.
async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function writeFakeDroidCli(filePath: string, resultText: string) {
  const payload = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    num_turns: 1,
    result: resultText,
    session_id: 'fake-session',
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
  fs.writeFileSync(filePath, `#!/bin/sh\necho '${payload}'\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
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

function getRouteHandlerFromRouter(router: any, method: 'get' | 'post' | 'delete' | 'patch', routePath: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function run() {
  console.log(`\n${YELLOW}=== Channels Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-channels-routes-home-'))
  const workspacePath = path.join(tmpHome, 'workspace')
  ensureWorkspaceScaffold(workspacePath)
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath
  process.env.CLAWMAX_TEST_WORKSPACE = workspacePath
  resetWorkspaceManagerForTests()

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

  await test('community and group tag routes validate payloads and persist tags', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const createGroup = getRouteHandler('post', '/groups')
    const patchCommunityTags = getRouteHandler('patch', '/communities/:name/tags')
    const patchGroupTags = getRouteHandler('patch', '/groups/:name/tags')
    const listCommunities = getRouteHandler('get', '/communities')
    const listGroups = getRouteHandler('get', '/groups')

    await createCommunity(makeReq({
      body: { name: 'Design Guild', description: 'Design community' },
    }), makeRes())
    await createGroup(makeReq({
      body: { name: 'Design Systems', description: 'Design systems group', community: 'Design Guild' },
    }), makeRes())

    const invalidCommunityRes = makeRes()
    await patchCommunityTags(makeReq({
      params: { name: encodeURIComponent('Design Guild') },
      body: { tags: 'not-an-array' },
    }), invalidCommunityRes)
    assert.strictEqual(invalidCommunityRes.statusCode, 400, 'Expected community tag validation error')

    const communityRes = makeRes()
    await patchCommunityTags(makeReq({
      params: { name: encodeURIComponent('Design Guild') },
      body: { tags: ['design', 'ux'] },
    }), communityRes)
    assert.strictEqual(communityRes.statusCode, 200, 'Expected community tag update success')

    const groupRes = makeRes()
    await patchGroupTags(makeReq({
      params: { name: encodeURIComponent('Design Systems') },
      body: { tags: ['design-systems'] },
    }), groupRes)
    assert.strictEqual(groupRes.statusCode, 200, 'Expected group tag update success')

    const communitiesRes = makeRes()
    await listCommunities(makeReq(), communitiesRes)
    assert((communitiesRes.jsonBody?.communities || []).some((community: any) => community.name === 'Design Guild'), 'Expected community to remain listable after tag update')

    const groupsRes = makeRes()
    await listGroups(makeReq(), groupsRes)
    assert((groupsRes.jsonBody?.groups || []).some((group: any) => group.name === 'Design Systems'), 'Expected group to remain listable after tag update')

    const communitiesMd = fs.readFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), 'utf-8')
    assert(communitiesMd.includes('- **Tags:** design, ux'), 'Expected community tags to persist to COMMUNITIES.md')

    const groupsMd = fs.readFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), 'utf-8')
    assert(groupsMd.includes('- **Tags:** design-systems'), 'Expected group tags to persist to GROUPS.md')
  })

  await test('rename routes validate conflicts and update persisted names', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const createGroup = getRouteHandler('post', '/groups')
    const renameCommunity = getRouteHandler('patch', '/communities/:name/rename')
    const renameGroup = getRouteHandler('patch', '/groups/:name/rename')
    const listCommunities = getRouteHandler('get', '/communities')
    const listGroups = getRouteHandler('get', '/groups')

    await createCommunity(makeReq({
      body: { name: 'Research Ops', description: 'Research operations' },
    }), makeRes())
    await createCommunity(makeReq({
      body: { name: 'Already Taken', description: 'Conflict target' },
    }), makeRes())
    await createGroup(makeReq({
      body: { name: 'Interview Team', description: 'Interviewers', community: 'Research Ops' },
    }), makeRes())
    await createGroup(makeReq({
      body: { name: 'Existing Group', description: 'Conflict group' },
    }), makeRes())

    const communityConflictRes = makeRes()
    await renameCommunity(makeReq({
      params: { name: encodeURIComponent('Research Ops') },
      body: { newName: 'Already Taken' },
    }), communityConflictRes)
    assert.strictEqual(communityConflictRes.statusCode, 409, 'Expected community rename conflict')

    const communityRenameRes = makeRes()
    await renameCommunity(makeReq({
      params: { name: encodeURIComponent('Research Ops') },
      body: { newName: 'Research Operations' },
    }), communityRenameRes)
    assert.strictEqual(communityRenameRes.statusCode, 200, 'Expected community rename success')

    const groupConflictRes = makeRes()
    await renameGroup(makeReq({
      params: { name: encodeURIComponent('Interview Team') },
      body: { newName: 'Existing Group' },
    }), groupConflictRes)
    assert.strictEqual(groupConflictRes.statusCode, 409, 'Expected group rename conflict')

    const groupRenameRes = makeRes()
    await renameGroup(makeReq({
      params: { name: encodeURIComponent('Interview Team') },
      body: { newName: 'Interview Squad' },
    }), groupRenameRes)
    assert.strictEqual(groupRenameRes.statusCode, 200, 'Expected group rename success')

    const communitiesRes = makeRes()
    await listCommunities(makeReq(), communitiesRes)
    assert((communitiesRes.jsonBody?.communities || []).some((community: any) => community.name === 'Research Operations'), 'Expected renamed community in list')

    const groupsRes = makeRes()
    await listGroups(makeReq(), groupsRes)
    const renamedGroup = (groupsRes.jsonBody?.groups || []).find((group: any) => group.name === 'Interview Squad')
    assert(renamedGroup, 'Expected renamed group in list')
    assert.strictEqual(renamedGroup.community, 'Research Operations', 'Expected group community reference to follow renamed community')
  })

  await test('group member updates auto-add members to the parent community', async () => {
    const createCommunity = getRouteHandler('post', '/communities')
    const createGroup = getRouteHandler('post', '/groups')
    const patchCommunityMembers = getRouteHandler('patch', '/communities/:name/members')
    const patchGroupMembers = getRouteHandler('patch', '/groups/:name/members')
    const listCommunities = getRouteHandler('get', '/communities')
    const listGroups = getRouteHandler('get', '/groups')

    await createCommunity(makeReq({
      body: { name: 'Engineering', description: 'Engineering community' },
    }), makeRes())
    await createGroup(makeReq({
      body: { name: 'Backend', description: 'Backend group', community: 'Engineering' },
    }), makeRes())

    const invalidMembersRes = makeRes()
    await patchCommunityMembers(makeReq({
      params: { name: encodeURIComponent('Engineering') },
      body: { members: 'not-an-array' },
    }), invalidMembersRes)
    assert.strictEqual(invalidMembersRes.statusCode, 400, 'Expected member validation error')

    const communityMembersRes = makeRes()
    await patchCommunityMembers(makeReq({
      params: { name: encodeURIComponent('Engineering') },
      body: { members: ['lead1'] },
    }), communityMembersRes)
    assert.strictEqual(communityMembersRes.statusCode, 200, 'Expected community members update success')

    const groupMembersRes = makeRes()
    await patchGroupMembers(makeReq({
      params: { name: encodeURIComponent('Backend') },
      body: { members: ['lead1', 'eng2'] },
    }), groupMembersRes)
    assert.strictEqual(groupMembersRes.statusCode, 200, 'Expected group members update success')

    const groupsRes = makeRes()
    await listGroups(makeReq(), groupsRes)
    const backendGroup = (groupsRes.jsonBody?.groups || []).find((group: any) => group.name === 'Backend')
    assert.deepStrictEqual(backendGroup?.members || [], ['lead1', 'eng2'], 'Expected group members to persist')

    const communitiesRes = makeRes()
    await listCommunities(makeReq(), communitiesRes)
    const engineeringCommunity = (communitiesRes.jsonBody?.communities || []).find((community: any) => community.name === 'Engineering')
    assert.deepStrictEqual(engineeringCommunity?.members || [], ['lead1', 'eng2'], 'Expected parent community to absorb group members')
  })

  await test('rename and patch routes return expected errors for missing channels and invalid payloads', async () => {
    const renameCommunity = getRouteHandler('patch', '/communities/:name/rename')
    const renameGroup = getRouteHandler('patch', '/groups/:name/rename')
    const patchCommunityTags = getRouteHandler('patch', '/communities/:name/tags')
    const patchGroupMembers = getRouteHandler('patch', '/groups/:name/members')

    let res = makeRes()
    await renameCommunity(makeReq({
      params: { name: encodeURIComponent('Missing Community') },
      body: { newName: '' },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing community newName to return HTTP 400')

    res = makeRes()
    await renameCommunity(makeReq({
      params: { name: encodeURIComponent('Missing Community') },
      body: { newName: 'Renamed Community' },
    }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing community rename to return HTTP 404')

    res = makeRes()
    await renameGroup(makeReq({
      params: { name: encodeURIComponent('Missing Group') },
      body: { newName: 'Renamed Group' },
    }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing group rename to return HTTP 404')

    res = makeRes()
    await patchCommunityTags(makeReq({
      params: { name: encodeURIComponent('Missing Community') },
      body: { tags: [] },
    }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing community tag update to return HTTP 404')

    res = makeRes()
    await patchGroupMembers(makeReq({
      params: { name: encodeURIComponent('Missing Group') },
      body: { members: [] },
    }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing group member update to return HTTP 404')
  })

  await test('group and community message routes validate missing content and expose empty reads', async () => {
    const sendCommunityMessage = getRouteHandler('post', '/communities/:name/messages')
    const sendGroupMessage = getRouteHandler('post', '/groups/:name/messages')
    const getCommunityMessages = getRouteHandler('get', '/communities/:name/messages')
    const getGroupMessages = getRouteHandler('get', '/groups/:name/messages')

    let res = makeRes()
    await sendCommunityMessage(makeReq({
      params: { name: encodeURIComponent('No Community') },
      body: {},
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing community content to return HTTP 400')

    res = makeRes()
    await sendGroupMessage(makeReq({
      params: { name: encodeURIComponent('No Group') },
      body: {},
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing group content to return HTTP 400')

    res = makeRes()
    await getCommunityMessages(makeReq({ params: { name: encodeURIComponent('No Community') } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected empty community read success')
    assert.deepStrictEqual(res.jsonBody?.messages || [], [], 'Expected empty community messages')

    res = makeRes()
    await getGroupMessages(makeReq({ params: { name: encodeURIComponent('No Group') } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected empty group read success')
    assert.deepStrictEqual(res.jsonBody?.messages || [], [], 'Expected empty group messages')
  })

  await test('group mentions surface runtime fs errors instead of generic no-response placeholders', async () => {
    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn
    const originalFetch = global.fetch

    const openclawDir = path.join(tmpHome, '.openclaw')
    const agentWorkspace = path.join(workspacePath, 'AGENTS', 'double-agent')
    const agentDir = path.join(openclawDir, 'agents', 'double-agent', 'agent')
    fs.mkdirSync(agentWorkspace, { recursive: true })
    fs.mkdirSync(path.dirname(agentDir), { recursive: true })
    fs.writeFileSync(path.join(agentWorkspace, 'IDENTITY.md'), '# Identity\n\n- **Model:** openai-compatible/qwen/qwen3.6-27b\n', 'utf-8')
    fs.writeFileSync(path.join(openclawDir, 'openclaw.json'), JSON.stringify({
      agents: {
        list: [
          { id: 'double-agent', workspace: agentWorkspace, agentDir, model: 'openai-compatible/qwen/qwen3.6-27b' },
        ],
      },
    }, null, 2))

    const spawnCalls: string[][] = []
    global.fetch = (async (input: any, init?: any) => {
      const url = String(input)
      const method = String(init?.method || 'GET').toUpperCase()
      if (url.endsWith('/api/v1/models') && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ models: [{ key: 'qwen/qwen3.6-27b', loaded_instances: [] }] }),
        } as any
      }
      if (url.endsWith('/api/v1/models/load') && method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: 'loaded' }),
        } as any
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as any
    }) as any

    childProcess.spawn = (_cmd: string, args: string[]) => {
      spawnCalls.push(args)
      const proc = new EventEmitter() as any
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      process.nextTick(() => {
        proc.stderr.emit('data', Buffer.from('FsSafeError: directory changed during operation\n'))
        proc.emit('close', 0)
      })
      return proc
    }

    try {
      resetWorkspaceManagerForTests()
      delete require.cache[require.resolve('../lib/messages')]
      delete require.cache[require.resolve('../lib/workspace')]
      delete require.cache[require.resolve('../lib/gateway-rpc')]
      delete require.cache[require.resolve('./channels')]
      const gatewayRpc = require('../lib/gateway-rpc')
      gatewayRpc.waitForGatewayResponsive = async () => ({ running: false })
      const router = require('./channels').default
      const sendGroupMessage = getRouteHandlerFromRouter(router, 'post', '/groups/:name/messages')
      const getGroupMessages = getRouteHandlerFromRouter(router, 'get', '/groups/:name/messages')

      const sendRes = makeRes()
      await sendGroupMessage(makeReq({
        params: { name: encodeURIComponent('Temp Group') },
        body: {
          content: 'who are you? status?',
          from: 'User',
          mentions: ['double-agent'],
          byok: {
            openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
            openaiCompatibleApiKey: 'lmstudio-secret',
          },
        },
      }), sendRes)
      assert.strictEqual(sendRes.statusCode, 200, 'Expected group mention send success')

      let agentReply: any
      for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const listRes = makeRes()
        await getGroupMessages(makeReq({ params: { name: encodeURIComponent('Temp Group') } }), listRes)
        agentReply = (listRes.jsonBody?.messages || []).find((message: any) => message.from === 'double-agent')
        if (agentReply) break
      }
      assert(agentReply, 'Expected agent reply message to be recorded')
      assert(
        /runtime changed files while this chat was running/i.test(agentReply.content),
        `Expected surfaced runtime fs error, got: ${agentReply.content || 'missing'}`
      )
      assert(
        !/Agent did not return a response/i.test(agentReply.content),
        'Expected runtime fs error to replace generic no-response placeholder'
      )
      const agentSpawn = spawnCalls.find((args) => args.includes('--agent') && args.includes('double-agent'))
      assert(agentSpawn, 'Expected group chat to spawn OpenClaw for mentioned agent')
      const modelArgIndex = agentSpawn!.indexOf('--model')
      assert(modelArgIndex >= 0, `Expected group chat to pass --model, got: ${agentSpawn!.join(' ')}`)
      assert.strictEqual(agentSpawn![modelArgIndex + 1], 'lmstudio/qwen/qwen3.6-27b', 'Expected openai-compatible model to be passed as lmstudio execution model')
    } finally {
      childProcess.spawn = originalSpawn
      global.fetch = originalFetch
    }
  })

  await test('archive delete routes and channel workflow routes return consistent payloads', async () => {
    const deleteCommunityArchive = getRouteHandler('delete', '/communities/:name/archives/:filename')
    const deleteGroupArchive = getRouteHandler('delete', '/groups/:name/archives/:filename')
    const communityWorkflows = getRouteHandler('get', '/communities/:name/workflows')
    const groupWorkflows = getRouteHandler('get', '/groups/:name/workflows')

    let res = makeRes()
    await deleteCommunityArchive(makeReq({
      params: { name: encodeURIComponent('No Community'), filename: 'missing.json' },
    }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected community archive delete success')
    assert.strictEqual(typeof res.jsonBody?.ok, 'boolean', 'Expected boolean community archive delete result')

    res = makeRes()
    await deleteGroupArchive(makeReq({
      params: { name: encodeURIComponent('No Group'), filename: 'missing.json' },
    }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected group archive delete success')
    assert.strictEqual(typeof res.jsonBody?.ok, 'boolean', 'Expected boolean group archive delete result')

    res = makeRes()
    await communityWorkflows(makeReq({ params: { name: encodeURIComponent('No Community') } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected empty community workflow list success')
    assert.deepStrictEqual(res.jsonBody?.workflows || [], [], 'Expected no workflows for unmatched community')

    res = makeRes()
    await groupWorkflows(makeReq({ params: { name: encodeURIComponent('No Group') } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected empty group workflow list success')
    assert.deepStrictEqual(res.jsonBody?.workflows || [], [], 'Expected no workflows for unmatched group')
  })

  await test('direct messages reject missing content and still expose an empty conversation list', async () => {
    const sendDirectMessage = getRouteHandler('post', '/direct-messages/:from/:to')
    const listDirectConversations = getRouteHandler('get', '/direct-messages')

    const sendRes = makeRes()
    await sendDirectMessage(makeReq({
      params: { from: 'agent-x', to: 'agent-y' },
      body: {},
    }), sendRes)
    assert.strictEqual(sendRes.statusCode, 400, 'Expected missing direct message content to return HTTP 400')
    assert.strictEqual(sendRes.jsonBody?.error, 'content is required', 'Expected direct message validation guidance')

    const listRes = makeRes()
    await listDirectConversations(makeReq(), listRes)
    assert.strictEqual(listRes.statusCode, 200, 'Expected direct conversation list success')
    assert(Array.isArray(listRes.jsonBody?.conversations || []), 'Expected conversation list array')
  })

  await test('callAgent runs a droid-pinned agent through the runtime adapter instead of spawning openclaw', async () => {
    const agentDir = path.join(workspacePath, 'AGENTS', 'droid-runner')
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), [
      '# Identity',
      '',
      '- **Name:** Droid Runner',
      '- **Runtime:** droid',
    ].join('\n'), 'utf-8')
    // Droid must be enabled for the workspace for the per-agent pin to be honored.
    fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['droid'] }), 'utf-8')

    const droidCli = path.join(workspacePath, 'fake-droid')
    writeFakeDroidCli(droidCli, 'hello from droid')

    await withEnv({ DROID_BIN: droidCli }, async () => {
      const response = await callAgent('droid-runner', 'hi', 'test-session:droid-runner')
      assert.strictEqual(response, 'hello from droid', 'Expected callAgent to return the droid CLI result text')
    })
  })

  await test('callAgent surfaces the runtime-specific missing-CLI error for a droid-pinned agent', async () => {
    const agentDir = path.join(workspacePath, 'AGENTS', 'droid-runner-missing')
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), [
      '# Identity',
      '',
      '- **Name:** Droid Runner Missing',
      '- **Runtime:** droid',
    ].join('\n'), 'utf-8')
    fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['droid'] }), 'utf-8')

    await withEnv({ DROID_BIN: undefined, PATH: path.join(workspacePath, 'empty-bin') }, async () => {
      await assert.rejects(
        () => callAgent('droid-runner-missing', 'hi', 'test-session:droid-runner-missing'),
        /Factory Droid CLI is not available/,
        'Expected the droid missing-CLI error to surface'
      )
    })
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  resetWorkspaceManagerForTests()

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
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
