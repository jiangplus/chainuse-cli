import {
  createPublicClient,
  http,
  parseAbi,
  encodeFunctionData,
  decodeAbiParameters,
  type PublicClient,
  type Hex,
  type Address,
  type AbiFunction,
} from 'viem'
import { chainIdToNumber } from './utils.js'

export function buildPublicClient(rpcUrl: string, chainId: string): PublicClient {
  const id = chainIdToNumber(chainId)
  return createPublicClient({
    chain: {
      id,
      name: chainId,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  })
}

export async function estimateGas(
  client: PublicClient,
  tx: { from: Address; to: Address; value?: bigint; data?: Hex }
): Promise<bigint> {
  return client.estimateGas({
    account: tx.from,
    to: tx.to,
    value: tx.value ?? 0n,
    data: tx.data,
  })
}

export async function getMaxPriorityFeePerGas(client: PublicClient): Promise<bigint> {
  const feeHistory = await client.estimateFeesPerGas()
  return feeHistory.maxPriorityFeePerGas ?? 1_000_000_000n // fallback 1 gwei
}

export async function getGasPrice(client: PublicClient): Promise<bigint> {
  return client.getGasPrice()
}

export async function getNonce(client: PublicClient, address: Address): Promise<number> {
  return client.getTransactionCount({ address })
}

export async function getBlockBaseFee(client: PublicClient): Promise<bigint> {
  const block = await client.getBlock()
  return block.baseFeePerGas ?? 0n
}

export async function simulateTx(
  client: PublicClient,
  tx: { from: Address; to: Address; value?: bigint; data?: Hex }
): Promise<{ success: boolean; gasUsed: bigint; returnData?: string }> {
  try {
    const gasUsed = await client.estimateGas({
      account: tx.from,
      to: tx.to,
      value: tx.value ?? 0n,
      data: tx.data,
    })
    return { success: true, gasUsed }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, gasUsed: 0n, returnData: message }
  }
}

export async function ethCall(
  client: PublicClient,
  params: {
    to: Address
    data?: Hex
    from?: Address
    value?: bigint
  }
): Promise<Hex> {
  const result = await client.call({
    to: params.to,
    data: params.data,
    account: params.from,
    value: params.value,
  })
  return (result.data ?? '0x') as Hex
}

export async function getStorageAt(
  client: PublicClient,
  address: Address,
  slot: Hex
): Promise<Hex> {
  const result = await client.getStorageAt({ address, slot })
  return (result ?? '0x') as Hex
}

export async function getNativeBalance(client: PublicClient, address: Address): Promise<bigint> {
  return client.getBalance({ address })
}

export async function getERC20Balance(
  client: PublicClient,
  tokenAddress: Address,
  ownerAddress: Address
): Promise<bigint> {
  const erc20Abi = parseAbi([
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ])

  const balance = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [ownerAddress],
  })
  return balance
}

export async function getERC20Metadata(
  client: PublicClient,
  tokenAddress: Address
): Promise<{ symbol: string; decimals: number }> {
  const erc20Abi = parseAbi([
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ])

  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
  ])

  return { symbol: symbol as string, decimals: decimals as number }
}

export async function callContractMethod(
  client: PublicClient,
  params: {
    contract: Address
    method: string
    args: unknown[]
    abiJson?: string
    from?: Address
  }
): Promise<unknown> {
  let abi: AbiFunction[]

  if (params.abiJson) {
    const parsed = JSON.parse(params.abiJson) as unknown[]
    const fragments = Array.isArray(parsed) ? parsed : [parsed]
    const funcFragment = fragments.find(
      (f) =>
        typeof f === 'object' &&
        f !== null &&
        (f as { type?: string }).type === 'function' &&
        (f as { name?: string }).name === params.method.split('(')[0]
    )
    if (!funcFragment) throw new Error(`Method ${params.method} not found in ABI`)
    abi = fragments as AbiFunction[]
  } else {
    // Require signature form: "method(type,type)" or "method(type,type) returns (type)"
    if (params.method.includes('(')) {
      // Parse the signature manually into an ABI fragment
      const parsed = parseMethodSignature(params.method)
      abi = [parsed]
    } else {
      throw new Error(
        `No ABI provided and method "${params.method}" has no type signature. ` +
          `Use "method(type,...)" format or provide --abi file.`
      )
    }
  }

  const funcName = params.method.split('(')[0]
  const hasOutputs = abi[0]?.outputs && abi[0].outputs.length > 0

  if (!hasOutputs) {
    // No output types known — do a raw eth_call and attempt best-effort decode:
    // try ABI-decoded string, then UTF-8 string, then return raw hex.
    const rawHex = await client.call({
      to: params.contract,
      data: encodeFunctionData({ abi, functionName: funcName, args: params.args as readonly unknown[] }),
      account: params.from,
    })
    // Return raw hex. Provide "method(args) returns (type)" signature for typed decoding.
    return rawHex.data ?? '0x'
  }

  const result = await client.readContract({
    address: params.contract,
    abi,
    functionName: funcName,
    args: params.args as readonly unknown[],
    account: params.from,
  })

  return result
}

export async function getTxReceipt(client: PublicClient, hash: Hex) {
  try {
    return await client.getTransactionReceipt({ hash })
  } catch {
    return null
  }
}

export async function getTxByHash(client: PublicClient, hash: Hex) {
  try {
    return await client.getTransaction({ hash })
  } catch {
    return null
  }
}

export async function broadcastTx(client: PublicClient, signedRawTx: Hex): Promise<Hex> {
  return client.sendRawTransaction({ serializedTransaction: signedRawTx })
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse a Solidity method signature string like "transfer(address,uint256)"
 * or "balanceOf(address) returns (uint256)" into a minimal ABI fragment.
 */
function parseMethodSignature(sig: string): AbiFunction {
  // Strip "function " prefix if present
  const s = sig.startsWith('function ') ? sig.slice(9) : sig

  // Split on "returns"
  const [inputPart, returnPart] = s.split(/\s+returns\s+/i)

  const parenIdx = inputPart.indexOf('(')
  const name = inputPart.slice(0, parenIdx).trim()
  const inputsStr = inputPart.slice(parenIdx + 1, inputPart.lastIndexOf(')'))

  const inputs = parseParamList(inputsStr)

  let outputs: { type: string; name: string }[] = []
  if (returnPart) {
    const inner = returnPart.trim().replace(/^\(/, '').replace(/\)$/, '')
    outputs = parseParamList(inner)
  }

  return {
    type: 'function',
    name,
    inputs,
    outputs,
    stateMutability: 'view',
  } as AbiFunction
}

function parseParamList(s: string): { type: string; name: string }[] {
  if (!s.trim()) return []
  return s.split(',').map((p, i) => {
    const parts = p.trim().split(/\s+/)
    return {
      type: parts[0] ?? 'bytes32',
      name: parts[1] ?? `param${i}`,
    }
  })
}
