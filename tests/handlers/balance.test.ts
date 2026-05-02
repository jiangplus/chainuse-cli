import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleBalance } from '../../src/handlers/balance.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, USDC_MAINNET, LIVE, resetDbs } from '../helpers.js'

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

describe('handleBalance — validation', () => {
  it('returns ALIAS_NOT_FOUND for unknown alias', async () => {
    const result = await handleBalance({ addressOrAlias: 'no-such-alias' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })

  it('returns error for invalid ERC-20 token address', async () => {
    const result = await handleBalance({ addressOrAlias: VITALIK, token: 'not-an-address' })
    expect(result.ok).toBe(false)
  })
})

describe('handleBalance — live network', () => {
  it.skipIf(!LIVE)('fetches ETH balance for vitalik.eth address', async () => {
    process.env.ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY ?? ''
    const result = await handleBalance({ addressOrAlias: VITALIK })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.symbol).toBe('ETH')
    expect(parseFloat(result.data.balance)).toBeGreaterThan(0)
    expect(result.data.chain).toBe('eip155:1')
  })

  it.skipIf(!LIVE)('fetches USDC balance for an address', async () => {
    const result = await handleBalance({ addressOrAlias: VITALIK, token: USDC_MAINNET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.symbol).toBe('USDC')
    expect(result.data.decimals).toBe(6)
  })
})
