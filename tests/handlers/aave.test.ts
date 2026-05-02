import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleAaveAccount, handleAaveReserve } from '../../src/handlers/aave.js'
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

describe('handleAaveAccount — validation', () => {
  it('returns ALIAS_NOT_FOUND for unknown account', async () => {
    const result = await handleAaveAccount({ ownerAlias: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleAaveReserve — validation', () => {
  it('returns ALIAS_NOT_FOUND for unknown account', async () => {
    const result = await handleAaveReserve({ asset: 'USDC', ownerAlias: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleAaveAccount — live', () => {
  it.skipIf(!LIVE)('returns account data for a fresh wallet (no positions)', async () => {
    await handleKeysGenerate({ chain: 'evm', alias: 'aave-test' })
    const result = await handleAaveAccount({ ownerAlias: 'aave-test' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.totalCollateralUsd).toBe('0.00')
    expect(result.data.totalDebtUsd).toBe('0.00')
    // No positions → health factor is ∞
    expect(result.data.healthFactor).toBe('∞')
  })
})

describe('handleAaveReserve — live', () => {
  it.skipIf(!LIVE)('reads USDC reserve data and supply APY', async () => {
    await handleKeysGenerate({ chain: 'evm', alias: 'aave-reserve-test' })
    const result = await handleAaveReserve({ asset: 'USDC', ownerAlias: 'aave-reserve-test' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.asset).toBe('USDC')
    // Supply APY should be a non-negative percentage
    const apy = parseFloat(result.data.liquidityRate)
    expect(apy).toBeGreaterThanOrEqual(0)
    expect(apy).toBeLessThan(100)
  })
})
