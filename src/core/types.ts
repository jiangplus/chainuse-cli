// Core shared types for Chainuse

export type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; hint?: string; details?: unknown } }

export type Account = {
  alias: string
  chain: string       // 'evm', 'solana', 'btc', 'sui'
  address: string
  type: 'eoa'
  derivationPath?: string
  createdAt: number
}

export type TxEnvelope = {
  id: string
  status: 'prepared' | 'signed' | 'sent' | 'confirmed' | 'failed'
  chainId: string
  from: string
  to: string
  value: bigint
  data?: string
  gasEstimate?: bigint
  gasPrice?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  nonce?: number
  signedRawTx?: string
  hash?: string
  simulationResult?: unknown
  createdAt: number
  updatedAt: number
}

export type Asset =
  | { kind: 'native' }
  | { kind: 'erc20'; address: string }

export type ChainId = string // e.g. 'eip155:1'

export type PolicyDecision = {
  decision: 'allow' | 'deny'
  reasons: string[]
}

export type ProviderConfig = {
  kind: 'alchemy'
  key_env: string
  url: string
}

export type Config = {
  version: number
  default_chain: string
  providers: Record<string, ProviderConfig>
  testnets?: string[]
}

export type PolicyConfig = {
  version: number
  defaults: {
    require_simulation: boolean
    max_gas_usd: number
    max_value_per_tx_usd: number
  }
}
