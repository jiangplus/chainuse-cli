import {
  parseAbi,
  encodeFunctionData,
  type PublicClient,
  type Address,
  type Hex,
} from 'viem'
import { getEnsAddress, getEnsName, normalize, namehash } from 'viem/ens'

// ENS mainnet contract addresses
const ENS_REVERSE_REGISTRAR = '0xa58E81fe9b61B5c3fE2AFD33CF304c454AbFc7Cb' as Address
const ENS_PUBLIC_RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63' as Address

const REVERSE_REGISTRAR_ABI = parseAbi([
  'function setName(string) returns (bytes32)',
])

const PUBLIC_RESOLVER_ABI = parseAbi([
  'function setText(bytes32,string,string)',
])

export async function resolveEns(
  client: PublicClient,
  name: string
): Promise<string | null> {
  try {
    const normalized = normalize(name)
    const address = await getEnsAddress(client, { name: normalized })
    return address ?? null
  } catch {
    return null
  }
}

export async function reverseResolveEns(
  client: PublicClient,
  address: string
): Promise<string | null> {
  try {
    const name = await getEnsName(client, { address: address as Address })
    return name ?? null
  } catch {
    return null
  }
}

export function encodeSetPrimaryName(name: string): { to: Address; data: Hex } {
  const normalizedName = normalize(name)
  const data = encodeFunctionData({
    abi: REVERSE_REGISTRAR_ABI,
    functionName: 'setName',
    args: [normalizedName],
  })
  return { to: ENS_REVERSE_REGISTRAR, data }
}

export function encodeSetRecord(
  node: Hex,
  key: string,
  value: string
): { to: Address; data: Hex } {
  const data = encodeFunctionData({
    abi: PUBLIC_RESOLVER_ABI,
    functionName: 'setText',
    args: [node, key, value],
  })
  return { to: ENS_PUBLIC_RESOLVER, data }
}

export function ensNamehash(name: string): Hex {
  return namehash(normalize(name)) as Hex
}
