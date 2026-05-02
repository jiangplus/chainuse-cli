import { describe, it, expect } from 'bun:test'
import { resolveTokenAddress, listKnownTokens } from '../../src/registries/tokens.js'

const MAINNET = 1
const BASE = 8453
const ARBITRUM = 42161

describe('resolveTokenAddress', () => {
  it('resolves USDC on mainnet (case-insensitive)', () => {
    const addr = resolveTokenAddress('USDC', MAINNET)
    expect(addr).toBeTruthy()
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })

  it('resolves usdc lowercase', () => {
    expect(resolveTokenAddress('usdc', MAINNET)).toBe(resolveTokenAddress('USDC', MAINNET))
  })

  it('resolves WETH on mainnet', () => {
    const addr = resolveTokenAddress('WETH', MAINNET)
    expect(addr).toBeTruthy()
  })

  it('resolves USDC on Base', () => {
    const addr = resolveTokenAddress('USDC', BASE)
    expect(addr).toBeTruthy()
    // Base USDC is a different address from mainnet USDC
    expect(addr).not.toBe(resolveTokenAddress('USDC', MAINNET))
  })

  it('resolves USDC on Arbitrum', () => {
    expect(resolveTokenAddress('USDC', ARBITRUM)).toBeTruthy()
  })

  it('returns null for unknown symbol', () => {
    expect(resolveTokenAddress('FAKECOIN', MAINNET)).toBeNull()
  })

  it('returns null for unknown chain', () => {
    expect(resolveTokenAddress('USDC', 99999)).toBeNull()
  })

  it('returns null for a raw 0x address (registry is symbol-only)', () => {
    // resolveTokenAddress does symbol lookup only; callers use the address directly
    const addr = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    expect(resolveTokenAddress(addr, MAINNET)).toBeNull()
  })
})

describe('listKnownTokens', () => {
  it('returns a non-empty list for mainnet', () => {
    const tokens = listKnownTokens(MAINNET)
    expect(tokens.length).toBeGreaterThan(5)
    for (const t of tokens) {
      expect(t.symbol).toBeTruthy()
      expect(t.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    }
  })

  it('includes USDC and WETH on mainnet', () => {
    const tokens = listKnownTokens(MAINNET)
    const symbols = tokens.map((t) => t.symbol)
    expect(symbols).toContain('USDC')
    expect(symbols).toContain('WETH')
  })

  it('returns empty list for unknown chain', () => {
    expect(listKnownTokens(99999)).toHaveLength(0)
  })
})
