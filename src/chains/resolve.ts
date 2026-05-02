import { CHAIN_ALIASES, resolveChainId as resolveEvmChainId } from './evm/utils.js'

// Extended chain aliases covering all supported chains
export const ALL_CHAIN_ALIASES: Record<string, string> = {
  // EVM (handled by evm/utils.ts resolveChainId, kept here for completeness)
  mainnet: 'eip155:1',
  ethereum: 'eip155:1',
  base: 'eip155:8453',
  arbitrum: 'eip155:42161',
  arb: 'eip155:42161',
  optimism: 'eip155:10',
  op: 'eip155:10',
  polygon: 'eip155:137',
  sepolia: 'eip155:11155111',
  'base-sepolia': 'eip155:84532',

  // Solana
  solana: 'solana:mainnet',
  'solana-mainnet': 'solana:mainnet',
  'solana-devnet': 'solana:devnet',
  'solana-testnet': 'solana:devnet',

  // Bitcoin
  bitcoin: 'bitcoin:mainnet',
  btc: 'bitcoin:mainnet',
  'bitcoin-testnet': 'bitcoin:testnet',
  'btc-testnet': 'bitcoin:testnet',

  // Sui
  sui: 'sui:mainnet',
  'sui-mainnet': 'sui:mainnet',
  'sui-testnet': 'sui:testnet',
}

/**
 * Resolves any chain identifier (EVM, Solana, Bitcoin, Sui) to a canonical chain ID string.
 * For EVM chains, returns eip155:N format.
 * For other chains, returns family:network format (e.g. solana:mainnet).
 */
export function resolveAnyChainId(input: string): string {
  const lower = input.toLowerCase()

  // Check extended aliases first
  if (ALL_CHAIN_ALIASES[lower]) return ALL_CHAIN_ALIASES[lower]

  // Pass-through for already-canonical IDs
  if (/^eip155:\d+$/.test(input)) return input
  if (/^solana:(mainnet|devnet|testnet)$/.test(input)) return input
  if (/^bitcoin:(mainnet|testnet)$/.test(input)) return input
  if (/^sui:(mainnet|testnet)$/.test(input)) return input

  // Fall back to EVM resolver (handles numeric chain IDs, etc.)
  return resolveEvmChainId(input)
}

export function isEvmChain(chainId: string): boolean {
  return chainId.startsWith('eip155:')
}

export function isSolanaChain(chainId: string): boolean {
  return chainId.startsWith('solana:')
}

export function isBitcoinChain(chainId: string): boolean {
  return chainId.startsWith('bitcoin:')
}

export function isSuiChain(chainId: string): boolean {
  return chainId.startsWith('sui:')
}

export function getSolanaNetwork(chainId: string): 'mainnet' | 'devnet' {
  if (chainId === 'solana:devnet') return 'devnet'
  return 'mainnet'
}

export function getBitcoinNetwork(chainId: string): 'mainnet' | 'testnet' {
  if (chainId === 'bitcoin:testnet') return 'testnet'
  return 'mainnet'
}

export function getSuiNetwork(chainId: string): 'mainnet' | 'testnet' {
  if (chainId === 'sui:testnet') return 'testnet'
  return 'mainnet'
}
