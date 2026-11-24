import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, appType: 'custom' })
const originalFetch = globalThis.fetch
try {
  const { buildClientFallbackRecommendation } = await server.ssrLoadModule('/client/src/pages/Builder.tsx')
  const inventory = {
    '/api/agents': { agents: [{ id: 'analyst', name: 'Market analyst', tags: ['research'] }] },
    '/api/skills': { skills: [] },
    '/api/templates': { agents: [], organizations: [{ name: 'Market research team', slug: 'market-team', tags: ['research'] }] },
    '/api/workflows': { workflows: [{ id: 'brief', name: 'Market research brief' }] },
  }
  globalThis.fetch = async url => Response.json(inventory[url])
  for (const prompt of ['Reuse my existing market analyst agent', 'Use the market research team template', 'Create a market research workflow']) {
    const result = await buildClientFallbackRecommendation(prompt)
    assert.match(result.summary, /generated locally/)
    assert.ok(result.recommendedPath.title)
    assert.equal(result.matchedAssets.workflows[0].id, 'brief')
  }
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
