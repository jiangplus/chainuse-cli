import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  handleErc20Info,
  handleErc20Balance,
  handleErc20Allowance,
  handleErc721Info,
  handleErc721Owner,
  handleErc721TokenURI,
  handleErc1155Balance,
  handleErc1155URI,
} from '../../src/handlers/tokens.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, USDC_MAINNET, ZERO_ADDRESS, LIVE, resetDbs } from '../helpers.js'

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

// ─── ERC-20 ───────────────────────────────────────────────────────────────────

describe('handleErc20Info — validation', () => {
  it('returns error for invalid token address', async () => {
    const result = await handleErc20Info({ token: 'not-an-address' })
    expect(result.ok).toBe(false)
  })
})

describe('handleErc20Info — live', () => {
  it.skipIf(!LIVE)('reads USDC metadata', async () => {
    const result = await handleErc20Info({ token: USDC_MAINNET })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.symbol).toBe('USDC')
    expect(result.data.decimals).toBe(6)
    expect(result.data.name).toContain('USD Coin')
  })
})

describe('handleErc20Balance — validation', () => {
  it('returns error for invalid token address', async () => {
    const result = await handleErc20Balance({ token: 'bad', address: VITALIK })
    expect(result.ok).toBe(false)
  })

  it('returns error for invalid holder address', async () => {
    const result = await handleErc20Balance({ token: USDC_MAINNET, address: 'not-an-address' })
    expect(result.ok).toBe(false)
  })
})

describe('handleErc20Balance — live', () => {
  it.skipIf(!LIVE)('reads a real ERC-20 balance', async () => {
    const result = await handleErc20Balance({ token: USDC_MAINNET, address: VITALIK })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.symbol).toBe('USDC')
    expect(result.data.decimals).toBe(6)
    expect(parseFloat(result.data.balance)).toBeGreaterThanOrEqual(0)
  })
})

describe('handleErc20Allowance — validation', () => {
  it('returns error for invalid addresses', async () => {
    const result = await handleErc20Allowance({ token: USDC_MAINNET, owner: 'bad', spender: ZERO_ADDRESS })
    expect(result.ok).toBe(false)
  })
})

describe('handleErc20Allowance — live', () => {
  it.skipIf(!LIVE)('reads allowance (expect 0 for random pair)', async () => {
    const result = await handleErc20Allowance({ token: USDC_MAINNET, owner: VITALIK, spender: ZERO_ADDRESS })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.allowance).toBeDefined()
  })
})

// ─── ERC-721 ──────────────────────────────────────────────────────────────────

// BAYC contract on mainnet
const BAYC = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'
const BAYC_TOKEN_ID = '1'

describe('handleErc721Info — validation', () => {
  it('returns error for invalid contract address', async () => {
    const result = await handleErc721Info({ contract: 'not-an-address' })
    expect(result.ok).toBe(false)
  })
})

describe('handleErc721Owner — live', () => {
  it.skipIf(!LIVE)('reads owner of BAYC #1', async () => {
    const result = await handleErc721Owner({ contract: BAYC, tokenId: BAYC_TOKEN_ID })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.owner).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

describe('handleErc721TokenURI — live', () => {
  it.skipIf(!LIVE)('reads tokenURI for BAYC #1', async () => {
    const result = await handleErc721TokenURI({ contract: BAYC, tokenId: BAYC_TOKEN_ID })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.tokenURI).toBeTruthy()
  })
})

// ─── ERC-1155 ─────────────────────────────────────────────────────────────────

// OpenSea Shared Storefront (a well-known ERC-1155 on mainnet)
const ERC1155_CONTRACT = '0x495f947276749Ce646f68AC8c248420045cb7b5e'
const ERC1155_TOKEN_ID = '1'

describe('handleErc1155Balance — validation', () => {
  it('returns error for invalid contract address', async () => {
    const result = await handleErc1155Balance({ contract: 'bad', account: VITALIK, tokenId: '1' })
    expect(result.ok).toBe(false)
  })
})

describe('handleErc1155URI — live', () => {
  it.skipIf(!LIVE)('reads URI for a known ERC-1155', async () => {
    const result = await handleErc1155URI({ contract: ERC1155_CONTRACT, tokenId: ERC1155_TOKEN_ID })
    // May or may not have a URI; just verify it doesn't crash
    if (result.ok) {
      expect(result.data).toBeDefined()
    }
  })
})
