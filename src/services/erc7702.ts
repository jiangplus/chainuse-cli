import {
  type Address,
  type Hex,
  type Chain,
  type WalletClient,
  type Transport,
  type Account,
  type SignedAuthorization as ViemSignedAuthorization,
} from 'viem'

export type { ViemSignedAuthorization as SignedAuthorization }

export type Built7702Tx = {
  to: Address
  data: Hex
  value: bigint
  authorizationList: ViemSignedAuthorization[]
}

/**
 * Sign a 7702 authorization: the EOA authorizes `delegate` to be its code.
 * Returns a SignedAuthorization object.
 *
 * Uses viem's `signAuthorization` wallet action (available in viem 2.21+).
 */
export async function sign7702Authorization(
  walletClient: WalletClient<Transport, Chain | undefined, Account>,
  delegate: Address,
  chainId: number,
  nonce?: number
): Promise<ViemSignedAuthorization> {
  // viem's wallet client exposes signAuthorization via the wallet decorator
  const client = walletClient as WalletClient<Transport, Chain | undefined, Account> & {
    signAuthorization: (args: {
      contractAddress: Address
      chainId?: number
      nonce?: number
    }) => Promise<ViemSignedAuthorization>
  }

  const authorization = await client.signAuthorization({
    contractAddress: delegate,
    chainId,
    ...(nonce !== undefined ? { nonce } : {}),
  })

  return authorization
}

/**
 * Build a tx that includes the authorizationList (sets code AND optionally calls it).
 */
export function build7702Tx(opts: {
  from: Address
  to: Address
  data?: Hex
  value?: bigint
  authorization: ViemSignedAuthorization
}): Built7702Tx {
  return {
    to: opts.to,
    data: opts.data ?? '0x',
    value: opts.value ?? 0n,
    authorizationList: [opts.authorization],
  }
}
