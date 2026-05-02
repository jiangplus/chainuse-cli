import { isAddress, getAddress, type Address } from 'viem'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { getPrice } from '../services/price-chainlink.js'
import { CHAINLINK_FEEDS } from '../registries/chainlink-feeds.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'

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

function resolveFeedAddress(feedInput: string, chainId: string): Address | null {
  // Check if it's a raw address
  if (isAddress(feedInput)) {
    return getAddress(feedInput) as Address
  }
  // Look up in registry
  const feed = feedInput as string
  const chainFeeds: Record<string, string> | undefined = CHAINLINK_FEEDS[chainId]
  if (!chainFeeds) return null
  const addr = chainFeeds[feed.toUpperCase()] ?? chainFeeds[feed]
  return addr ? (addr as Address) : null
}

export async function handlePrice(opts: {
  feed: string
  chain?: string
}): Promise<JsonResult<{
  feed: string
  description: string
  price: string
  decimals: number
  updatedAt: number
  chain: string
}>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const feedAddress = resolveFeedAddress(opts.feed, chainId)

    if (!feedAddress) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_ADDRESS,
          message: `Unknown feed "${opts.feed}" for chain ${chainId}. Use a raw 0x address or run "chain price feeds --chain ${chainId}" to see available pairs.`,
        },
      }
    }

    const client = buildProvider(config, chainId)
    const result = await getPrice(client, feedAddress)

    return {
      ok: true,
      data: {
        feed: opts.feed,
        description: result.description,
        price: result.price,
        decimals: result.decimals,
        updatedAt: result.updatedAt,
        chain: chainId,
      },
    }
  } catch (err) {
    return catchError(err)
  }
}

export async function handlePriceFeeds(opts: {
  chain?: string
}): Promise<JsonResult<Array<{ pair: string; feed: string; chain: string }>>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const chainFeeds = CHAINLINK_FEEDS[chainId]

    if (!chainFeeds) {
      return {
        ok: true,
        data: [],
      }
    }

    const feeds = Object.entries(chainFeeds).map(([pair, feed]) => ({
      pair,
      feed,
      chain: chainId,
    }))

    return { ok: true, data: feeds }
  } catch (err) {
    return catchError(err)
  }
}
