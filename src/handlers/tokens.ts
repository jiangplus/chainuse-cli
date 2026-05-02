import { isAddress, getAddress, parseUnits, type Hex } from 'viem'
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
  getErc20Info,
  getErc20Balance,
  getErc20Allowance,
  encodeErc20Transfer,
  encodeErc20Approve,
  parseTokenAmount,
} from '../services/tokens-erc20.js'
import {
  getErc721Info,
  getErc721Owner,
  getErc721TokenURI,
  getErc721Balance,
  encodeErc721Transfer,
} from '../services/tokens-erc721.js'
import {
  getErc1155URI,
  getErc1155Balance,
  encodeErc1155Transfer,
  encodeErc1155BatchTransfer,
} from '../services/tokens-erc1155.js'

// ─── Shared helper ────────────────────────────────────────────────────────────

async function buildTokenTx(opts: {
  from: string
  to: string
  token: string
  data: Hex
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  if (!isAddress(opts.to)) {
    return {
      ok: false,
      error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` },
    }
  }
  if (!isAddress(opts.token)) {
    return {
      ok: false,
      error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` },
    }
  }

  const config = loadConfig()
  const chainId = resolveChainFromConfig(config, opts.chain)
  const client = buildProvider(config, chainId)

  const from = getAddress(opts.from) as `0x${string}`
  const tokenAddr = getAddress(opts.token) as `0x${string}`
  const data = opts.data

  const simulation = await simulateTx(client, { from, to: tokenAddr, value: 0n, data })

  let gasEstimate: bigint
  try {
    gasEstimate = await estimateGas(client, { from, to: tokenAddr, value: 0n, data })
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
    to: tokenAddr,
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
}

type ResolveError = { code: string; message: string }

async function resolveFromAddress(account?: string): Promise<{ address: string } | { error: ResolveError }> {
  if (!account) {
    return { error: { code: ErrorCode.MISSING_ARGUMENT, message: 'Supply --account <alias>' } }
  }
  const accounts = listAccounts()
  const acct = accounts.find((a) => a.alias === account)
  if (!acct) {
    return { error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account alias not found: ${account}` } }
  }
  return { address: acct.address }
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

// ─── ERC-20 handlers ──────────────────────────────────────────────────────────

export async function handleErc20Info(opts: {
  token: string
  chain?: string
}): Promise<JsonResult<{ name: string; symbol: string; decimals: number; totalSupply: bigint }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const info = await getErc20Info(client, getAddress(opts.token) as `0x${string}`)
    return { ok: true, data: info }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc20Balance(opts: {
  token: string
  address: string
  chain?: string
}): Promise<JsonResult<{ address: string; token: string; balance: bigint; formatted: string; symbol: string; decimals: number }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.address)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid address: ${opts.address}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const result = await getErc20Balance(
      client,
      getAddress(opts.token) as `0x${string}`,
      getAddress(opts.address) as `0x${string}`
    )
    return {
      ok: true,
      data: {
        address: opts.address,
        token: opts.token,
        ...result,
      },
    }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc20Allowance(opts: {
  token: string
  owner: string
  spender: string
  chain?: string
}): Promise<JsonResult<{ owner: string; spender: string; token: string; allowance: bigint; formatted: string }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.owner)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid owner address: ${opts.owner}` } }
    }
    if (!isAddress(opts.spender)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid spender address: ${opts.spender}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const result = await getErc20Allowance(
      client,
      getAddress(opts.token) as `0x${string}`,
      getAddress(opts.owner) as `0x${string}`,
      getAddress(opts.spender) as `0x${string}`
    )
    return {
      ok: true,
      data: {
        owner: opts.owner,
        spender: opts.spender,
        token: opts.token,
        ...result,
      },
    }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc20Transfer(opts: {
  token: string
  to: string
  amount: string
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const fromResult = await resolveFromAddress(opts.account)
    if ('error' in fromResult) return { ok: false, error: fromResult.error }

    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)

    // Get decimals first
    const { decimals } = await getErc20Info(client, getAddress(opts.token) as `0x${string}`)
    const amount = parseTokenAmount(opts.amount, decimals)
    const data = encodeErc20Transfer(getAddress(opts.to) as `0x${string}`, amount)

    return buildTokenTx({
      from: fromResult.address,
      to: opts.token,
      token: opts.token,
      data,
      chain: opts.chain,
    })
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc20Approve(opts: {
  token: string
  spender: string
  amount: string
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const fromResult = await resolveFromAddress(opts.account)
    if ('error' in fromResult) return { ok: false, error: fromResult.error }

    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.spender)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid spender address: ${opts.spender}` } }
    }

    let data: Hex
    if (opts.amount === 'max') {
      data = encodeErc20Approve(getAddress(opts.spender) as `0x${string}`, 'max')
    } else {
      const config = loadConfig()
      const chainId = resolveChainFromConfig(config, opts.chain)
      const client = buildProvider(config, chainId)
      const { decimals } = await getErc20Info(client, getAddress(opts.token) as `0x${string}`)
      const amount = parseTokenAmount(opts.amount, decimals)
      data = encodeErc20Approve(getAddress(opts.spender) as `0x${string}`, amount)
    }

    return buildTokenTx({
      from: fromResult.address,
      to: opts.token,
      token: opts.token,
      data,
      chain: opts.chain,
    })
  } catch (err) {
    return catchError(err)
  }
}

// ─── ERC-721 handlers ─────────────────────────────────────────────────────────

export async function handleErc721Info(opts: {
  token: string
  chain?: string
}): Promise<JsonResult<{ name: string; symbol: string }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const info = await getErc721Info(client, getAddress(opts.token) as `0x${string}`)
    return { ok: true, data: info }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc721Owner(opts: {
  token: string
  tokenId: string
  chain?: string
}): Promise<JsonResult<{ token: string; tokenId: string; owner: string }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const owner = await getErc721Owner(
      client,
      getAddress(opts.token) as `0x${string}`,
      BigInt(opts.tokenId)
    )
    return { ok: true, data: { token: opts.token, tokenId: opts.tokenId, owner } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc721TokenURI(opts: {
  token: string
  tokenId: string
  chain?: string
}): Promise<JsonResult<{ token: string; tokenId: string; uri: string }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const uri = await getErc721TokenURI(
      client,
      getAddress(opts.token) as `0x${string}`,
      BigInt(opts.tokenId)
    )
    return { ok: true, data: { token: opts.token, tokenId: opts.tokenId, uri } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc721Balance(opts: {
  token: string
  address: string
  chain?: string
}): Promise<JsonResult<{ token: string; address: string; balance: bigint }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.address)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid address: ${opts.address}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const balance = await getErc721Balance(
      client,
      getAddress(opts.token) as `0x${string}`,
      getAddress(opts.address) as `0x${string}`
    )
    return { ok: true, data: { token: opts.token, address: opts.address, balance } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc721Transfer(opts: {
  token: string
  to: string
  tokenId: string
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const fromResult = await resolveFromAddress(opts.account)
    if ('error' in fromResult) return { ok: false, error: fromResult.error }

    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.to)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` } }
    }

    const data = encodeErc721Transfer(
      getAddress(fromResult.address) as `0x${string}`,
      getAddress(opts.to) as `0x${string}`,
      BigInt(opts.tokenId)
    )

    return buildTokenTx({
      from: fromResult.address,
      to: opts.token,
      token: opts.token,
      data,
      chain: opts.chain,
    })
  } catch (err) {
    return catchError(err)
  }
}

