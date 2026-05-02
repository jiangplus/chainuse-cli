import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import { listAccounts } from '../state/index.js'
import {
  createSafe,
  getSafeInfo,
  proposeSafeTx,
  confirmSafeTx,
  executeSafeTx,
  getSafeQueue,
  type SafeInfo,
  type SafeQueueItem,
} from '../services/safe.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'
import type { Hex } from 'viem'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolvePrivateKey(alias: string): Promise<Hex> {
  const passphrase = getPassphrase()
  const keyData = await loadKey(alias, passphrase)
  if (keyData.privateKey) {
    let pk = keyData.privateKey
    if (!pk.startsWith('0x')) pk = `0x${pk}`
    return pk as Hex
  }
  if (keyData.mnemonic) {
    return derivePrivateKeyFromMnemonic(keyData.mnemonic)
  }
  throw new Error(`No key material found for alias: ${alias}`)
}

function getAccountAddress(alias: string): string {
  const accounts = listAccounts()
  const acct = accounts.find((a) => a.alias === alias)
  if (!acct) throw new Error(`Account alias not found: ${alias}`)
  return acct.address
}

function getRpcUrl(chainId: string): string {
  const config = loadConfig()
  const providerConfig = config.providers[chainId]
  if (!providerConfig) {
    throw new Error(`No provider configured for chain ${chainId}`)
  }
  const apiKey = process.env[providerConfig.key_env]
  if (!apiKey) {
    throw new Error(`Environment variable ${providerConfig.key_env} is not set`)
  }
  return `${providerConfig.url}/${apiKey}`
}

// ─── safe create ─────────────────────────────────────────────────────────────

export async function handleSafeCreate(opts: {
  owners: string[]
  threshold: number
  account: string
  saltNonce?: string
  chain?: string
}): Promise<JsonResult<{ address: string; owners: string[]; threshold: number }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)
    const privateKey = await resolvePrivateKey(opts.account)

    const result = await createSafe({
      owners: opts.owners,
      threshold: opts.threshold,
      saltNonce: opts.saltNonce,
      rpcUrl,
      signerPrivateKey: privateKey,
    })

    return {
      ok: true,
      data: {
        address: result.safeAddress,
        owners: opts.owners,
        threshold: opts.threshold,
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

// ─── safe info ────────────────────────────────────────────────────────────────

export async function handleSafeInfo(opts: {
  address: string
  chain?: string
}): Promise<JsonResult<SafeInfo>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)

    // Use a dummy signer for read-only operations; protocol-kit v7 requires one
    // If no account provided, use zero address approach or first available account
    const accounts = listAccounts()
    let privateKey: Hex
    if (accounts.length > 0) {
      try {
        privateKey = await resolvePrivateKey(accounts[0].alias)
      } catch {
        // Fallback to a dummy key — read-only queries only
        privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
      }
    } else {
      privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
    }

    const info = await getSafeInfo({
      safeAddress: opts.address,
      rpcUrl,
      signerPrivateKey: privateKey,
    })

    return { ok: true, data: info }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}

// ─── safe propose ─────────────────────────────────────────────────────────────

export async function handleSafePropose(opts: {
  safeAddress: string
  to: string
  value?: string
  data?: string
  account: string
  chain?: string
}): Promise<JsonResult<{ safeTxHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)
    const privateKey = await resolvePrivateKey(opts.account)
    const signerAddress = getAccountAddress(opts.account)
    const value = opts.value ? BigInt(opts.value) : 0n

    const result = await proposeSafeTx({
      safeAddress: opts.safeAddress,
      to: opts.to,
      value,
      data: opts.data,
      rpcUrl,
      signerPrivateKey: privateKey,
      chainId,
      signerAddress,
    })

    return { ok: true, data: { safeTxHash: result.safeTxHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}

// ─── safe confirm ─────────────────────────────────────────────────────────────

export async function handleSafeConfirm(opts: {
  safeTxHash: string
  account: string
  chain?: string
}): Promise<JsonResult<{ safeTxHash: string; signaturesCollected: number }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)
    const privateKey = await resolvePrivateKey(opts.account)
    const signerAddress = getAccountAddress(opts.account)

    // Determine safeAddress from stored tx
    const { getSafeTx } = await import('../state/index.js')
    const stored = getSafeTx(opts.safeTxHash)
    if (!stored) {
      return {
        ok: false,
        error: {
          code: ErrorCode.TX_NOT_FOUND,
          message: `Safe tx not found: ${opts.safeTxHash}`,
        },
      }
    }

    const result = await confirmSafeTx({
      safeAddress: stored.safeAddress,
      safeTxHash: opts.safeTxHash,
      rpcUrl,
      signerPrivateKey: privateKey,
      signerAddress,
      chainId,
    })

    return {
      ok: true,
      data: {
        safeTxHash: result.safeTxHash,
        signaturesCollected: result.signatures,
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

// ─── safe execute ─────────────────────────────────────────────────────────────

export async function handleSafeExecute(opts: {
  safeTxHash: string
  account: string
  chain?: string
}): Promise<JsonResult<{ txHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)
    const privateKey = await resolvePrivateKey(opts.account)

    // Determine safeAddress from stored tx
    const { getSafeTx } = await import('../state/index.js')
    const stored = getSafeTx(opts.safeTxHash)
    if (!stored) {
      return {
        ok: false,
        error: {
          code: ErrorCode.TX_NOT_FOUND,
          message: `Safe tx not found: ${opts.safeTxHash}`,
        },
      }
    }

    const result = await executeSafeTx({
      safeAddress: stored.safeAddress,
      safeTxHash: opts.safeTxHash,
      rpcUrl,
      signerPrivateKey: privateKey,
      chainId,
    })

    return { ok: true, data: { txHash: result.txHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}

// ─── safe queue ───────────────────────────────────────────────────────────────

export async function handleSafeQueue(opts: {
  address: string
  chain?: string
}): Promise<JsonResult<SafeQueueItem[]>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const rpcUrl = getRpcUrl(chainId)

    const accounts = listAccounts()
    let privateKey: Hex
    if (accounts.length > 0) {
      try {
        privateKey = await resolvePrivateKey(accounts[0].alias)
      } catch {
        privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
      }
    } else {
      privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
    }

    const queue = await getSafeQueue({
      safeAddress: opts.address,
      rpcUrl,
      signerPrivateKey: privateKey,
    })

    return { ok: true, data: queue }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}
