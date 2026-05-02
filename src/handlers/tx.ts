import { isAddress, getAddress, parseUnits, type Hex } from 'viem'
import { randomUUID } from 'node:crypto'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { getPrice } from '../services/price-chainlink.js'
import { CHAINLINK_FEEDS } from '../registries/chainlink-feeds.js'
import {
  estimateGas,
  getMaxPriorityFeePerGas,
  getBlockBaseFee,
  getNonce,
  simulateTx,
  broadcastTx,
  getTxReceipt,
  getTxByHash,
} from '../chains/evm/index.js'
import { chainIdToNumber } from '../chains/evm/utils.js'
import { insertTx, updateTx, getTx, listAccounts } from '../state/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic, signTransaction } from '../accounts/eoa.js'
import { loadPolicy, evaluatePolicy } from '../policy/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, TxEnvelope } from '../core/types.js'

export type PrepareResult = TxEnvelope & { id: string }
export type SignResult = { id: string; status: string }
export type SendResult = { id: string; hash: string; status: string }
export type StatusResult = {
  hash: string
  status: 'pending' | 'confirmed' | 'failed' | 'unknown'
  blockNumber?: number
  gasUsed?: string
  effectiveGasPrice?: string
}

export async function handleTxPrepare(opts: {
  to: string
  value: string
  data?: string
  from?: string
  account?: string
  chain?: string
}): Promise<JsonResult<PrepareResult>> {
  try {
    if (!isAddress(opts.to)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` },
      }
    }

    // Resolve from: explicit address, or account alias lookup
    let fromAddress = opts.from
    if (!fromAddress && opts.account) {
      const accounts = listAccounts()
      const acct = accounts.find((a) => a.alias === opts.account)
      if (!acct) {
        return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account alias not found: ${opts.account}` } }
      }
      fromAddress = acct.address
    }
    if (!fromAddress) {
      return { ok: false, error: { code: ErrorCode.MISSING_ARGUMENT, message: `Supply --from <address> or --account <alias>` } }
    }
    if (!isAddress(fromAddress)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid from address: ${fromAddress}` },
      }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)

    const to = getAddress(opts.to) as `0x${string}`
    const from = getAddress(fromAddress) as `0x${string}`
    const value = parseUnits(opts.value, 18)
    const data = opts.data as Hex | undefined

    // Simulate first
    const simulation = await simulateTx(client, { from, to, value, data })

    // Gas estimation
    let gasEstimate: bigint
    try {
      gasEstimate = await estimateGas(client, { from, to, value, data })
      // Add 20% buffer
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

    // Fee data
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
      value,
      data: opts.data,
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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNetwork =
      msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('JsonRpc')
    return {
      ok: false,
      error: {
        code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
        message: msg,
      },
    }
  }
}

export async function fetchEthPriceUsd(config: ReturnType<typeof loadConfig>, chainId: string): Promise<number> {
  try {
    const feeds = CHAINLINK_FEEDS[chainId] as Record<string, string> | undefined
    const feedAddr = feeds?.['ETH/USD']
    if (!feedAddr) return 3000 // chain has no ETH/USD feed; conservative fallback
    const client = buildProvider(config, chainId)
    const result = await getPrice(client, feedAddr as `0x${string}`)
    return parseFloat(result.price)
  } catch {
    return 3000 // oracle unavailable; use conservative fallback
  }
}

export async function handleTxSign(opts: {
  txId: string
  passphrase?: string
}): Promise<JsonResult<SignResult>> {
  try {
    const envelope = getTx(opts.txId)
    if (!envelope) {
      return {
        ok: false,
        error: { code: ErrorCode.TX_NOT_FOUND, message: `Transaction ${opts.txId} not found` },
      }
    }

    if (envelope.status !== 'prepared') {
      return {
        ok: false,
        error: {
          code: ErrorCode.TX_WRONG_STATUS,
          message: `Transaction is in "${envelope.status}" status, expected "prepared"`,
        },
      }
    }

    // Policy evaluation — ETH price always fetched from Chainlink; never caller-supplied.
    const policy = loadPolicy()
    const config = loadConfig()
    const ethPrice = await fetchEthPriceUsd(config, envelope.chainId)
    const fromAlias = listAccounts().find((a) => a.address.toLowerCase() === envelope.from.toLowerCase())?.alias ?? envelope.from
    const policyResult = await evaluatePolicy(policy, envelope, ethPrice, fromAlias)

    if (policyResult.decision === 'deny') {
      return {
        ok: false,
        error: {
          code: ErrorCode.POLICY_DENIED,
          message: `Transaction denied by policy`,
          details: policyResult.reasons,
        },
      }
    }

    // Find account by from address
    const allAccounts = listAccounts()
    const fromAccount = allAccounts.find(
      (a) => a.address.toLowerCase() === envelope.from.toLowerCase()
    )

    if (!fromAccount) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `No account found for address ${envelope.from}`,
          hint: 'Import this key first with "chain keys import"',
        },
      }
    }

    const passphrase = getPassphrase(opts.passphrase)
    const keyMaterial = await loadKey(fromAccount.alias, passphrase)

    let privateKey: Hex
    if (keyMaterial.privateKey) {
      privateKey = keyMaterial.privateKey as Hex
    } else if (keyMaterial.mnemonic) {
      const path = fromAccount.derivationPath ?? "m/44'/60'/0'/0/0"
      privateKey = derivePrivateKeyFromMnemonic(keyMaterial.mnemonic, path)
    } else {
      return {
        ok: false,
        error: { code: ErrorCode.SIGNING_ERROR, message: 'No key material found in keystore' },
      }
    }

    if (envelope.nonce === undefined || !envelope.maxFeePerGas || !envelope.maxPriorityFeePerGas || !envelope.gasEstimate) {
      return {
        ok: false,
        error: {
          code: ErrorCode.SIGNING_ERROR,
          message: 'Transaction envelope is missing required fields (nonce, fees, gas)',
        },
      }
    }

    const chainNumId = chainIdToNumber(envelope.chainId)

    const signedRawTx = await signTransaction(privateKey, {
      chainId: chainNumId,
      to: envelope.to as Hex,
      value: envelope.value,
      nonce: envelope.nonce!,
      maxFeePerGas: envelope.maxFeePerGas!,
      maxPriorityFeePerGas: envelope.maxPriorityFeePerGas!,
      gas: envelope.gasEstimate!,
      data: envelope.data as Hex | undefined,
    })

    const updated: TxEnvelope = {
      ...envelope,
      status: 'signed',
      signedRawTx,
      updatedAt: Date.now(),
    }
    updateTx(updated)

    return { ok: true, data: { id: envelope.id, status: 'signed' } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('DECRYPTION_FAILED') || msg.includes('Invalid passphrase')) {
      return {
        ok: false,
        error: { code: ErrorCode.DECRYPTION_FAILED, message: msg },
      }
    }
    return {
      ok: false,
      error: { code: ErrorCode.SIGNING_ERROR, message: msg },
    }
  }
}

export async function handleTxSend(opts: {
  txId: string
}): Promise<JsonResult<SendResult>> {
  try {
    const envelope = getTx(opts.txId)
    if (!envelope) {
      return {
        ok: false,
        error: { code: ErrorCode.TX_NOT_FOUND, message: `Transaction ${opts.txId} not found` },
      }
    }

    if (envelope.status !== 'signed') {
      return {
        ok: false,
        error: {
          code: ErrorCode.TX_WRONG_STATUS,
          message: `Transaction is in "${envelope.status}" status, expected "signed"`,
          hint: 'Run "chain tx sign --tx-id <id>" first',
        },
      }
    }

    if (!envelope.signedRawTx) {
      return {
        ok: false,
        error: { code: ErrorCode.SIGNING_ERROR, message: 'Signed raw transaction is missing' },
      }
    }

    const config = loadConfig()
    const client = buildProvider(config, envelope.chainId)

    const hash = await broadcastTx(client, envelope.signedRawTx as Hex)

    const updated: TxEnvelope = {
      ...envelope,
      status: 'sent',
      hash,
      updatedAt: Date.now(),
    }
    updateTx(updated)

    return { ok: true, data: { id: envelope.id, hash, status: 'sent' } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: {
        code: ErrorCode.PROVIDER_ERROR,
        message: `Failed to broadcast transaction: ${msg}`,
      },
    }
  }
}

export async function handleTxStatus(opts: {
  hash: string
  chain?: string
}): Promise<JsonResult<StatusResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)

    const hash = opts.hash as Hex
    const receipt = await getTxReceipt(client, hash)

    if (!receipt) {
      // Check if tx is pending (mempool)
      const tx = await getTxByHash(client, hash)
      if (tx) {
        return {
          ok: true,
          data: { hash: opts.hash, status: 'pending' },
        }
      }
      return {
        ok: true,
        data: { hash: opts.hash, status: 'unknown' },
      }
    }

    const status = receipt.status === 'success' ? 'confirmed' : 'failed'

    return {
      ok: true,
      data: {
        hash: opts.hash,
        status,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}
