import { isAddress, getAddress, formatUnits, parseUnits } from 'viem'

// Chain name aliases mapping to CAIP-2 chain IDs
export const CHAIN_ALIASES: Record<string, string> = {
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
}

export function resolveChainId(input: string): string {
  const lower = input.toLowerCase()
  if (CHAIN_ALIASES[lower]) return CHAIN_ALIASES[lower]
  // Accept raw eip155:N
  if (/^eip155:\d+$/.test(input)) return input
  throw new Error(`Unknown chain identifier: ${input}`)
}

export function chainIdToNumber(chainId: string): number {
  const match = chainId.match(/^eip155:(\d+)$/)
  if (!match) throw new Error(`Cannot parse chain ID number from: ${chainId}`)
  return parseInt(match[1], 10)
}

export function validateAddress(addr: string): string {
  if (!isAddress(addr)) throw new Error(`Invalid EVM address: ${addr}`)
  return getAddress(addr)
}

export function formatNative(wei: bigint, decimals = 18): string {
  return formatUnits(wei, decimals)
}

export function parseNative(amount: string, decimals = 18): bigint {
  return parseUnits(amount, decimals)
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