// ─── ERC-1155 handlers ────────────────────────────────────────────────────────

export async function handleErc1155Balance(opts: {
  token: string
  id: string
  address: string
  chain?: string
}): Promise<JsonResult<{ token: string; id: string; address: string; balance: bigint }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.address)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid address: ${opts.address}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const balance = await getErc1155Balance(
      client,
      getAddress(opts.token) as `0x${string}`,
      getAddress(opts.address) as `0x${string}`,
      BigInt(opts.id)
    )
    return { ok: true, data: { token: opts.token, id: opts.id, address: opts.address, balance } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc1155URI(opts: {
  token: string
  id: string
  chain?: string
}): Promise<JsonResult<{ token: string; id: string; uri: string }>> {
  try {
    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)
    const uri = await getErc1155URI(
      client,
      getAddress(opts.token) as `0x${string}`,
      BigInt(opts.id)
    )
    return { ok: true, data: { token: opts.token, id: opts.id, uri } }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc1155Transfer(opts: {
  token: string
  to: string
  id: string
  amount: string
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const fromResult = await resolveFromAddress(opts.account)
    if ('error' in fromResult) return { ok: false, error: fromResult.error }

    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.to)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` } }
    }

    const data = encodeErc1155Transfer(
      getAddress(fromResult.address) as `0x${string}`,
      getAddress(opts.to) as `0x${string}`,
      BigInt(opts.id),
      BigInt(opts.amount)
    )

    return buildTokenTx({
      from: fromResult.address,
      to: opts.token,
      token: opts.token,
      data,
      chain: opts.chain,
    })
  } catch (err) {
    return catchError(err)
  }
}

export async function handleErc1155BatchTransfer(opts: {
  token: string
  to: string
  ids: string[]
  amounts: string[]
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    const fromResult = await resolveFromAddress(opts.account)
    if ('error' in fromResult) return { ok: false, error: fromResult.error }

    if (!isAddress(opts.token)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid token address: ${opts.token}` } }
    }
    if (!isAddress(opts.to)) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` } }
    }
    if (opts.ids.length !== opts.amounts.length) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_AMOUNT, message: `ids and amounts arrays must have the same length` },
      }
    }

    const data = encodeErc1155BatchTransfer(
      getAddress(fromResult.address) as `0x${string}`,
      getAddress(opts.to) as `0x${string}`,
      opts.ids.map((id) => BigInt(id)),
      opts.amounts.map((a) => BigInt(a))
    )

    return buildTokenTx({
      from: fromResult.address,
      to: opts.token,
      token: opts.token,
      data,
      chain: opts.chain,
    })
  } catch (err) {
    return catchError(err)
  }
}
