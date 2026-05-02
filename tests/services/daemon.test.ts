import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { request } from 'node:http'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'

let tmpDir: string

let origNoProxy: string | undefined

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
  // Bypass proxy for localhost (Bun/Node respect NO_PROXY)
  origNoProxy = process.env.NO_PROXY
  process.env.NO_PROXY = '127.0.0.1'
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
  if (origNoProxy !== undefined) {
    process.env.NO_PROXY = origNoProxy
  } else {
    delete process.env.NO_PROXY
  }
})

// Use node:http.request directly to bypass proxy env vars (http_proxy etc.)
function httpGet(host: string, port: number, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (c: Buffer) => { body += c.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(body) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function httpPost(host: string, port: number, path: string, payload: unknown): Promise<unknown> {
  const bodyStr = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const req = request({
      host, port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
    }, (res) => {
      let body = ''
      res.on('data', (c: Buffer) => { body += c.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch { resolve(body) }
      })
    })
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

describe('JSON-RPC daemon', () => {
  it('starts, serves requests, and shuts down cleanly', async () => {
    const { startDaemon } = await import('../../src/services/daemon.js')

    // Pick a random high port to avoid collision
    const port = 30000 + Math.floor(Math.random() * 5000)

    // Capture stdout startup line
    const written: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return origWrite(chunk, ...(args as Parameters<typeof origWrite>).slice(1))
    }) as typeof process.stdout.write

    const daemonPromise = startDaemon({ port, host: '127.0.0.1' })

    // Wait for the server to start (stdout line is written at listen)
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (written.some((w) => w.includes('"ok":true'))) {
          clearInterval(check)
          resolve()
        }
      }, 20)
    })

    process.stdout.write = origWrite

    // Parse startup JSON
    const startupLine = written.find((w) => w.includes('"ok":true')) ?? '{}'
    const startup = JSON.parse(startupLine) as { ok: boolean; data: { port: number; methods: number } }
    expect(startup.ok).toBe(true)
    expect(startup.data.port).toBe(port)
    expect(startup.data.methods).toBeGreaterThan(50)

    // Test GET /health
    const health = await httpGet('127.0.0.1', port, '/health') as { ok: boolean; methods: string[] }
    expect(health.ok).toBe(true)
    expect(Array.isArray(health.methods)).toBe(true)
    expect(health.methods.length).toBeGreaterThan(50)

    // Test valid JSON-RPC call (method not found error)
    const rpcRes = await httpPost('127.0.0.1', port, '/', { jsonrpc: '2.0', id: 1, method: 'nonexistent' }) as { error: { code: number }; id: number }
    expect(rpcRes.error.code).toBe(-32601)
    expect(rpcRes.id).toBe(1)

    // Test parse error via raw string
    const parseRes = await new Promise<unknown>((resolve, reject) => {
      const bodyStr = 'not json'
      const req = request({
        host: '127.0.0.1', port, path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': bodyStr.length },
      }, (res) => {
        let body = ''
        res.on('data', (c: Buffer) => { body += c.toString() })
        res.on('end', () => { try { resolve(JSON.parse(body)) } catch { resolve(body) } })
      })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    }) as { error: { code: number } }
    expect(parseRes.error.code).toBe(-32700)

    // Shut down
    process.emit('SIGINT')
    await daemonPromise
  })
})
