import { SiweMessage } from 'siwe'

export type SiweMessageParams = {
  domain: string
  address: string
  statement?: string
  uri: string
  version?: string
  chainId: number
  nonce?: string
  issuedAt?: string
  expirationTime?: string
  notBefore?: string
  requestId?: string
  resources?: string[]
}

export type BuiltSiweMessage = {
  message: string
  nonce: string
  issuedAt: string
}

export function buildSiweMessage(params: SiweMessageParams): BuiltSiweMessage {
  const nonce = params.nonce ?? generateNonce()
  const issuedAt = params.issuedAt ?? new Date().toISOString()

  const siwe = new SiweMessage({
    domain: params.domain,
    address: params.address,
    statement: params.statement,
    uri: params.uri,
    version: params.version ?? '1',
    chainId: params.chainId,
    nonce,
    issuedAt,
    expirationTime: params.expirationTime,
    notBefore: params.notBefore,
    requestId: params.requestId,
    resources: params.resources,
  })

  return {
    message: siwe.prepareMessage(),
    nonce,
    issuedAt,
  }
}

export async function signSiweMessage(opts: {
  message: string
  privateKey: string
}): Promise<{ signature: string; message: string }> {
  const { createWalletClient, http } = await import('viem')
  const { privateKeyToAccount } = await import('viem/accounts')

  const account = privateKeyToAccount(opts.privateKey as `0x${string}`)
  const client = createWalletClient({ account, transport: http() })

  const signature = await client.signMessage({
    message: opts.message,
  })

  return { signature, message: opts.message }
}

export async function verifySiweMessage(opts: {
  message: string
  signature: string
}): Promise<{ valid: boolean; address?: string; domain?: string; chainId?: number; error?: string }> {
  try {
    const siwe = new SiweMessage(opts.message)
    const result = await siwe.verify({ signature: opts.signature })
    if (result.success) {
      return {
        valid: true,
        address: siwe.address,
        domain: siwe.domain,
        chainId: siwe.chainId,
      }
    }
    return { valid: false, error: result.error?.type ?? 'Verification failed' }
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  for (const byte of arr) {
    result += chars[byte % chars.length]
  }
  return result
}
