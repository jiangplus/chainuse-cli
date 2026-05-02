import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleTxPrepare, handleTxStatus } from '../../src/handlers/tx.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, ZERO_ADDRESS, LIVE, resetDbs } from '../helpers.js'

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

describe('handleTxPrepare — validation', () => {
  it('returns INVALID_ADDRESS for a bad destination', async () => {
    const result = await handleTxPrepare({ to: 'not-an-address', value: '0' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('INVALID_ADDRESS')
  })

  it('returns error when no account resolved', async () => {
    const result = await handleTxPrepare({ to: VITALIK, value: '0', account: 'ghost' })
    expect(result.ok).toBe(false)
  })
})

describe('handleTxStatus — validation', () => {
  it('returns error for a malformed tx hash', async () => {
    const result = await handleTxStatus({ hash: 'not-a-hash' })
    expect(result.ok).toBe(false)
  })

  it.skipIf(!LIVE)('returns pending/confirmed for a real tx hash on mainnet', async () => {
    // A known historical mainnet tx (ETH genesis coinbase)
    const hash = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060'
    const result = await handleTxStatus({ hash })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(['confirmed', 'pending', 'unknown']).toContain(result.data.status)
  })
})
