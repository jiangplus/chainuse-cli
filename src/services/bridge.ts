import { Squid } from '@0xsquid/sdk'
import type { Address } from 'viem'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteRequest = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteResponse = any

let _squid: Squid | null = null

async function getSquid(): Promise<Squid> {
  if (_squid) return _squid
  _squid = new Squid({
    baseUrl: 'https://apiplus.squidrouter.com',
    integratorId: process.env.SQUID_INTEGRATOR_ID ?? 'chainuse-v2',
  })
  await _squid.init()
  return _squid
}

export type BridgeQuoteResult = {
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
  value: bigint
  routeId: string
}

export async function quoteBridge(opts: {
  fromChainId: string
  toChainId: string
  fromTokenAddress: string
  toTokenAddress: string
  fromAmount: string
  fromAddress: string
  toAddress: string
  slippageBps?: number
}): Promise<BridgeQuoteResult> {
  const squid = await getSquid()

  // Convert CAIP-2 chain IDs to EVM numeric IDs
  const fromChainNum = opts.fromChainId.startsWith('eip155:')
    ? opts.fromChainId.replace('eip155:', '')
    : opts.fromChainId
  const toChainNum = opts.toChainId.startsWith('eip155:')
    ? opts.toChainId.replace('eip155:', '')
    : opts.toChainId

  const slippage = ((opts.slippageBps ?? 50) / 100).toString()

  const routeRequest: RouteRequest = {
    fromChain: fromChainNum,
    toChain: toChainNum,
    fromToken: opts.fromTokenAddress,
    toToken: opts.toTokenAddress,
    fromAmount: opts.fromAmount,
    fromAddress: opts.fromAddress,
    toAddress: opts.toAddress,
    slippage: Number(slippage),
    enableBoost: true,
  }

  const { route } = await squid.getRoute(routeRequest) as RouteResponse

  const estimate = route.estimate
  const txData = route.transactionRequest

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feeCosts = (estimate.feeCosts ?? []).map((fc: any) => ({
    name: fc.name as string,
    amount: fc.amount as string,
    token: (fc.token as { symbol: string }).symbol,
  }))

  return {
    fromChain: opts.fromChainId,
    toChain: opts.toChainId,
    fromToken: (estimate.fromToken as { symbol: string }).symbol,
    toToken: (estimate.toToken as { symbol: string }).symbol,
    fromAmount: estimate.fromAmount,
    toAmount: estimate.toAmount,
    toAmountMinimum: estimate.toAmountMin,
    estimatedTimeSeconds: estimate.estimatedRouteDuration,
    feeCosts,
    calldata: (txData?.data ?? '0x') as `0x${string}`,
    to: (txData?.target ?? '0x') as Address,
    value: txData?.value ? BigInt(txData.value as string) : 0n,
    routeId: estimate.fromAmount + '-' + Date.now(),
  }
}

export async function getBridgeStatus(opts: {
  transactionHash: string
  fromChainId: string
  toChainId: string
}): Promise<{ status: string; toChainTxHash?: string; error?: string }> {
  const squid = await getSquid()

  const fromChainNum = opts.fromChainId.startsWith('eip155:')
    ? opts.fromChainId.replace('eip155:', '')
    : opts.fromChainId
  const toChainNum = opts.toChainId.startsWith('eip155:')
    ? opts.toChainId.replace('eip155:', '')
    : opts.toChainId

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = await (squid as any).getStatus({
    transactionId: opts.transactionHash,
    fromChainId: fromChainNum,
    toChainId: toChainNum,
  })

  return {
    status: (status as { squidTransactionStatus?: string }).squidTransactionStatus ?? 'unknown',
    toChainTxHash: (status as { toChain?: { transactionId?: string } }).toChain?.transactionId,
  }
}
