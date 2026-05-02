import SafeModule from '@safe-global/protocol-kit'
import type { SafeTransaction, TransactionResult } from '@safe-global/types-kit'
import { insertSafeTx, updateSafeTx, getSafeTx, listSafeTxs } from '../state/index.js'

// Normalize the default export — under Node16 ESM, the default may be wrapped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Safe = (SafeModule as any).default ?? SafeModule

export type SafeInfo = {
  address: string
  owners: string[]
  threshold: number
  nonce: number
  balance: string
  version: string
}

export type SafeQueueItem = {
  safeTxHash: string
  to: string
  value: string
  data: string
  confirmations: number
  threshold: number
}

type SignatureEntry = { signer: string; signature: string }

/**
 * Create a new Safe.
 */
export async function createSafe(opts: {
  owners: string[]
  threshold: number
  saltNonce?: string
  rpcUrl: string
  signerPrivateKey: string
}): Promise<{ safeAddress: string; deploymentTx?: string }> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    predictedSafe: {
      safeAccountConfig: {
        owners: opts.owners,
        threshold: opts.threshold,
      },
      safeDeploymentConfig: {
        saltNonce: opts.saltNonce,
      },
    },
  })

  const safeAddress = await safeSdk.getAddress()

  // Check if already deployed
  const isDeployed = await safeSdk.isSafeDeployed()
  if (isDeployed) {
    return { safeAddress }
  }

  // Deploy it
  const deploymentTx = await safeSdk.deploy()
  const txHash = (deploymentTx as TransactionResult & { hash?: string }).hash

  return { safeAddress, deploymentTx: txHash }
}

/**
 * Get Safe info.
 */
export async function getSafeInfo(opts: {
  safeAddress: string
  rpcUrl: string
  signerPrivateKey: string
}): Promise<SafeInfo> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    safeAddress: opts.safeAddress,
  })

  const [owners, threshold, nonce, balance, version] = await Promise.all([
    safeSdk.getOwners(),
    safeSdk.getThreshold(),
    safeSdk.getNonce(),
    safeSdk.getBalance(),
    safeSdk.getContractVersion(),
  ])

  return {
    address: opts.safeAddress,
    owners,
    threshold,
    nonce,
    balance: balance.toString(),
    version,
  }
}

/**
 * Propose a transaction (create SafeTransaction, sign, store locally).
 */
export async function proposeSafeTx(opts: {
  safeAddress: string
  to: string
  value: bigint
  data?: string
  rpcUrl: string
  signerPrivateKey: string
  chainId: string
  signerAddress: string
}): Promise<{ safeTxHash: string; signature: string }> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    safeAddress: opts.safeAddress,
  })

  const safeTransaction = await safeSdk.createTransaction({
    transactions: [
      {
        to: opts.to,
        value: opts.value.toString(),
        data: opts.data ?? '0x',
      },
    ],
  })

  const signedTx = await safeSdk.signTransaction(safeTransaction)
  const safeTxHash = await safeSdk.getTransactionHash(signedTx)

  // Extract the signature for the signer
  const sigEntry = signedTx.signatures.get(opts.signerAddress.toLowerCase())
  const sigData = sigEntry?.data ?? ''

  const signatures: SignatureEntry[] = [
    { signer: opts.signerAddress, signature: sigData },
  ]

  // Store locally
  insertSafeTx({
    safeTxHash,
    safeAddress: opts.safeAddress,
    chainId: opts.chainId,
    toAddress: opts.to,
    value: opts.value.toString(),
    data: opts.data ?? '0x',
    nonce: safeTransaction.data.nonce,
    signatures: JSON.stringify(signatures),
    status: 'pending',
    txHash: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  return { safeTxHash, signature: sigData }
}

/**
 * Confirm a proposed tx (add another signature).
 */
export async function confirmSafeTx(opts: {
  safeAddress: string
  safeTxHash: string
  rpcUrl: string
  signerPrivateKey: string
  signerAddress: string
  chainId: string
}): Promise<{ safeTxHash: string; signatures: number }> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    safeAddress: opts.safeAddress,
  })

  const stored = getSafeTx(opts.safeTxHash)
  if (!stored) {
    throw new Error(`Safe tx not found: ${opts.safeTxHash}`)
  }

  // Rebuild the SafeTransaction from stored data
  const safeTransaction = await safeSdk.createTransaction({
    transactions: [
      {
        to: stored.toAddress,
        value: stored.value,
        data: stored.data ?? '0x',
      },
    ],
    options: { nonce: stored.nonce ?? undefined },
  })

  const signedTx = await safeSdk.signTransaction(safeTransaction)
  const sigEntry = signedTx.signatures.get(opts.signerAddress.toLowerCase())
  const sigData = sigEntry?.data ?? ''

  // Update stored signatures
  const existingSigs: SignatureEntry[] = stored.signatures
    ? JSON.parse(stored.signatures)
    : []

  // Avoid duplicates
  const alreadySigned = existingSigs.some(
    (s) => s.signer.toLowerCase() === opts.signerAddress.toLowerCase()
  )
  if (!alreadySigned) {
    existingSigs.push({ signer: opts.signerAddress, signature: sigData })
  }

  updateSafeTx({
    safeTxHash: opts.safeTxHash,
    signatures: JSON.stringify(existingSigs),
    status: 'pending',
    updatedAt: Date.now(),
  })

  return { safeTxHash: opts.safeTxHash, signatures: existingSigs.length }
}

