import { Keypair } from '@solana/web3.js'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import { Transaction } from '@solana/web3.js'

export const DEFAULT_SOLANA_PATH = "m/44'/501'/0'/0'"

export function generateSolanaKeypair(
  mnemonic: string,
  index = 0
): { keypair: Keypair; address: string; derivationPath: string } {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic')
  }
  const derivationPath = `m/44'/501'/${index}'/0'`
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive(derivationPath)
  if (!derived.privateKey) throw new Error('Failed to derive private key')
  const keypair = Keypair.fromSeed(derived.privateKey.slice(0, 32))
  return {
    keypair,
    address: keypair.publicKey.toBase58(),
    derivationPath,
  }
}

export function solanaKeypairFromPrivkey(privkeyHex: string): {
  keypair: Keypair
  address: string
} {
  let hex = privkeyHex.trim()
  if (hex.startsWith('0x')) hex = hex.slice(2)
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 32) throw new Error('Solana private key must be 32 bytes (64 hex chars)')
  const keypair = Keypair.fromSeed(bytes)
  return {
    keypair,
    address: keypair.publicKey.toBase58(),
  }
}

export function signSolanaTransaction(keypair: Keypair, transaction: Transaction): Uint8Array {
  transaction.sign(keypair)
  return transaction.serialize()
}
