import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleSend } from '../../src/handlers/send.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, resetDbs } from '../helpers.js'

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

describe('handleSend — validation', () => {
  it('returns error when no account provided', async () => {
    const result = await handleSend({ to: VITALIK, amount: '0.001', asset: 'native' })
    expect(result.ok).toBe(false)
  })

  it('returns ALIAS_NOT_FOUND for unknown account alias', async () => {
    const result = await handleSend({ to: VITALIK, amount: '0.001', asset: 'native', account: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })

  it('returns error for invalid destination address', async () => {
    const result = await handleSend({ to: 'not-an-address', amount: '0.001', asset: 'native', account: 'ghost' })
    expect(result.ok).toBe(false)
  })
})
