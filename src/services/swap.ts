import {
  type Address,
  type Hex,
  type PublicClient,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem'

// ─── V4 Contract Addresses ───────────────────────────────────────────────────
// Source: @uniswap/sdk-core CHAIN_TO_ADDRESSES_MAP

// Universal Router V2_1_1 addresses per chain (V4-capable)
const UNIVERSAL_ROUTER_V4: Record<number, Address> = {
  1:        '0x4C82D1fBFe28C977cBB58D8C7FF8FCF9F70a2cCA',
  10:       '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  56:       '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  137:      '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  8453:     '0xfdf682f51fe81aa4898f0ae2163d8a55c127fbc7',
  42161:    '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  11155111: '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  421614:   '0x8B844f885672f333Bc0042cB669255f93a4C1E6b',
  84532:    '0x492e6456d9528771018deb9e87ef7750ef184104',
}

const V4_QUOTER_ADDRESSES: Record<number, Address> = {
  1:        '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
  10:       '0x1f3131a13296fb91c90870043742c3cdbff1a8d7',
  56:       '0x9f75dd27d6664c475b90e105573e550ff69437b0',
  137:      '0xb3d5c3dfc3a7aebff71895a7191796bffc2c81b9',
  8453:     '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
  42161:    '0x3972c00f7ed4885e145823eb7c655375d275a1c5',
  43114:    '0xbe40675bb704506a3c2ccfb762dcfd1e979845c2',
  59144:    '0x2c125569c0bee20a66e33e5491c552b37ebd9934',
  81457:    '0x6f71cdcb0d119ff72c6eb501abceb576fbf62bcf',
  84532:    '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
  11155111: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227',
  421614:   '0x7de51022d70a725b508085468052e25e22b5c4c9',
}

// Standard tick spacings per fee tier
const FEE_TO_TICK_SPACING: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
}

// Fee tiers to try (most common first)
const FEE_TIERS = [3000, 500, 10000, 100]

const V4_QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

// Universal Router V4 swap via EXECUTE (V4_SWAP command)
// Command byte for V4_SWAP = 0x10
const COMMAND_V4_SWAP = '0x10'

export type TokenInfo = {
  address: Address
  decimals: number
  symbol: string
}

export type SwapQuoteResult = {
  amountIn: string
  amountOut: string
  amountOutMinimum: string
  slippageBps: number
  fee: number
  route: string
  calldata: Hex
  to: Address
  value: bigint
}

function sortTokens(a: Address, b: Address): [Address, Address] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]
}

