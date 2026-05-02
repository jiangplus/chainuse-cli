import { describe, it, expect } from 'bun:test'
import {
  resolveAnyChainId,
  isEvmChain,
  isSolanaChain,
  isBitcoinChain,
  isSuiChain,
  getBitcoinNetwork,
  getSolanaNetwork,
  getSuiNetwork,
} from '../../src/chains/resolve.js'
import { chainIdToNumber, resolveChainId } from '../../src/chains/evm/utils.js'

describe('resolveAnyChainId', () => {
  it('passes through CAIP-2 EVM chain IDs unchanged', () => {
    expect(resolveAnyChainId('eip155:1')).toBe('eip155:1')
    expect(resolveAnyChainId('eip155:8453')).toBe('eip155:8453')
  })

  it('resolves numeric strings via eip155 prefix', () => {
    // Bare integers are not supported — callers must use aliases or eip155:N
    expect(resolveAnyChainId('eip155:1')).toBe('eip155:1')
    expect(resolveAnyChainId('eip155:8453')).toBe('eip155:8453')
  })

  it('resolves human-readable EVM aliases', () => {
    expect(resolveAnyChainId('mainnet')).toBe('eip155:1')
    expect(resolveAnyChainId('base')).toBe('eip155:8453')
    expect(resolveAnyChainId('arbitrum')).toBe('eip155:42161')
    expect(resolveAnyChainId('optimism')).toBe('eip155:10')
    expect(resolveAnyChainId('polygon')).toBe('eip155:137')
    expect(resolveAnyChainId('sepolia')).toBe('eip155:11155111')
  })

  it('resolves non-EVM chains', () => {
    expect(resolveAnyChainId('solana')).toBe('solana:mainnet')
    expect(resolveAnyChainId('bitcoin')).toBe('bitcoin:mainnet')
    expect(resolveAnyChainId('sui')).toBe('sui:mainnet')
  })
})

describe('isEvmChain', () => {
  it('recognises EVM CAIP-2 chains', () => {
    expect(isEvmChain('eip155:1')).toBe(true)
    expect(isEvmChain('eip155:8453')).toBe(true)
    expect(isEvmChain('eip155:137')).toBe(true)
  })

  it('rejects non-EVM chains', () => {
    expect(isEvmChain('solana:mainnet')).toBe(false)
    expect(isEvmChain('bitcoin:mainnet')).toBe(false)
    expect(isEvmChain('sui:mainnet')).toBe(false)
  })
})

describe('isSolanaChain / isBitcoinChain / isSuiChain', () => {
  it('isSolanaChain', () => {
    expect(isSolanaChain('solana:mainnet')).toBe(true)
    expect(isSolanaChain('solana:devnet')).toBe(true)
    expect(isSolanaChain('eip155:1')).toBe(false)
  })

  it('isBitcoinChain', () => {
    expect(isBitcoinChain('bitcoin:mainnet')).toBe(true)
    expect(isBitcoinChain('bitcoin:testnet')).toBe(true)
    expect(isBitcoinChain('eip155:1')).toBe(false)
  })

  it('isSuiChain', () => {
    expect(isSuiChain('sui:mainnet')).toBe(true)
    expect(isSuiChain('sui:testnet')).toBe(true)
    expect(isSuiChain('eip155:1')).toBe(false)
  })
})

describe('network helpers', () => {
  it('getBitcoinNetwork', () => {
    expect(getBitcoinNetwork('bitcoin:mainnet')).toBe('mainnet')
    expect(getBitcoinNetwork('bitcoin:testnet')).toBe('testnet')
  })

  it('getSolanaNetwork', () => {
    expect(getSolanaNetwork('solana:mainnet')).toBe('mainnet')
    expect(getSolanaNetwork('solana:devnet')).toBe('devnet')
  })

  it('getSuiNetwork', () => {
    expect(getSuiNetwork('sui:mainnet')).toBe('mainnet')
    expect(getSuiNetwork('sui:testnet')).toBe('testnet')
  })
})

describe('chainIdToNumber', () => {
  it('converts CAIP-2 to numeric chain ID', () => {
    expect(chainIdToNumber('eip155:1')).toBe(1)
    expect(chainIdToNumber('eip155:8453')).toBe(8453)
    expect(chainIdToNumber('eip155:42161')).toBe(42161)
    expect(chainIdToNumber('eip155:11155111')).toBe(11155111)
  })
})
