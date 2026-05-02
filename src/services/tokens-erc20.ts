import {
  parseAbi,
  encodeFunctionData,
  formatUnits,
  parseUnits,
  maxUint256,
  getAddress,
  type PublicClient,
  type Address,
  type Hex,
} from 'viem'

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
])

export async function getErc20Info(
  client: PublicClient,
  token: Address
): Promise<{ name: string; symbol: string; decimals: number; totalSupply: bigint }> {
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'name' }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'totalSupply' }),
  ])
  return {
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
    totalSupply: totalSupply as bigint,
  }
}

export async function getErc20Balance(
  client: PublicClient,
  token: Address,
  account: Address
): Promise<{ balance: bigint; formatted: string; symbol: string; decimals: number }> {
  const [balance, symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [account] }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
  ])
  const bal = balance as bigint
  const dec = decimals as number
  return {
    balance: bal,
    formatted: formatUnits(bal, dec),
    symbol: symbol as string,
    decimals: dec,
  }
}

export async function getErc20Allowance(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address
): Promise<{ allowance: bigint; formatted: string }> {
  const [allowance, decimals] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender] }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
  ])
  const al = allowance as bigint
  const dec = decimals as number
  return {
    allowance: al,
    formatted: formatUnits(al, dec),
  }
}

export function encodeErc20Transfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [to, amount],
  })
}

export function encodeErc20Approve(spender: Address, amount: bigint | 'max'): Hex {
  const value = amount === 'max' ? maxUint256 : amount
  return encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, value],
  })
}

export function parseTokenAmount(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals)
}
