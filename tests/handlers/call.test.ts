import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleCall, handleStorageGet } from '../../src/handlers/call.js'
import { createTempHome, removeTempHome, setupTempHome, USDC_MAINNET, LIVE, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
})

describe('handleCall — validation', () => {
  it('returns error for invalid contract address', async () => {
    const result = await handleCall({ contract: 'not-an-address', method: 'name()' })
    expect(result.ok).toBe(false)
  })

  it('returns error for malformed ABI fragment', async () => {
    const result = await handleCall({ contract: USDC_MAINNET, method: 'not a valid abi' })
    expect(result.ok).toBe(false)
  })
})

describe('handleCall — live', () => {
  it.skipIf(!LIVE)('calls USDC.name() and gets "USD Coin"', async () => {
    const result = await handleCall({ contract: USDC_MAINNET, method: 'name() returns (string)' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(String(result.data.result)).toContain('USD')
  })

  it.skipIf(!LIVE)('calls USDC.decimals() and gets 6', async () => {
    const result = await handleCall({ contract: USDC_MAINNET, method: 'decimals() returns (uint8)' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Number(result.data.result)).toBe(6)
  })
})

describe('handleStorageGet — validation', () => {
  it('returns error for invalid contract address', async () => {
    const result = await handleStorageGet({ contract: 'bad', slot: '0x0' })
    expect(result.ok).toBe(false)
  })
})

describe('handleStorageGet — live', () => {
  it.skipIf(!LIVE)('reads storage slot 0 of USDC contract', async () => {
    // Slot 0 of a proxy contract typically holds the implementation address
    const result = await handleStorageGet({ contract: USDC_MAINNET, slot: '0x0' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.value).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
