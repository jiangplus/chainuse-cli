import { isAddress, getAddress, formatUnits } from 'viem'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { getNativeBalance, getERC20Balance, getERC20Metadata } from '../chains/evm/index.js'
import { getAccount, getAccountByAddress } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
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

    if (isAddress(opts.addressOrAlias)) {
      address = getAddress(opts.addressOrAlias)
      // Try to find matching alias
      const account = getAccountByAddress(address)
      alias = account?.alias
    } else {
      // Treat as alias
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
