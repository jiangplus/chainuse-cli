import {
  wcPair,
  wcApprove,
  wcReject,
  wcDisconnect,
  wcSignRequest,
  listWcSessions,
  listWcPending,
} from '../services/walletconnect.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import { listAccounts } from '../state/index.js'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'
import type { StoredWcSession, StoredWcPending } from '../state/index.js'

async function resolvePrivateKey(alias: string): Promise<`0x${string}`> {
  const passphrase = getPassphrase()
  const keyData = await loadKey(alias, passphrase)
  if (keyData.privateKey) {
    let pk = keyData.privateKey
    if (!pk.startsWith('0x')) pk = `0x${pk}`
    return pk as `0x${string}`
  }
  if (keyData.mnemonic) {
    return derivePrivateKeyFromMnemonic(keyData.mnemonic) as `0x${string}`
  }
  throw new Error(`No key material found for alias: ${alias}`)
}

// ─── wc pair ─────────────────────────────────────────────────────────────────

export async function handleWcPair(opts: {
  uri: string
}): Promise<JsonResult<{
  pairingTopic: string
  peerName: string
  peerUrl?: string
  requiredChains: string[]
  requiredMethods: string[]
  optionalChains?: string[]
  optionalMethods?: string[]
}>> {
  try {
    const result = await wcPair(opts.uri)
    return {
      ok: true,
      data: {
        pairingTopic: result.topic,
        peerName: result.peerName,
        peerUrl: result.peerUrl,
        requiredChains: result.requiredChains,
        requiredMethods: result.requiredMethods,
        optionalChains: result.optionalChains,
        optionalMethods: result.optionalMethods,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── wc approve ──────────────────────────────────────────────────────────────

export async function handleWcApprove(opts: {
  pairingTopic: string
  ownerAlias: string
  chain?: string
}): Promise<JsonResult<{
  sessionTopic: string
  peerName: string
  accounts: string[]
  chains: string[]
}>> {
  try {
    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` },
      }
    }

    const config = loadConfig()
    const chainId = opts.chain ? resolveChainFromConfig(config, opts.chain) : (config.default_chain as string)

    // Build CAIP-10 account identifier: namespace:chainRef:address
    const caip10 = `${chainId}:${ownerAccount.address}`
    const result = await wcApprove({
      pairingTopic: opts.pairingTopic,
      accounts: [caip10],
      chains: [chainId],
    })

    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── wc reject ───────────────────────────────────────────────────────────────

export async function handleWcReject(opts: {
  pairingTopic: string
}): Promise<JsonResult<{ rejected: boolean }>> {
  try {
    await wcReject(opts.pairingTopic)
    return { ok: true, data: { rejected: true } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── wc sessions ─────────────────────────────────────────────────────────────

export async function handleWcSessions(): Promise<JsonResult<StoredWcSession[]>> {
  try {
    const sessions = listWcSessions()
    return { ok: true, data: sessions }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

// ─── wc disconnect ────────────────────────────────────────────────────────────

export async function handleWcDisconnect(opts: {
  topic: string
}): Promise<JsonResult<{ disconnected: boolean }>> {
  try {
    await wcDisconnect(opts.topic)
    return { ok: true, data: { disconnected: true } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── wc pending ──────────────────────────────────────────────────────────────

export async function handleWcPending(): Promise<JsonResult<StoredWcPending[]>> {
  try {
    const pending = listWcPending()
    return { ok: true, data: pending }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

// ─── wc sign ─────────────────────────────────────────────────────────────────

export async function handleWcSign(opts: {
  requestId: string
  ownerAlias: string
  chain?: string
}): Promise<JsonResult<{ result: string }>> {
  try {
    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` },
      }
    }

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const config = loadConfig()
    const chainId = opts.chain ? resolveChainFromConfig(config, opts.chain) : (config.default_chain as string)

    const result = await wcSignRequest({
      requestId: opts.requestId,
      privateKey,
      chainId,
    })

    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.SIGNING_ERROR, message: msg } }
  }
}
