import { isAddress, getAddress, parseUnits, type Address } from 'viem'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import { listAccounts } from '../state/index.js'
import { chainIdToNumber } from '../chains/evm/utils.js'
import { resolveTokenAddress, getTokenDecimals, getTokenSymbol } from '../registries/tokens.js'
import {
  getAaveAccountData,
  getAaveReserveData,
  buildAaveSupply,
  buildAaveWithdraw,
  buildAaveBorrow,
  buildAaveRepay,
} from '../services/aave.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'

function getRpcUrl(config: ReturnType<typeof loadConfig>, chainId: string): string {
  const providerConfig = config.providers[chainId]
  if (!providerConfig) throw new Error(`No provider configured for chain ${chainId}`)
  const apiKey = process.env[providerConfig.key_env]
  if (!apiKey) throw new Error(`Environment variable ${providerConfig.key_env} is not set`)
  return `${providerConfig.url}/${apiKey}`
}

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

async function resolveAsset(tokenStr: string, chainId: string, chainNumId: number, client: ReturnType<typeof buildProvider>): Promise<{ address: Address; decimals: number; symbol: string }> {
  const resolved = resolveTokenAddress(tokenStr, chainNumId)
  const address = resolved ?? (isAddress(tokenStr) ? getAddress(tokenStr) as Address : null)
  if (!address) throw new Error(`Unknown token: ${tokenStr}`)
  const decimals = await getTokenDecimals(client, address)
  const symbol = await getTokenSymbol(client, address)
  return { address, decimals, symbol }
}

// ─── aave account ────────────────────────────────────────────────────────────

export async function handleAaveAccount(opts: {
  ownerAlias: string
  chain?: string
}): Promise<JsonResult<{
  totalCollateralUsd: string
  totalDebtUsd: string
  availableBorrowsUsd: string
  currentLiquidationThreshold: string
  ltv: string
  healthFactor: string
}>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const client = buildProvider(config, chainId)
    const data = await getAaveAccountData({
      client,
      chainId: chainNumId,
      userAddress: ownerAccount.address as Address,
    })

    return { ok: true, data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── aave reserve ────────────────────────────────────────────────────────────

export async function handleAaveReserve(opts: {
  asset: string
  ownerAlias: string
  chain?: string
}): Promise<JsonResult<{
  asset: string
  currentATokenBalance: string
  currentVariableDebt: string
  currentStableDebt: string
  liquidityRate: string
  usageAsCollateralEnabled: boolean
}>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const client = buildProvider(config, chainId)
    const asset = await resolveAsset(opts.asset, chainId, chainNumId, client)
    const data = await getAaveReserveData({
      client,
      chainId: chainNumId,
      asset: asset.address,
      userAddress: ownerAccount.address as Address,
      decimals: asset.decimals,
    })

    return { ok: true, data: { asset: asset.symbol, ...data } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── aave supply ─────────────────────────────────────────────────────────────

export async function handleAaveSupply(opts: {
  asset: string
  amount: string
  ownerAlias: string
  chain?: string
}): Promise<JsonResult<{ approveTxHash: string; supplyTxHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const client = buildProvider(config, chainId)
    const asset = await resolveAsset(opts.asset, chainId, chainNumId, client)
    const amountRaw = parseUnits(opts.amount, asset.decimals)
    const txData = buildAaveSupply({
      chainId: chainNumId,
      asset: asset.address,
      amount: amountRaw,
      onBehalfOf: ownerAccount.address as Address,
    })

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const { createWalletClient, http } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const rpcUrl = getRpcUrl(config, chainId)
    const account = privateKeyToAccount(privateKey)
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) })

    const approveHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.approveTarget,
      data: txData.approveCalldata,
      value: 0n,
    })
    await client.waitForTransactionReceipt({ hash: approveHash })

    const supplyHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.supplyTarget,
      data: txData.supplyCalldata,
      value: 0n,
    })

    return { ok: true, data: { approveTxHash: approveHash, supplyTxHash: supplyHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── aave withdraw ───────────────────────────────────────────────────────────

export async function handleAaveWithdraw(opts: {
  asset: string
  amount: string
  ownerAlias: string
  to?: string
  chain?: string
}): Promise<JsonResult<{ txHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const toAddr = opts.to
      ? (isAddress(opts.to) ? getAddress(opts.to) as Address : null)
      : (ownerAccount.address as Address)
    if (!toAddr) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid --to address: ${opts.to}` } }
    }

    const client = buildProvider(config, chainId)
    const asset = await resolveAsset(opts.asset, chainId, chainNumId, client)
    // uint256.max = full withdrawal
    const amountRaw = opts.amount === 'max'
      ? BigInt('0x' + 'f'.repeat(64))
      : parseUnits(opts.amount, asset.decimals)

    const txData = buildAaveWithdraw({
      chainId: chainNumId,
      asset: asset.address,
      amount: amountRaw,
      to: toAddr,
    })

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const { createWalletClient, http } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const rpcUrl = getRpcUrl(config, chainId)
    const account = privateKeyToAccount(privateKey)
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) })

    const txHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.target,
      data: txData.calldata,
      value: 0n,
    })

    return { ok: true, data: { txHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── aave borrow ─────────────────────────────────────────────────────────────

export async function handleAaveBorrow(opts: {
  asset: string
  amount: string
  ownerAlias: string
  chain?: string
  interestRateMode?: '1' | '2'
}): Promise<JsonResult<{ txHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const client = buildProvider(config, chainId)
    const asset = await resolveAsset(opts.asset, chainId, chainNumId, client)
    const amountRaw = parseUnits(opts.amount, asset.decimals)

    const txData = buildAaveBorrow({
      chainId: chainNumId,
      asset: asset.address,
      amount: amountRaw,
      onBehalfOf: ownerAccount.address as Address,
      interestRateMode: (opts.interestRateMode ? Number(opts.interestRateMode) : 2) as 1 | 2,
    })

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const { createWalletClient, http } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const rpcUrl = getRpcUrl(config, chainId)
    const account = privateKeyToAccount(privateKey)
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) })

    const txHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.target,
      data: txData.calldata,
      value: 0n,
    })

    return { ok: true, data: { txHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── aave repay ──────────────────────────────────────────────────────────────

export async function handleAaveRepay(opts: {
  asset: string
  amount: string
  ownerAlias: string
  chain?: string
  interestRateMode?: '1' | '2'
}): Promise<JsonResult<{ approveTxHash: string; repayTxHash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` } }
    }

    const client = buildProvider(config, chainId)
    const asset = await resolveAsset(opts.asset, chainId, chainNumId, client)
    const amountRaw = parseUnits(opts.amount, asset.decimals)

    const txData = buildAaveRepay({
      chainId: chainNumId,
      asset: asset.address,
      amount: amountRaw,
      onBehalfOf: ownerAccount.address as Address,
      interestRateMode: (opts.interestRateMode ? Number(opts.interestRateMode) : 2) as 1 | 2,
    })

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const { createWalletClient, http } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const rpcUrl = getRpcUrl(config, chainId)
    const account = privateKeyToAccount(privateKey)
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) })

    const approveHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.approveTarget,
      data: txData.approveCalldata,
      value: 0n,
    })
    await client.waitForTransactionReceipt({ hash: approveHash })

    const repayHash = await walletClient.sendTransaction({
      chain: null,
      to: txData.supplyTarget,
      data: txData.supplyCalldata,
      value: 0n,
    })

    return { ok: true, data: { approveTxHash: approveHash, repayTxHash: repayHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}
