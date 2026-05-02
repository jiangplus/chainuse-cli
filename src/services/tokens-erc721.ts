import {
  parseAbi,
  encodeFunctionData,
  type PublicClient,
  type Address,
  type Hex,
} from 'viem'

const ERC721_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function ownerOf(uint256) view returns (address)',
  'function tokenURI(uint256) view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function isApprovedForAll(address,address) view returns (bool)',
  'function safeTransferFrom(address,address,uint256)',
  'function setApprovalForAll(address,bool)',
])

export async function getErc721Info(
  client: PublicClient,
  token: Address
): Promise<{ name: string; symbol: string }> {
  const [name, symbol] = await Promise.all([
    client.readContract({ address: token, abi: ERC721_ABI, functionName: 'name' }),
    client.readContract({ address: token, abi: ERC721_ABI, functionName: 'symbol' }),
  ])
  return { name: name as string, symbol: symbol as string }
}

export async function getErc721Owner(
  client: PublicClient,
  token: Address,
  tokenId: bigint
): Promise<string> {
  const owner = await client.readContract({
    address: token,
    abi: ERC721_ABI,
    functionName: 'ownerOf',
    args: [tokenId],
  })
  return owner as string
}

export async function getErc721TokenURI(
  client: PublicClient,
  token: Address,
  tokenId: bigint
): Promise<string> {
  const uri = await client.readContract({
    address: token,
    abi: ERC721_ABI,
    functionName: 'tokenURI',
    args: [tokenId],
  })
  return uri as string
}

export async function getErc721Balance(
  client: PublicClient,
  token: Address,
  account: Address
): Promise<bigint> {
  const balance = await client.readContract({
    address: token,
    abi: ERC721_ABI,
    functionName: 'balanceOf',
    args: [account],
  })
  return balance as bigint
}

export function encodeErc721Transfer(from: Address, to: Address, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: ERC721_ABI,
    functionName: 'safeTransferFrom',
    args: [from, to, tokenId],
  })
}

export function encodeErc721SetApprovalForAll(operator: Address, approved: boolean): Hex {
  return encodeFunctionData({
    abi: ERC721_ABI,
    functionName: 'setApprovalForAll',
    args: [operator, approved],
  })
}
