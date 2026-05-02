import { isAddress, getAddress, parseUnits, type Address } from 'viem'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import { listAccounts } from '../state/index.js'
import { chainIdToNumber } from '../chains/evm/utils.js'
// getNonce/broadcastTx available for future use
import { resolveTokenAddress, getTokenDecimals, getTokenSymbol } from '../registries/tokens.js'
import { quoteAndBuildSwap } from '../services/swap.js'
import { quoteBridge, getBridgeStatus } from '../services/bridge.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'
import type { SwapQuoteResult } from '../services/swap.js'

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

async function resolveToken(tokenStr: string, chainId: string, client: ReturnType<typeof buildProvider>): Promise<{ address: Address; decimals: number; symbol: string }> {
  // Try registry first, then treat as address
  const chainNum = chainIdToNumber(chainId)
  const resolved = resolveTokenAddress(tokenStr, chainNum)
  const address = resolved ?? (isAddress(tokenStr) ? getAddress(tokenStr) as Address : null)
  if (!address) throw new Error(`Unknown token: ${tokenStr}. Use a token symbol (e.g. USDC) or address.`)

  const decimals = await getTokenDecimals(client, address)
  const symbol = await getTokenSymbol(client, address)

  return { address, decimals, symbol }
}

// ─── swap quote ──────────────────────────────────────────────────────────────

export async function handleSwapQuote(opts: {
  from: string
  to: string
  amount: string
  ownerAlias: string
  recipient?: string
  chain?: string
  slippageBps?: number
}): Promise<JsonResult<SwapQuoteResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` },
      }
    }

    const recipient = opts.recipient
      ? (isAddress(opts.recipient) ? getAddress(opts.recipient) as Address : null)
      : (ownerAccount.address as Address)

    if (!recipient) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid recipient address: ${opts.recipient}` } }
    }

    const client = buildProvider(config, chainId)
    const tokenIn = await resolveToken(opts.from, chainId, client)
    const tokenOut = await resolveToken(opts.to, chainId, client)

    const result = await quoteAndBuildSwap({
      client,
      chainId: chainNumId,
      tokenIn,
      tokenOut,
      amountIn: opts.amount,
      slippageBps: opts.slippageBps,
      recipient,
    })

    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── swap execute ─────────────────────────────���───────────────────────────────

export async function handleSwapExecute(opts: {
  from: string
  to: string
  amount: string
  ownerAlias: string
  recipient?: string
  chain?: string
  slippageBps?: number
}): Promise<JsonResult<{ hash: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainNumId = chainIdToNumber(chainId)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` },
      }
    }

    const recipient = opts.recipient
      ? (isAddress(opts.recipient) ? getAddress(opts.recipient) as Address : null)
      : (ownerAccount.address as Address)

    if (!recipient) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid recipient address: ${opts.recipient}` } }
    }

    const client = buildProvider(config, chainId)
    const tokenIn = await resolveToken(opts.from, chainId, client)
    const tokenOut = await resolveToken(opts.to, chainId, client)

    const quote = await quoteAndBuildSwap({
      client,
      chainId: chainNumId,
      tokenIn,
      tokenOut,
      amountIn: opts.amount,
      slippageBps: opts.slippageBps,
      recipient,
    })

    // ERC-20 approval first
    const { encodeFunctionData } = await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const { createWalletClient, http } = await import('viem')

    const privateKey = await resolvePrivateKey(opts.ownerAlias)
    const account = privateKeyToAccount(privateKey)
    const rpcUrl = getRpcUrl(config, chainId)

    // Approve Universal Router to spend tokenIn
    const amountInRaw = parseUnits(opts.amount, tokenIn.decimals)
    const approveCalldata = encodeFunctionData({
      abi: [
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ] as const,
      functionName: 'approve',
      args: [quote.to, amountInRaw],
    })

    const walletClient = createWalletClient({ account, transport: http(rpcUrl) })

    // Send approve tx
    const approveHash = await walletClient.sendTransaction({
      chain: null,
      to: tokenIn.address,
      data: approveCalldata,
      value: 0n,
    })

    // Wait for approve to be mined
    await client.waitForTransactionReceipt({ hash: approveHash })

    // Send swap tx
    const swapHash = await walletClient.sendTransaction({
      chain: null,
      to: quote.to,
      data: quote.calldata,
      value: quote.value,
    })

    return { ok: true, data: { hash: swapHash } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED')
    return {
      ok: false,
      error: {
        code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
        message: msg,
      },
    }
  }
}

// ─── bridge quote ───────────────────────────────��─────────────────────────────

export async function handleBridgeQuote(opts: {
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  amount: string
  ownerAlias: string
  toAddress?: string
  slippageBps?: number
}): Promise<JsonResult<{
  fromChain: string
  toChain: string
  fromToken: string
  toToken: string
  fromAmount: string
  toAmount: string
  toAmountMinimum: string
  estimatedTimeSeconds: number
  feeCosts: Array<{ name: string; amount: string; token: string }>
  calldata: `0x${string}`
  to: Address
  value: string
}>> {
  try {
    const config = loadConfig()
    const fromChainId = resolveChainFromConfig(config, opts.fromChain)
    const toChainId = opts.toChain.startsWith('eip155:')
      ? opts.toChain
      : resolveChainFromConfig(config, opts.toChain)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account not found: ${opts.ownerAlias}` },
      }
    }

    const fromChainNum = chainIdToNumber(fromChainId)
    const toChainNum = chainIdToNumber(toChainId)

    const client = buildProvider(config, fromChainId)
    const fromToken = await resolveToken(opts.fromToken, fromChainId, client)

    // For toToken, create a basic provider for the destination chain if available
    const toTokenAddress = resolveTokenAddress(opts.toToken, toChainNum)
      ?? (isAddress(opts.toToken) ? getAddress(opts.toToken) : null)
    if (!toTokenAddress) {
      return { ok: false, error: { code: ErrorCode.INVALID_ADDRESS, message: `Unknown token: ${opts.toToken}` } }
    }

    const fromAmountRaw = parseUnits(opts.amount, fromToken.decimals)
    void toChainNum // used below in resolveTokenAddress

    const result = await quoteBridge({
      fromChainId: fromChainId.replace('eip155:', ''),
      toChainId: toChainId.replace('eip155:', ''),
      fromTokenAddress: fromToken.address,
      toTokenAddress,
      fromAmount: fromAmountRaw.toString(),
      fromAddress: ownerAccount.address,
      toAddress: opts.toAddress ?? ownerAccount.address,
      slippageBps: opts.slippageBps,
    })

    return {
      ok: true,
      data: {
        ...result,
        value: result.value.toString(),
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}

// ─── bridge status ──────────────��───────────────────────────���──────────────────

export async function handleBridgeStatus(opts: {
  txHash: string
  fromChain: string
  toChain: string
}): Promise<JsonResult<{ status: string; toChainTxHash?: string }>> {
  try {
    const config = loadConfig()
    const fromChainId = resolveChainFromConfig(config, opts.fromChain)
    const toChainId = opts.toChain.startsWith('eip155:')
      ? opts.toChain
      : resolveChainFromConfig(config, opts.toChain)

    const result = await getBridgeStatus({
      transactionHash: opts.txHash,
      fromChainId: fromChainId.replace('eip155:', ''),
      toChainId: toChainId.replace('eip155:', ''),
    })

    return { ok: true, data: result }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.PROVIDER_ERROR, message: msg } }
  }
}
