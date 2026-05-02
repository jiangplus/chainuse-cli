import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'

export const DEFAULT_SUI_PATH = "m/44'/784'/0'/0'/0'"

export function generateSuiKeypair(
  mnemonic: string,
  index = 0
): { keypair: Ed25519Keypair; address: string; derivationPath: string } {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic')
  }
  const derivationPath = `m/44'/784'/${index}'/0'/0'`
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive(derivationPath)
  if (!derived.privateKey) throw new Error('Failed to derive private key')

  const keypair = Ed25519Keypair.fromSecretKey(derived.privateKey.slice(0, 32))
  const address = keypair.getPublicKey().toSuiAddress()
  return { keypair, address, derivationPath }
}

export function suiKeypairFromPrivkey(privkeyHex: string): {
  keypair: Ed25519Keypair
  address: string
} {
  let hex = privkeyHex.trim()
  if (hex.startsWith('0x')) hex = hex.slice(2)
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length !== 32) throw new Error('Sui private key must be 32 bytes (64 hex chars)')
  const keypair = Ed25519Keypair.fromSecretKey(bytes)
  const address = keypair.getPublicKey().toSuiAddress()
  return { keypair, address }
}

export async function signSuiTransaction(
  keypair: Ed25519Keypair,
  txBytes: Uint8Array
): Promise<{ signature: string; publicKey: string }> {
  const { signature } = await keypair.signTransaction(txBytes)
  const publicKey = keypair.getPublicKey().toBase64()
  return { signature, publicKey }
}
