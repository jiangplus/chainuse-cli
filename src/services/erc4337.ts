import {
  http,
  createPublicClient,
  type Chain,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, sepolia, base, optimism, arbitrum, polygon } from 'viem/chains'
import {
  createSmartAccountClient,
  type SmartAccountClient,
} from 'permissionless/clients'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { toSafeSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { entryPoint07Address } from 'viem/account-abstraction'
import { ErrorCode } from '../core/errors.js'

export type SmartAccountConfig = {
  factory: 'simple' | 'kernel' | 'safe'
  ownerAddress: string
  chainId: string
  bundlerUrl: string
  paymasterUrl?: string
}

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  8453: base,
  10: optimism,
  42161: arbitrum,
  137: polygon,
}

function resolveChain(chainId: string): Chain {
  // chainId may be like 'eip155:1' or just '1'
  const numStr = chainId.includes(':') ? chainId.split(':')[1] : chainId
  const num = parseInt(numStr, 10)
  const chain = CHAIN_MAP[num]
  if (!chain) {
    // Return a minimal chain shape
    return {
      id: num,
      name: `chain-${num}`,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [] } },
    }
  }
  return chain
}

function extractChainNumber(chainId: string): number {
  const numStr = chainId.includes(':') ? chainId.split(':')[1] : chainId
  return parseInt(numStr, 10)
}

async function buildSmartAccountClient(
  config: SmartAccountConfig,
  ownerPrivateKey: Hex
): Promise<{ smartAccountClient: SmartAccountClient; address: string }> {
  if (config.factory === 'kernel') {
    throw Object.assign(new Error('kernel factory not supported in M4'), {
      code: ErrorCode.PROVIDER_ERROR,
    })
  }

  const chain = resolveChain(config.chainId)
  const ownerAccount = privateKeyToAccount(ownerPrivateKey)

  const publicClient = createPublicClient({
    chain,
    transport: http(config.bundlerUrl),
  })

  const entryPoint = {
    address: entryPoint07Address,
    version: '0.7' as const,
  }

  let smartAccount: Awaited<ReturnType<typeof toSimpleSmartAccount>>
  if (config.factory === 'simple') {
    smartAccount = await toSimpleSmartAccount({
      client: publicClient,
      owner: ownerAccount,
      entryPoint,
    })
  } else {
    // safe factory via permissionless
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [ownerAccount],
      version: '1.4.1',
      entryPoint,
    })
    smartAccount = safeAccount as unknown as Awaited<ReturnType<typeof toSimpleSmartAccount>>
  }

  const bundlerTransport = http(config.bundlerUrl)

  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    chain,
    bundlerTransport,
    ...(config.paymasterUrl
      ? {
          paymaster: createPimlicoClient({
            transport: http(config.paymasterUrl),
            entryPoint,
          }),
        }
      : {}),
  }) as SmartAccountClient

  const address = await smartAccount.getAddress()

  return { smartAccountClient, address }
}

export async function computeSmartAccountAddress(
  config: SmartAccountConfig,
  ownerPrivateKey: Hex
): Promise<string> {
  const { address } = await buildSmartAccountClient(config, ownerPrivateKey)
  return address
}

export async function sendUserOperation(opts: {
  config: SmartAccountConfig
  ownerPrivateKey: Hex
  to: string
  value: bigint
  data?: string
  paymasterPolicy?: string
}): Promise<{ userOpHash: string; txHash?: string }> {
  const { smartAccountClient } = await buildSmartAccountClient(
    opts.config,
    opts.ownerPrivateKey
  )

  const client = smartAccountClient as SmartAccountClient & {
    sendUserOperation: (args: {
      calls: Array<{ to: Hex; value: bigint; data?: Hex }>
    }) => Promise<Hex>
    waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{
      receipt: { transactionHash: Hex }
    }>
  }

  const userOpHash = await client.sendUserOperation({
    calls: [
      {
        to: opts.to as Hex,
        value: opts.value,
        data: (opts.data as Hex | undefined) ?? '0x',
      },
    ],
  })

  return { userOpHash }
}

export async function waitForUserOpReceipt(
  bundlerUrl: string,
  chainId: string,
  userOpHash: string
): Promise<{ success: boolean; txHash: string; gasUsed: bigint }> {
  const chain = resolveChain(chainId)
  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7' as const,
    },
    chain,
  })

  const receipt = await (
    pimlicoClient as typeof pimlicoClient & {
      waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{
        success: boolean
        receipt: { transactionHash: Hex; gasUsed: bigint }
      }>
    }
  ).waitForUserOperationReceipt({ hash: userOpHash as Hex })

  return {
    success: receipt.success,
    txHash: receipt.receipt.transactionHash,
    gasUsed: receipt.receipt.gasUsed ?? 0n,
  }
}
