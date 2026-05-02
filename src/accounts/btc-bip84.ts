import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
// Suppress "Failed to load bindings" warning from tiny-secp256k1
const _stderr = process.stderr.write.bind(process.stderr)
process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
  if (typeof chunk === 'string' && chunk.includes('Failed to load bindings')) return true
  return (_stderr as (...a: unknown[]) => boolean)(chunk, ...args)
}
import * as tinysecp from 'tiny-secp256k1'
process.stderr.write = _stderr
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { HDKey } from '@scure/bip32'

bitcoin.initEccLib(tinysecp)
const ECPair = ECPairFactory(tinysecp)

type BtcNetwork = 'mainnet' | 'testnet'

function getNetwork(network: BtcNetwork): bitcoin.networks.Network {
  return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
}

// BIP-84: m/84'/0'/0'/0/x for mainnet, m/84'/1'/0'/0/x for testnet
function getBip84Path(network: BtcNetwork, index: number): string {
  const coinType = network === 'mainnet' ? 0 : 1
  return `m/84'/${coinType}'/0'/0/${index}`
}

export function generateBtcKeypair(
  mnemonic: string,
  network: BtcNetwork,
  index = 0
): { address: string; wif: string; pubkey: string; derivationPath: string } {
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 mnemonic')
  }
  const derivationPath = getBip84Path(network, index)
  const seed = mnemonicToSeedSync(mnemonic)
  const hdKey = HDKey.fromMasterSeed(seed)
  const derived = hdKey.derive(derivationPath)
  if (!derived.privateKey) throw new Error('Failed to derive private key')
  if (!derived.publicKey) throw new Error('Failed to derive public key')

  const net = getNetwork(network)
  const keyPair = ECPair.fromPrivateKey(Buffer.from(derived.privateKey), { network: net })

  // P2WPKH (native segwit) address
  const { address } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(derived.publicKey), network: net })
  if (!address) throw new Error('Failed to generate P2WPKH address')

  return {
    address,
    wif: keyPair.toWIF(),
    pubkey: Buffer.from(derived.publicKey).toString('hex'),
    derivationPath,
  }
}

export function btcKeypairFromWIF(
  wif: string,
  network: BtcNetwork
): { address: string; pubkey: string } {
  const net = getNetwork(network)
  const keyPair = ECPair.fromWIF(wif, net)
  if (!keyPair.publicKey) throw new Error('Failed to get public key from WIF')
  const { address } = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(keyPair.publicKey), network: net })
  if (!address) throw new Error('Failed to generate P2WPKH address from WIF')
  return {
    address,
    pubkey: Buffer.from(keyPair.publicKey).toString('hex'),
  }
}

export function signBtcPsbt(psbtBase64: string, wif: string, network: BtcNetwork): string {
  const net = getNetwork(network)
  const keyPair = ECPair.fromWIF(wif, net)
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: net })
  psbt.signAllInputs(keyPair)
  psbt.finalizeAllInputs()
  return psbt.toBase64()
}
