import { isAddress, getAddress } from 'viem'
import { randomUUID } from 'node:crypto'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import {
  estimateGas,
  getMaxPriorityFeePerGas,
  getBlockBaseFee,
  getNonce,
  simulateTx,
} from '../chains/evm/index.js'
import { listAccounts, insertTx } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, TxEnvelope } from '../core/types.js'
import type { PrepareResult } from './tx.js'
import {
  resolveEns,
  reverseResolveEns,
  encodeSetPrimaryName,
  encodeSetRecord,
  ensNamehash,
} from '../services/ens.js'
import { normalize } from 'viem/ens'

const ENS_MAINNET_CHAIN = 'eip155:1'

function isMainnet(chainId: string): boolean {
  return chainId === ENS_MAINNET_CHAIN
}

function catchError(err: unknown): JsonResult<never> {
  const msg = err instanceof Error ? err.message : String(err)
  const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('JsonRpc')
  return {
    ok: false,
    error: {
      code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
      message: msg,
    },
  }
}

export async function handleEnsResolve(opts: {
  name: string
  chain?: string
}): Promise<JsonResult<{ name: string; address: string | null; normalizedName: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    if (!isMainnet(chainId)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: 'ENS is only supported on Ethereum mainnet (eip155:1)',
          hint: 'Use --chain mainnet or omit --chain if mainnet is your default',
        },
      }
    }
    const client = buildProvider(config, chainId)
    let normalizedName: string
    try {
      normalizedName = normalize(opts.name)
    } catch {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid ENS name: ${opts.name}` },
      }
    }
    const address = await resolveEns(client, opts.name)
    return { ok: true, data: { name: opts.name, address, normalizedName } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleEnsReverse(opts: {
  address: string
  chain?: string
}): Promise<JsonResult<{ address: string; name: string | null }>> {
  try {
    if (!isAddress(opts.address)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid address: ${opts.address}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    if (!isMainnet(chainId)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: 'ENS is only supported on Ethereum mainnet (eip155:1)',
          hint: 'Use --chain mainnet or omit --chain if mainnet is your default',
        },
      }
    }
    const client = buildProvider(config, chainId)
    const name = await reverseResolveEns(client, opts.address)
    return { ok: true, data: { address: opts.address, name } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleEnsSetPrimary(opts: {
  name: string
  account: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    if (!isMainnet(chainId)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: 'ENS is only supported on Ethereum mainnet (eip155:1)',
        },
      }
    }

    const accounts = listAccounts()
    const acct = accounts.find((a) => a.alias === opts.account)
    if (!acct) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account alias not found: ${opts.account}` } }
    }

    const { to, data } = encodeSetPrimaryName(opts.name)
    const client = buildProvider(config, chainId)
    const from = getAddress(acct.address) as `0x${string}`

    const simulation = await simulateTx(client, { from, to, value: 0n, data })

    let gasEstimate: bigint
    try {
      gasEstimate = await estimateGas(client, { from, to, value: 0n, data })
      gasEstimate = (gasEstimate * 120n) / 100n
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCode.GAS_ESTIMATION_FAILED,
          message: `Gas estimation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    const [maxPriorityFeePerGas, baseFee] = await Promise.all([
      getMaxPriorityFeePerGas(client),
      getBlockBaseFee(client),
    ])
    const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas
    const nonce = await getNonce(client, from)

    const now = Date.now()
    const envelope: TxEnvelope = {
      id: randomUUID(),
      status: 'prepared',
      chainId,
      from,
      to,
      value: 0n,
      data,
      gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      simulationResult: simulation,
      createdAt: now,
      updatedAt: now,
    }

    insertTx(envelope)
    return { ok: true, data: envelope as PrepareResult }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleEnsSetRecord(opts: {
  name: string
  key: string
  value: string
  account: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    if (!isMainnet(chainId)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: 'ENS is only supported on Ethereum mainnet (eip155:1)',
        },
      }
    }

    const accounts = listAccounts()
    const acct = accounts.find((a) => a.alias === opts.account)
    if (!acct) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account alias not found: ${opts.account}` } }
    }

    const node = ensNamehash(opts.name)
    const { to, data } = encodeSetRecord(node, opts.key, opts.value)
    const client = buildProvider(config, chainId)
    const from = getAddress(acct.address) as `0x${string}`

    const simulation = await simulateTx(client, { from, to, value: 0n, data })

    let gasEstimate: bigint
    try {
      gasEstimate = await estimateGas(client, { from, to, value: 0n, data })
      gasEstimate = (gasEstimate * 120n) / 100n
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCode.GAS_ESTIMATION_FAILED,
          message: `Gas estimation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    const [maxPriorityFeePerGas, baseFee] = await Promise.all([
      getMaxPriorityFeePerGas(client),
      getBlockBaseFee(client),
    ])
    const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas
    const nonce = await getNonce(client, from)

    const now = Date.now()
    const envelope: TxEnvelope = {
      id: randomUUID(),
      status: 'prepared',
      chainId,
      from,
      to,
      value: 0n,
      data,
      gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      simulationResult: simulation,
      createdAt: now,
      updatedAt: now,
    }

    insertTx(envelope)
    return { ok: true, data: envelope as PrepareResult }
  } catch (err) {
    return catchError(err)
  }
}
