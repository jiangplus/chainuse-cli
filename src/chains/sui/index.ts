import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Transaction as SuiTransaction } from '@mysten/sui/transactions'

export type SuiClient = SuiJsonRpcClient

export function buildSuiClient(rpcUrl: string, network: 'mainnet' | 'testnet' = 'mainnet'): SuiClient {
  return new SuiJsonRpcClient({ url: rpcUrl, network })
}

export async function getSuiBalance(
  client: SuiClient,
  address: string
): Promise<{ balance: bigint; formatted: string }> {
  const balanceResult = await client.getBalance({ owner: address })
  const balance = BigInt(balanceResult.totalBalance)
  // 1 SUI = 1e9 MIST
  const formatted = (Number(balance) / 1e9).toFixed(9)
  return { balance, formatted }
}

export async function getSuiCoinBalance(
  client: SuiClient,
  address: string,
  coinType: string
): Promise<{ balance: bigint; formatted: string; decimals: number }> {
  const balanceResult = await client.getBalance({ owner: address, coinType })
  const balance = BigInt(balanceResult.totalBalance)
  const decimals = 9 // default for most Sui coins
  const formatted = (Number(balance) / Math.pow(10, decimals)).toFixed(decimals)
  return { balance, formatted, decimals }
}

export async function buildSuiTransfer(
  client: SuiClient,
  from: string,
  to: string,
  amountMist: bigint
): Promise<{ txBytes: string }> {
  const tx = new SuiTransaction()
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)])
  tx.transferObjects([coin], tx.pure.address(to))
  tx.setSender(from)

  // Build the transaction bytes using the client as resolver
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes = await tx.build({ client: client as any })
  const txBytes = Buffer.from(bytes).toString('base64')
  return { txBytes }
}

export async function sendSuiTransaction(
  client: SuiClient,
  signedTxBytes: string,
  signature: string
): Promise<string> {
  const result = await client.executeTransactionBlock({
    transactionBlock: signedTxBytes,
    signature,
    options: { showEffects: true },
  })
  return result.digest
}
