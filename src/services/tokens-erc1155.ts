import {
  parseAbi,
  encodeFunctionData,
  type PublicClient,
  type Address,
  type Hex,
} from 'viem'

const ERC1155_ABI = parseAbi([
  'function uri(uint256) view returns (string)',
  'function balanceOf(address,uint256) view returns (uint256)',
  'function balanceOfBatch(address[],uint256[]) view returns (uint256[])',
  'function isApprovedForAll(address,address) view returns (bool)',
  'function safeTransferFrom(address,address,uint256,uint256,bytes)',
  'function safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',
  'function setApprovalForAll(address,bool)',
])

export async function getErc1155URI(
  client: PublicClient,
  token: Address,
  id: bigint
): Promise<string> {
  const uri = await client.readContract({
    address: token,
    abi: ERC1155_ABI,
    functionName: 'uri',
    args: [id],
  })
  return uri as string
}

export async function getErc1155Balance(
  client: PublicClient,
  token: Address,
  account: Address,
  id: bigint
): Promise<bigint> {
  const balance = await client.readContract({
    address: token,
    abi: ERC1155_ABI,
    functionName: 'balanceOf',
    args: [account, id],
  })
  return balance as bigint
}

export async function getErc1155BalanceBatch(
  client: PublicClient,
  token: Address,
  accounts: Address[],
  ids: bigint[]
): Promise<bigint[]> {
  const balances = await client.readContract({
    address: token,
    abi: ERC1155_ABI,
    functionName: 'balanceOfBatch',
    args: [accounts, ids],
  })
  return balances as bigint[]
}

export function encodeErc1155Transfer(
  from: Address,
  to: Address,
  id: bigint,
  amount: bigint
): Hex {
  return encodeFunctionData({
    abi: ERC1155_ABI,
    functionName: 'safeTransferFrom',
    args: [from, to, id, amount, '0x'],
  })
}

export function encodeErc1155BatchTransfer(
  from: Address,
  to: Address,
  ids: bigint[],
  amounts: bigint[]
): Hex {
  return encodeFunctionData({
    abi: ERC1155_ABI,
    functionName: 'safeBatchTransferFrom',
    args: [from, to, ids, amounts, '0x'],
  })
}

export function encodeErc1155SetApprovalForAll(operator: Address, approved: boolean): Hex {
  return encodeFunctionData({
    abi: ERC1155_ABI,
    functionName: 'setApprovalForAll',
    args: [operator, approved],
  })
}
