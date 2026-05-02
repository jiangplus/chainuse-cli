import {
  type Address,
  type Hex,
  type PublicClient,
  encodeFunctionData,
  parseUnits,
  formatUnits,
} from 'viem'

// Aave V3 Pool addresses per chain
const AAVE_V3_POOL: Record<number, Address> = {
  1: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',        // Ethereum mainnet
  8453: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',      // Base
  42161: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',     // Arbitrum
  10: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',        // Optimism
  137: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',       // Polygon
  43114: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',     // Avalanche
}

const AAVE_V3_POOL_DATA_PROVIDER: Record<number, Address> = {
  1: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
  8453: '0x2d8A3C5677189723C4cB8873CfC9C8976dfe292E',
  42161: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  10: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  137: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  43114: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
}

// ERC-20 approve ABI
const ERC20_APPROVE_ABI = [
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
] as const

const POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'borrow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'referralCode', type: 'uint16' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'repay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'interestRateMode', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' },
    ],
  },
] as const

const DATA_PROVIDER_ABI = [
  {
    name: 'getUserReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [
      { name: 'currentATokenBalance', type: 'uint256' },
      { name: 'currentStableDebt', type: 'uint256' },
      { name: 'currentVariableDebt', type: 'uint256' },
      { name: 'principalStableDebt', type: 'uint256' },
      { name: 'scaledVariableDebt', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'stableRateLastUpdated', type: 'uint40' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
    ],
  },
] as const

const HEALTH_FACTOR_DECIMALS = 18
const WAD = 10n ** 18n

export type AaveAccountData = {
  totalCollateralUsd: string
  totalDebtUsd: string
  availableBorrowsUsd: string
  currentLiquidationThreshold: string
  ltv: string
  healthFactor: string
}

export type AaveReserveData = {
  currentATokenBalance: string
  currentVariableDebt: string
  currentStableDebt: string
  liquidityRate: string
  usageAsCollateralEnabled: boolean
}

export async function getAaveAccountData(opts: {
  client: PublicClient
  chainId: number
  userAddress: Address
}): Promise<AaveAccountData> {
  const poolAddr = AAVE_V3_POOL[opts.chainId]
  if (!poolAddr) throw new Error(`Aave V3 not available on chain ${opts.chainId}`)

  const result = await opts.client.readContract({
    address: poolAddr,
    abi: POOL_ABI,
    functionName: 'getUserAccountData',
    args: [opts.userAddress],
  })

  const [totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor] =
    result as [bigint, bigint, bigint, bigint, bigint, bigint]

  // Base amounts are in USD with 8 decimals (USD base currency)
  const formatUsd = (v: bigint) => formatUnits(v, 8)
  const formatBps = (v: bigint) => `${Number(v) / 100}%`
  const hf =
    healthFactor === BigInt('0x' + 'f'.repeat(64))
      ? '∞'
      : formatUnits(healthFactor, HEALTH_FACTOR_DECIMALS)

  return {
    totalCollateralUsd: formatUsd(totalCollateralBase),
    totalDebtUsd: formatUsd(totalDebtBase),
    availableBorrowsUsd: formatUsd(availableBorrowsBase),
    currentLiquidationThreshold: formatBps(currentLiquidationThreshold),
    ltv: formatBps(ltv),
    healthFactor: hf,
  }
}

export async function getAaveReserveData(opts: {
  client: PublicClient
  chainId: number
  asset: Address
  userAddress: Address
  decimals: number
}): Promise<AaveReserveData> {
  const providerAddr = AAVE_V3_POOL_DATA_PROVIDER[opts.chainId]
  if (!providerAddr) throw new Error(`Aave V3 data provider not available on chain ${opts.chainId}`)

  const result = await opts.client.readContract({
    address: providerAddr,
    abi: DATA_PROVIDER_ABI,
    functionName: 'getUserReserveData',
    args: [opts.asset, opts.userAddress],
  })

  const [currentATokenBalance, currentStableDebt, currentVariableDebt, , , , liquidityRate, , usageAsCollateralEnabled] =
    result as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean]

  return {
    currentATokenBalance: formatUnits(currentATokenBalance, opts.decimals),
    currentVariableDebt: formatUnits(currentVariableDebt, opts.decimals),
    currentStableDebt: formatUnits(currentStableDebt, opts.decimals),
    // liquidityRate is in ray (27 decimals), convert to APY approximate
    liquidityRate: `${(Number(formatUnits(liquidityRate, 27)) * 100).toFixed(4)}%`,
    usageAsCollateralEnabled,
  }
}

export type AaveSupplyCalldata = {
  approveCalldata: Hex
  approveTarget: Address
  supplyCalldata: Hex
  supplyTarget: Address
}

export function buildAaveSupply(opts: {
  chainId: number
  asset: Address
  amount: bigint
  onBehalfOf: Address
}): AaveSupplyCalldata {
  const poolAddr = AAVE_V3_POOL[opts.chainId]
  if (!poolAddr) throw new Error(`Aave V3 not available on chain ${opts.chainId}`)

  const approveCalldata = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [poolAddr, opts.amount],
  })

  const supplyCalldata = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'supply',
    args: [opts.asset, opts.amount, opts.onBehalfOf, 0],
  })

  return {
    approveCalldata,
    approveTarget: opts.asset,
    supplyCalldata,
    supplyTarget: poolAddr,
  }
}

export function buildAaveWithdraw(opts: {
  chainId: number
  asset: Address
  amount: bigint
  to: Address
}): { calldata: Hex; target: Address } {
  const poolAddr = AAVE_V3_POOL[opts.chainId]
  if (!poolAddr) throw new Error(`Aave V3 not available on chain ${opts.chainId}`)

  const calldata = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'withdraw',
    args: [opts.asset, opts.amount, opts.to],
  })

  return { calldata, target: poolAddr }
}

export function buildAaveBorrow(opts: {
  chainId: number
  asset: Address
  amount: bigint
  onBehalfOf: Address
  interestRateMode?: 1 | 2
}): { calldata: Hex; target: Address } {
  const poolAddr = AAVE_V3_POOL[opts.chainId]
  if (!poolAddr) throw new Error(`Aave V3 not available on chain ${opts.chainId}`)

  const calldata = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'borrow',
    args: [opts.asset, opts.amount, BigInt(opts.interestRateMode ?? 2), 0, opts.onBehalfOf],
  })

  return { calldata, target: poolAddr }
}

export function buildAaveRepay(opts: {
  chainId: number
  asset: Address
  amount: bigint
  onBehalfOf: Address
  interestRateMode?: 1 | 2
}): AaveSupplyCalldata {
  const poolAddr = AAVE_V3_POOL[opts.chainId]
  if (!poolAddr) throw new Error(`Aave V3 not available on chain ${opts.chainId}`)

  const approveCalldata = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [poolAddr, opts.amount],
  })

  const repayCalldata = encodeFunctionData({
    abi: POOL_ABI,
    functionName: 'repay',
    args: [opts.asset, opts.amount, BigInt(opts.interestRateMode ?? 2), opts.onBehalfOf],
  })

  return {
    approveCalldata,
    approveTarget: opts.asset,
    supplyCalldata: repayCalldata,
    supplyTarget: poolAddr,
  }
}
