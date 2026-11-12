import { json, type RequestHandler } from 'express'

// Only chat sends need room for several long replies. Parse those after auth.
const chatSendPath = /^\/api\/agents\/[^/]+\/chat\/?$/
const defaultParser = json()
export const parseDefaultJsonBody: RequestHandler = (req, res, next) =>
  chatSendPath.test(req.path) ? next() : defaultParser(req, res, next)

export const parseChatJsonBody = json({ limit: '16mb' })
