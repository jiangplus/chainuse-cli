import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'
import {
  privateKeyToAccount,
  type PrivateKeyAccount,
} from 'viem/accounts'
import { toHex, type Hex } from 'viem'

export const DEFAULT_EVM_PATH = "m/44'/60'/0'/0/0"

export type GeneratedKey = {
  mnemonic: string
  privateKey: Hex
  address: string
  derivationPath: string
}

export function generateEOA(derivationPath = DEFAULT_EVM_PATH): GeneratedKey {
  const mnemonic = generateMnemonic(wordlist)
  const privateKey = derivePrivateKeyFromMnemonic(mnemonic, derivationPath)
  const account = privateKeyToAccount(privateKey)
  return {
    mnemonic,
    privateKey,
    address: account.address,
    derivationPath,
  }
}

export function derivePrivateKeyFromMnemonic(mnemonic: string, path = DEFAULT_EVM_PATH): Hex {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic')
  }
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive(path)
  if (!derived.privateKey) throw new Error('Failed to derive private key from mnemonic')
  return toHex(derived.privateKey)
}

export function importFromPrivateKey(privateKey: string): { address: string; privateKey: Hex } {
  let hex = privateKey.trim()
  if (!hex.startsWith('0x')) hex = `0x${hex}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Invalid private key: must be 32 bytes (64 hex chars)')
  }
  const account = privateKeyToAccount(hex as Hex)
  return { address: account.address, privateKey: hex as Hex }
}

export function importFromMnemonic(
  mnemonic: string,
  path = DEFAULT_EVM_PATH
): { address: string; privateKey: Hex; derivationPath: string } {
  const privateKey = derivePrivateKeyFromMnemonic(mnemonic, path)
  const account = privateKeyToAccount(privateKey)
  return { address: account.address, privateKey, derivationPath: path }
}

export function getAccountFromPrivateKey(privateKey: Hex): PrivateKeyAccount {
  return privateKeyToAccount(privateKey)
}

export async function signTransaction(
  privateKey: Hex,
  tx: {
    chainId: number
    to: Hex
    value: bigint
    nonce: number
    maxFeePerGas: bigint
    maxPriorityFeePerGas: bigint
    gas: bigint
    data?: Hex
  }
): Promise<Hex> {
  const account = privateKeyToAccount(privateKey)
  const signed = await account.signTransaction({
    chainId: tx.chainId,
    to: tx.to,
    value: tx.value,
    nonce: tx.nonce,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    gas: tx.gas,
    data: tx.data,
    type: 'eip1559',
  })
  return signed
}
