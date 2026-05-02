import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleSwapQuote } from '../../src/handlers/swap.js'
import { createTempHome, removeTempHome, setupTempHome, LIVE, resetDbs } from '../helpers.js'
import { handleKeysGenerate } from '../../src/handlers/keys.js'

let tmpDir: string

beforeEach(async () => {
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

describe('handleSwapQuote — validation', () => {
  it('returns ALIAS_NOT_FOUND for unknown account', async () => {
    const result = await handleSwapQuote({
      from: 'USDC',
      to: 'WETH',
      amount: '100',
      ownerAlias: 'ghost',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleSwapQuote — live (Base)', () => {
  it.skipIf(!LIVE)('quotes USDC → WETH on Base', async () => {
    // Create a temp account as recipient
    await handleKeysGenerate({ chain: 'evm', alias: 'swap-test' })
    const result = await handleSwapQuote({
      from: 'USDC',
      to: 'WETH',
      amount: '100',
      ownerAlias: 'swap-test',
      chain: 'base',
      slippageBps: 50,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.amountIn).toBe('100')
    expect(parseFloat(result.data.amountOut)).toBeGreaterThan(0)
    expect(result.data.fee).toBeGreaterThan(0)
    expect(result.data.calldata).toMatch(/^0x/)
    expect(result.data.to).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})
