#!/usr/bin/env node

import http from 'node:http'

const port = Number.parseInt(process.argv[2] || process.env.PORT || '11434', 10)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid mock Ollama port: ${process.argv[2] || process.env.PORT}`)
}

const model = 'qwen2.5:latest'
const reply = 'RC image gateway chat completed through Ollama.'

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(value))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/tags') {
      return json(res, 200, {
        models: [{ name: model, model, modified_at: '2026-09-09T00:00:00Z', size: 1, digest: 'clawmax-rc-smoke' }],
      })
    }
    if (req.method === 'GET' && req.url === '/api/version') return json(res, 200, { version: '0.12.0' })
    if (req.method === 'GET' && req.url === '/v1/models') {
      return json(res, 200, { object: 'list', data: [{ id: model, object: 'model', owned_by: 'ollama' }] })
    }
    if (req.method === 'POST' && req.url === '/api/show') {
      return json(res, 200, { details: { family: 'qwen2', parameter_size: '1B', quantization_level: 'Q4' }, capabilities: ['completion', 'tools'] })
    }
    if (req.method === 'POST' && (req.url === '/api/chat' || req.url === '/api/generate')) {
      const body = await readBody(req)
      const payload = req.url === '/api/chat'
        ? { model, created_at: new Date().toISOString(), message: { role: 'assistant', content: reply }, done: true, done_reason: 'stop' }
        : { model, created_at: new Date().toISOString(), response: reply, done: true, done_reason: 'stop' }
      if (body.stream === false) return json(res, 200, payload)
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      return res.end(`${JSON.stringify(payload)}\n`)
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const body = await readBody(req)
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write(`data: ${JSON.stringify({ id: 'chatcmpl-clawmax', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content: reply }, finish_reason: null }] })}\n\n`)
        return res.end(`data: ${JSON.stringify({ id: 'chatcmpl-clawmax', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
      }
      return json(res, 200, { id: 'chatcmpl-clawmax', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] })
    }
    json(res, 404, { error: `Unsupported mock Ollama route: ${req.method} ${req.url}` })
  } catch (error) {
    json(res, 400, { error: String(error?.message || error) })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`mock Ollama listening on ${port}`)
})

