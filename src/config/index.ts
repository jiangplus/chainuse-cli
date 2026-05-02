import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import yaml from 'js-yaml'
import type { Config } from '../core/types.js'
import { resolveAnyChainId } from '../chains/resolve.js'

export function getChainuseDir(): string {
  return process.env.CHAINUSE_HOME ?? join(homedir(), '.chainuse')
}

export function getConfigPath(): string {
  return join(getChainuseDir(), 'config.yaml')
}

export function getPolicyPath(): string {
  return join(getChainuseDir(), 'policy.yaml')
}

export function getKeystorePath(): string {
  return join(getChainuseDir(), 'keystore.db')
}

export function getStatePath(): string {
  return join(getChainuseDir(), 'state.db')
}

export function isInitialized(): boolean {
  return existsSync(getConfigPath())
}

export function loadConfig(): Config {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    throw new Error(
      `Chainuse not initialized. Run: chain init`
    )
  }
  const raw = readFileSync(configPath, 'utf-8')
  return yaml.load(raw) as Config
}

export function resolveChainFromConfig(config: Config, chainInput?: string): string {
  const input = chainInput ?? config.default_chain
  return resolveAnyChainId(input)
}

/**
 * Resolve a provider URL for a non-EVM chain from config.
 * For Solana and Sui: returns RPC URL (with Alchemy key appended if applicable).
 * For Bitcoin: returns the mempool.space API base URL.
 */
export function resolveNonEvmRpcUrl(config: Config, chainId: string): string {
  const provider = (config.providers as Record<string, { kind: string; url: string; key_env?: string }>)[chainId]
  if (!provider) {
    // Return reasonable defaults
    if (chainId === 'solana:mainnet') return 'https://api.mainnet-beta.solana.com'
    if (chainId === 'solana:devnet') return 'https://api.devnet.solana.com'
    if (chainId === 'bitcoin:mainnet') return 'https://mempool.space/api'
    if (chainId === 'bitcoin:testnet') return 'https://mempool.space/testnet/api'
    if (chainId === 'sui:mainnet') return 'https://fullnode.mainnet.sui.io'
    if (chainId === 'sui:testnet') return 'https://fullnode.testnet.sui.io'
    throw new Error(`No provider configured for chain: ${chainId}`)
  }

  let url = provider.url
  if (provider.kind === 'alchemy' && provider.key_env) {
    const key = process.env[provider.key_env]
    if (key) url = `${url}/${key}`
  }
  return url
}
