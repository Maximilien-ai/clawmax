import fs from 'fs'
import path from 'path'
import { templateStoragePath } from './template-storage-path'
import { writeAtomicJson } from './instance-template-catalog'
import { sha256 } from './portable-template'

export interface GroupReceipt {
  digest: string; requestId: string; sessionId: string; createdAt: string
  events?: Array<Record<string, unknown>>
  messages?: Array<Record<string, unknown>>
}

/** Actor/revision/Group-scoped private local history; never legacy transcripts. */
export class CliGroupReceipts {
  private directory: string
  constructor(root: string, actorId: string, revisionId: string, groupId: string) {
    this.directory = templateStoragePath(root, `.clawmax/cli-groups/${sha256(JSON.stringify([actorId, revisionId, groupId]))}`)
  }
  private file(key: string) { return path.join(this.directory, `${sha256(key)}.json`) }
  private read(file: string): GroupReceipt | null {
    let fd: number | undefined
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
      const stat = fs.fstatSync(fd)
      if (!stat.isFile() || stat.size > 3 * 1024 * 1024) throw new Error('Invalid Group receipt')
      const value = JSON.parse(fs.readFileSync(fd, 'utf8'))
      if (!value || !/^[a-f0-9]{64}$/.test(value.digest) || typeof value.requestId !== 'string'
        || typeof value.sessionId !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
        || (value.events !== undefined && (!Array.isArray(value.events) || !Array.isArray(value.messages)))) throw new Error('Invalid Group receipt')
      return value
    } catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
    finally { if (fd !== undefined) fs.closeSync(fd) }
  }
  get(key: string) { return this.read(this.file(key)) }
  claim(key: string, receipt: GroupReceipt) {
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    if (fs.readdirSync(this.directory).length >= 128) throw new Error('Group history limit reached')
    const fd = fs.openSync(this.file(key), 'wx', 0o600)
    try { fs.writeFileSync(fd, JSON.stringify(receipt)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    const parent = fs.openSync(this.directory, 'r')
    try { fs.fsyncSync(parent) } finally { fs.closeSync(parent) }
  }
  complete(key: string, receipt: GroupReceipt) {
    if (Buffer.byteLength(JSON.stringify(receipt)) > 3 * 1024 * 1024) throw new Error('Group history exceeds limit')
    writeAtomicJson(this.file(key), receipt)
  }
  history() {
    let files: string[]
    try { files = fs.readdirSync(this.directory) } catch (error: any) { if (error.code === 'ENOENT') return []; throw error }
    if (files.length > 128) throw new Error('Group history exceeds limit')
    const messages: Array<Record<string, unknown>> = []
    for (const name of files.sort()) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new Error('Invalid Group history')
      const receipt = this.read(path.join(this.directory, name))
      if (receipt?.messages) messages.push(...receipt.messages)
      if (Buffer.byteLength(JSON.stringify(messages)) > 3 * 1024 * 1024) throw new Error('Group history exceeds limit')
    }
    return messages.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))
      || String(a.sessionId).localeCompare(String(b.sessionId)) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
  }
}
