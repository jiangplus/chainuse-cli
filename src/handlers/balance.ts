import { isAddress, getAddress, formatUnits } from 'viem'
import { loadConfig, resolveChainFromConfig, resolveNonEvmRpcUrl } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { getNativeBalance, getERC20Balance, getERC20Metadata } from '../chains/evm/index.js'
import { getAccount, getAccountByAddress } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
import { isEvmChain, isSolanaChain, isBitcoinChain, isSuiChain, getBitcoinNetwork, getSuiNetwork } from '../chains/resolve.js'
import { buildSolanaConnection, getSolBalance } from '../chains/solana/index.js'
import { getBtcBalance } from '../chains/btc/index.js'
import { buildSuiClient, getSuiBalance } from '../chains/sui/index.js'
import type { JsonResult } from '../core/types.js'

export type BalanceResult = {
  address: string
  alias?: string
  chain: string
  asset: string
  balance: string
  balanceRaw: string
  symbol: string
  decimals: number
}

export async function handleBalance(opts: {
  addressOrAlias: string
  chain?: string
  token?: string
}): Promise<JsonResult<BalanceResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)

    // Resolve address from alias or raw address
    let address: string
    let alias: string | undefined

    if (isEvmChain(chainId)) {
      // EVM: validate as hex address
      if (isAddress(opts.addressOrAlias)) {
        address = getAddress(opts.addressOrAlias)
        const account = getAccountByAddress(address)
        alias = account?.alias
      } else {
        const account = getAccount(opts.addressOrAlias)
        if (!account) {
          return {
            ok: false,
            error: {
              code: ErrorCode.ALIAS_NOT_FOUND,
              message: `No account with alias "${opts.addressOrAlias}"`,
              hint: 'Run "chain keys list" to see available accounts',
            },
          }
        }
        address = account.address
        alias = account.alias
      }
    } else {
      // Non-EVM: look up by alias, or use raw address string
      if (isAddress(opts.addressOrAlias)) {
        // It's an EVM-looking address but we're on a non-EVM chain; try lookup anyway
        address = opts.addressOrAlias
        const account = getAccountByAddress(address)
        alias = account?.alias
      } else {
        // Try as alias first
        const account = getAccount(opts.addressOrAlias)
        if (account) {
          address = account.address
          alias = account.alias
        } else {
          // Treat as raw address for the chain
          address = opts.addressOrAlias
        }
      }
    }

    // ─── Solana ───────────────────────────────────────────────────────────────
    if (isSolanaChain(chainId)) {
      const rpcUrl = resolveNonEvmRpcUrl(config, chainId)
      const conn = buildSolanaConnection(rpcUrl)
      const { lamports, sol } = await getSolBalance(conn, address)
      return {
        ok: true,
        data: {
          address,
          alias,
          chain: chainId,
          asset: opts.token ?? 'native',
          balance: sol,
          balanceRaw: lamports.toString(),
          symbol: 'SOL',
          decimals: 9,
        },
      }
    }

    // ─── Bitcoin ──────────────────────────────────────────────────────────────
    if (isBitcoinChain(chainId)) {
      const network = getBitcoinNetwork(chainId)
      const { total, formatted } = await getBtcBalance(address, network)
      return {
        ok: true,
        data: {
          address,
          alias,
          chain: chainId,
          asset: opts.token ?? 'native',
          balance: formatted,
          balanceRaw: total.toString(),
          symbol: 'BTC',
          decimals: 8,
        },
      }
    }

    // ─── Sui ─────────────────────────────────────────────────────────────────
    if (isSuiChain(chainId)) {
      const rpcUrl = resolveNonEvmRpcUrl(config, chainId)
      const suiNetwork = getSuiNetwork(chainId)
      const client = buildSuiClient(rpcUrl, suiNetwork)
      const { balance, formatted } = await getSuiBalance(client, address)
      return {
        ok: true,
        data: {
          address,
          alias,
          chain: chainId,
          asset: opts.token ?? 'native',
          balance: formatted,
          balanceRaw: balance.toString(),
          symbol: 'SUI',
          decimals: 9,
        },
      }
    }

    // ─── EVM (default) ───────────────────────────────────────────────────────
    const client = buildProvider(config, chainId)
    const token = opts.token ?? 'native'

    if (token === 'native') {
      const raw = await getNativeBalance(client, address as `0x${string}`)
      return {
        ok: true,
        data: {
          address,
          alias,
          chain: chainId,
          asset: 'native',
          balance: formatUnits(raw, 18),
          balanceRaw: raw.toString(),
          symbol: 'ETH',
          decimals: 18,
        },
      }
    } else {
      // ERC-20
      if (!isAddress(token)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.INVALID_ADDRESS,
            message: `Invalid ERC-20 token address: ${token}`,
          },
        }
      }
      const tokenAddr = getAddress(token) as `0x${string}`
      const [raw, meta] = await Promise.all([
        getERC20Balance(client, tokenAddr, address as `0x${string}`),
        getERC20Metadata(client, tokenAddr),
      ])
      return {
        ok: true,
        data: {
          address,
          alias,
          chain: chainId,
          asset: tokenAddr,
          balance: formatUnits(raw, meta.decimals),
          balanceRaw: raw.toString(),
          symbol: meta.symbol,
          decimals: meta.decimals,
        },
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('RPC')
    return {
      ok: false,
      error: {
        code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
        message: msg,
      },
    }
  }
}
