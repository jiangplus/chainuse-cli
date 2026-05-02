import type { PublicClient } from 'viem'
import type { Config } from '../core/types.js'
import { buildPublicClient } from '../chains/evm/index.js'
import { resolveChainId } from '../chains/evm/utils.js'

export interface Provider {
  getClient(chainId: string): PublicClient
}

export function buildProvider(config: Config, chainIdInput: string): PublicClient {
  const chainId = resolveChainId(chainIdInput)
  const providerConfig = config.providers[chainId]

  if (!providerConfig) {
    throw new Error(
      `No provider configured for chain ${chainId}. Add it to ~/.chainuse/config.yaml`
    )
  }

  const apiKey = process.env[providerConfig.key_env]
  if (!apiKey) {
    throw new Error(
      `Environment variable ${providerConfig.key_env} is not set. ` +
        `Export it before running: export ${providerConfig.key_env}=your_key`
    )
  }

  const rpcUrl = `${providerConfig.url}/${apiKey}`
  return buildPublicClient(rpcUrl, chainId)
}