/**
 * Execute a Safe tx (when threshold met).
 */
export async function executeSafeTx(opts: {
  safeAddress: string
  safeTxHash: string
  rpcUrl: string
  signerPrivateKey: string
  chainId: string
}): Promise<{ txHash: string }> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    safeAddress: opts.safeAddress,
  })

  const stored = getSafeTx(opts.safeTxHash)
  if (!stored) {
    throw new Error(`Safe tx not found: ${opts.safeTxHash}`)
  }

  // Rebuild the SafeTransaction and add all stored signatures
  const safeTransaction = await safeSdk.createTransaction({
    transactions: [
      {
        to: stored.toAddress,
        value: stored.value,
        data: stored.data ?? '0x',
      },
    ],
    options: { nonce: stored.nonce ?? undefined },
  })

  const existingSigs: SignatureEntry[] = stored.signatures
    ? JSON.parse(stored.signatures)
    : []

  // Add signatures to the transaction
  const { EthSafeSignature } = await import('@safe-global/protocol-kit')
  for (const sig of existingSigs) {
    safeTransaction.addSignature(new EthSafeSignature(sig.signer, sig.signature))
  }

  const result = await safeSdk.executeTransaction(safeTransaction)
  const txHash = (result as TransactionResult & { hash?: string }).hash ?? ''

  updateSafeTx({
    safeTxHash: opts.safeTxHash,
    signatures: stored.signatures ?? '[]',
    status: 'executed',
    txHash,
    updatedAt: Date.now(),
  })

  return { txHash }
}

/**
 * Get pending Safe txs (locally tracked).
 */
export async function getSafeQueue(opts: {
  safeAddress: string
  rpcUrl: string
  signerPrivateKey: string
}): Promise<SafeQueueItem[]> {
  const safeSdk = await Safe.init({
    provider: opts.rpcUrl,
    signer: opts.signerPrivateKey,
    safeAddress: opts.safeAddress,
  })

  const threshold = await safeSdk.getThreshold()

  // Load from local SQLite
  const txs = listSafeTxs(opts.safeAddress)

  return txs
    .filter((tx) => tx.status === 'pending')
    .map((tx) => {
      const sigs: SignatureEntry[] = tx.signatures ? JSON.parse(tx.signatures) : []
      return {
        safeTxHash: tx.safeTxHash,
        to: tx.toAddress,
        value: tx.value,
        data: tx.data ?? '0x',
        confirmations: sigs.length,
        threshold,
      }
    })
}
