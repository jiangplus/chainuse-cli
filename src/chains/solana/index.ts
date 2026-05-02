import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  VersionedTransaction,
} from '@solana/web3.js'
import {
  getAssociatedTokenAddressSync,
  getAccount as getSplAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

export function buildSolanaConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed')
}

export async function getSolBalance(
  conn: Connection,
  address: string
): Promise<{ lamports: bigint; sol: string }> {
  const pubkey = new PublicKey(address)
  const lamports = await conn.getBalance(pubkey)
  const lamportsBig = BigInt(lamports)
  const sol = (Number(lamportsBig) / LAMPORTS_PER_SOL).toFixed(9)
  return { lamports: lamportsBig, sol }
}

export async function getSplBalance(
  conn: Connection,
  mint: string,
  owner: string
): Promise<{ amount: bigint; decimals: number; formatted: string }> {
  const mintPubkey = new PublicKey(mint)
  const ownerPubkey = new PublicKey(owner)
  const ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey)
  const accountInfo = await getSplAccount(conn, ata)
  const decimals = accountInfo.mint ? 9 : 9 // default, caller should pass decimals separately if needed
  const amount = BigInt(accountInfo.amount.toString())
  const formatted = (Number(amount) / Math.pow(10, decimals)).toString()
  return { amount, decimals, formatted }
}

export async function buildSolTransfer(
  conn: Connection,
  from: string,
  to: string,
  lamports: bigint
): Promise<{ transaction: Transaction; blockhash: string; lastValidBlockHeight: number }> {
  const fromPubkey = new PublicKey(from)
  const toPubkey = new PublicKey(to)

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash()

  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: fromPubkey,
  }).add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: Number(lamports),
    })
  )

  return { transaction, blockhash, lastValidBlockHeight }
}

export async function sendSolTransaction(
  conn: Connection,
  signedTxBase64: string
): Promise<string> {
  const txBytes = Buffer.from(signedTxBase64, 'base64')
  // Try as versioned transaction first, fall back to legacy
  let signature: string
  try {
    const vt = VersionedTransaction.deserialize(txBytes)
    signature = await conn.sendTransaction(vt)
  } catch {
    const tx = Transaction.from(txBytes)
    signature = await conn.sendRawTransaction(tx.serialize())
  }
  return signature
}