export async function quoteAndBuildSwap(opts: {
  client: PublicClient
  chainId: number
  tokenIn: TokenInfo
  tokenOut: TokenInfo
  amountIn: string
  slippageBps?: number
  recipient: Address
  deadline?: number
}): Promise<SwapQuoteResult> {
  const slippageBps = opts.slippageBps ?? 50
  const amountInRaw = parseUnits(opts.amountIn, opts.tokenIn.decimals)
  const quoterAddress = V4_QUOTER_ADDRESSES[opts.chainId]
  if (!quoterAddress) {
    throw new Error(`Uniswap V4 Quoter not available on chain ${opts.chainId}`)
  }

  const [currency0, currency1] = sortTokens(opts.tokenIn.address, opts.tokenOut.address)
  const zeroForOne = opts.tokenIn.address.toLowerCase() === currency0.toLowerCase()

  let bestQuote: { amountOut: bigint; fee: number } | null = null

  for (const fee of FEE_TIERS) {
    const tickSpacing = FEE_TO_TICK_SPACING[fee]
    const calldata = encodeFunctionData({
      abi: V4_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          poolKey: {
            currency0,
            currency1,
            fee,
            tickSpacing,
            hooks: '0x0000000000000000000000000000000000000000',
          },
          zeroForOne,
          exactAmount: amountInRaw as bigint,
          sqrtPriceLimitX96: 0n,
          hookData: '0x',
        },
      ],
    })

    try {
      const raw = await opts.client.call({
        to: quoterAddress,
        data: calldata,
      })
      if (!raw.data || raw.data === '0x') continue
      const amountOut = BigInt('0x' + raw.data.slice(2, 66))
      if (!bestQuote || amountOut > bestQuote.amountOut) {
        bestQuote = { amountOut, fee }
      }
    } catch {
      // pool not found or no liquidity, try next fee tier
    }
  }

  if (!bestQuote) {
    throw new Error(
      `No Uniswap V4 pool with liquidity found for ${opts.tokenIn.symbol}/${opts.tokenOut.symbol} on chain ${opts.chainId}`
    )
  }

  const amountOutMinimum = (bestQuote.amountOut * BigInt(10000 - slippageBps)) / 10000n
  const tickSpacing = FEE_TO_TICK_SPACING[bestQuote.fee]
  const deadline = opts.deadline ?? Math.floor(Date.now() / 1000) + 1800

  const universalRouterAddr = UNIVERSAL_ROUTER_V4[opts.chainId]
  if (!universalRouterAddr) {
    throw new Error(`Uniswap V4 Universal Router not available on chain ${opts.chainId}`)
  }

  // Build V4_SWAP action via Universal Router
  // Actions.SWAP_EXACT_IN_SINGLE = 0x06
  // Actions.SETTLE_ALL = 0x13
  // Actions.TAKE_ALL = 0x14
  const SWAP_EXACT_IN_SINGLE = 0x06
  const SETTLE_ALL = 0x13
  const TAKE_ALL = 0x14

  const poolKey = {
    currency0,
    currency1,
    fee: bestQuote.fee,
    tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  }

  // Encode V4Planner actions
  const v4Actions = `0x${SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, '0')}${SETTLE_ALL.toString(16).padStart(2, '0')}${TAKE_ALL.toString(16).padStart(2, '0')}`

  const swapParams = encodeAbiParameters(
    parseAbiParameters([
      '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey',
      'bool zeroForOne',
      'uint128 amountIn',
      'uint128 amountOutMinimum',
      'uint160 sqrtPriceLimitX96',
      'bytes hookData',
    ].join(',')),
    [
      poolKey as { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address },
      zeroForOne,
      amountInRaw as unknown as bigint,
      amountOutMinimum as unknown as bigint,
      0n,
      '0x' as Hex,
    ]
  )

  const settleParams = encodeAbiParameters(
    parseAbiParameters('address currency, uint256 maxAmount'),
    [opts.tokenIn.address, amountInRaw]
  )

  const takeParams = encodeAbiParameters(
    parseAbiParameters('address currency, address recipient, uint256 minAmount'),
    [opts.tokenOut.address, opts.recipient, amountOutMinimum]
  )

  const v4Inputs = encodeAbiParameters(
    parseAbiParameters('bytes actions, bytes[] params'),
    [v4Actions as Hex, [swapParams, settleParams, takeParams]]
  )

  // Universal Router execute(bytes commands, bytes[] inputs, uint256 deadline)
  const calldata = encodeFunctionData({
    abi: [
      {
        name: 'execute',
        type: 'function',
        stateMutability: 'payable',
        inputs: [
          { name: 'commands', type: 'bytes' },
          { name: 'inputs', type: 'bytes[]' },
          { name: 'deadline', type: 'uint256' },
        ],
        outputs: [],
      },
    ] as const,
    functionName: 'execute',
    args: [
      COMMAND_V4_SWAP as Hex,
      [v4Inputs],
      BigInt(deadline),
    ],
  })

  return {
    amountIn: opts.amountIn,
    amountOut: formatUnits(bestQuote.amountOut, opts.tokenOut.decimals),
    amountOutMinimum: formatUnits(amountOutMinimum, opts.tokenOut.decimals),
    slippageBps,
    fee: bestQuote.fee,
    route: `${opts.tokenIn.symbol} → ${opts.tokenOut.symbol} (${bestQuote.fee / 10000}% fee)`,
    calldata,
    to: universalRouterAddr,
    value: 0n,
  }
}
