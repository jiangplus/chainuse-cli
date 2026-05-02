import {
  parseAbi,
  formatUnits,
  isAddress,
  type PublicClient,
  type Address,
} from 'viem'

const AGGREGATOR_ABI = parseAbi([
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
])

export type PriceResult = {
  price: string
  decimals: number
  description: string
  updatedAt: number
  raw: bigint
}

export async function getPrice(
  client: PublicClient,
  feedAddress: Address
): Promise<PriceResult> {
  const [latestRoundData, decimals, description] = await Promise.all([
    client.readContract({
      address: feedAddress,
      abi: AGGREGATOR_ABI,
      functionName: 'latestRoundData',
    }),
    client.readContract({
      address: feedAddress,
      abi: AGGREGATOR_ABI,
      functionName: 'decimals',
    }),
    client.readContract({
      address: feedAddress,
      abi: AGGREGATOR_ABI,
      functionName: 'description',
    }),
  ])

  const [, answer, , updatedAt] = latestRoundData as [bigint, bigint, bigint, bigint, bigint]
  const dec = decimals as number
  const desc = description as string

  return {
    price: formatUnits(answer, dec),
    decimals: dec,
    description: desc,
    updatedAt: Number(updatedAt),
    raw: answer,
  }
}
