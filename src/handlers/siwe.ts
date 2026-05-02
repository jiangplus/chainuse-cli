import { buildSiweMessage, signSiweMessage, verifySiweMessage } from '../services/siwe.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import { listAccounts } from '../state/index.js'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { chainIdToNumber } from '../chains/evm/utils.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'

async function resolvePrivateKey(alias: string): Promise<string> {
  const passphrase = getPassphrase()
  const keyData = await loadKey(alias, passphrase)
  if (keyData.privateKey) {
    let pk = keyData.privateKey
    if (!pk.startsWith('0x')) pk = `0x${pk}`
    return pk
  }
  if (keyData.mnemonic) {
    return derivePrivateKeyFromMnemonic(keyData.mnemonic)
  }
  throw new Error(`No key material found for alias: ${alias}`)
}

// ─── siwe build ──────────────────────────────────────────────────────────────

export async function handleSiweBuild(opts: {
  domain: string
  ownerAlias: string
  uri: string
  statement?: string
  chain?: string
  nonce?: string
  expirationTime?: string
  resources?: string[]
}): Promise<JsonResult<{ message: string; nonce: string; issuedAt: string }>> {
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
    const chainNumId = chainIdToNumber(chainId)

    const result = buildSiweMessage({
      domain: opts.domain,
      address: ownerAccount.address,
      uri: opts.uri,
      statement: opts.statement,
      chainId: chainNumId,
      nonce: opts.nonce,
      expirationTime: opts.expirationTime,
      resources: opts.resources,
    })

    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

// ─── siwe sign ───────────────────────────────────────────────────────────────

export async function handleSiweSign(opts: {
  message: string
  ownerAlias: string
}): Promise<JsonResult<{ signature: string; message: string }>> {
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
    const result = await signSiweMessage({ message: opts.message, privateKey })
    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.SIGNING_ERROR, message: msg } }
  }
}

// ─── siwe verify ─────────────────────────────────────────────────────────────

export async function handleSiweVerify(opts: {
  message: string
  signature: string
}): Promise<JsonResult<{ valid: boolean; address?: string; domain?: string; chainId?: number; error?: string }>> {
  try {
    const result = await verifySiweMessage({ message: opts.message, signature: opts.signature })
    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

// ─── siwe login (build + sign in one step) ───────────────────────────────────

export async function handleSiweLogin(opts: {
  domain: string
  ownerAlias: string
  uri: string
  statement?: string
  chain?: string
  nonce?: string
  expirationTime?: string
  resources?: string[]
}): Promise<JsonResult<{ message: string; signature: string; nonce: string; issuedAt: string }>> {
  try {
    const buildResult = await handleSiweBuild(opts)
    if (!buildResult.ok) return buildResult as JsonResult<never>

    const signResult = await handleSiweSign({
      message: buildResult.data.message,
      ownerAlias: opts.ownerAlias,
    })
    if (!signResult.ok) return signResult as JsonResult<never>

    return {
      ok: true,
      data: {
        message: signResult.data.message,
        signature: signResult.data.signature,
        nonce: buildResult.data.nonce,
        issuedAt: buildResult.data.issuedAt,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}
