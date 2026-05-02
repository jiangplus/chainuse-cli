import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleWcSessions, handleWcPending, handleWcReject, handleWcDisconnect } from '../../src/handlers/wc.js'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('handleWcSessions', () => {
  it('returns empty list when no sessions exist', async () => {
    const result = await handleWcSessions()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data).toHaveLength(0)
  })
})

describe('handleWcPending', () => {
  it('returns empty list when no pending requests exist', async () => {
    const result = await handleWcPending()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data).toHaveLength(0)
  })
})

describe('handleWcPair — validation', () => {
  it('returns error for an invalid WC URI', async () => {
    const { handleWcPair } = await import('../../src/handlers/wc.js')
    const result = await handleWcPair({ uri: 'not-a-wc-uri' })
    expect(result.ok).toBe(false)
  })
})

describe('handleWcReject — validation', () => {
  it('returns error for an unknown pairing topic', async () => {
    const result = await handleWcReject({ pairingTopic: 'nonexistent-topic-abc123' })
    expect(result.ok).toBe(false)
  })
})

describe('handleWcDisconnect — validation', () => {
  it('returns error for an unknown session topic', async () => {
    const result = await handleWcDisconnect({ topic: 'nonexistent-session-abc123' })
    expect(result.ok).toBe(false)
  })
})
