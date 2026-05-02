import type { Address, Hex } from 'viem'
import { serializeTransaction } from 'viem'
import type { TransactionSerializable } from 'viem'

type LedgerEthApp = {
  getAddress(path: string, display?: boolean): Promise<{ address: string; publicKey: string }>
  signTransaction(path: string, rawTxHex: string, resolution: null): Promise<{ v: string; r: string; s: string }>
  signPersonalMessage(path: string, messageHex: string): Promise<{ v: number; r: string; s: string }>
  signEIP712Message(path: string, domainSeparator: string, hashStructMessage: string): Promise<{ v: number; r: string; s: string }>
}

type TransportInstance = {
  close(): Promise<void>
}

// Lazy-load native HID transport + app — only when a Ledger command is actually called
async function getEthApp(): Promise<{ app: LedgerEthApp; transport: TransportInstance }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transportMod = await import('@ledgerhq/hw-transport-node-hid') as any
  const TransportClass = transportMod.default?.default ?? transportMod.default ?? transportMod
  const transport: TransportInstance = await TransportClass.create()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethMod = await import('@ledgerhq/hw-app-eth') as any
  const EthClass = ethMod.default?.default ?? ethMod.default ?? ethMod
  const app = new EthClass(transport) as LedgerEthApp

  return { app, transport }
}

const DEFAULT_ETH_PATH = "m/44'/60'/0'/0/0"

export async function ledgerGetAddress(derivationPath?: string): Promise<Address> {
  const path = derivationPath ?? DEFAULT_ETH_PATH
  const { app, transport } = await getEthApp()
  try {
    const result = await app.getAddress(path, false)
    return result.address as Address
  } finally {
    await transport.close()
  }
}

export async function ledgerSignTransaction(opts: {
  tx: TransactionSerializable
  derivationPath?: string
}): Promise<Hex> {
  const path = opts.derivationPath ?? DEFAULT_ETH_PATH
  const { app, transport } = await getEthApp()
  try {
    const serialized = serializeTransaction(opts.tx)
    const rawHex = serialized.slice(2) // strip 0x for Ledger
    const { v, r, s } = await app.signTransaction(path, rawHex, null)
    const vBig = BigInt('0x' + v)
    return serializeTransaction(opts.tx, { v: vBig, r: ('0x' + r) as Hex, s: ('0x' + s) as Hex })
  } finally {
    await transport.close()
  }
}

export async function ledgerSignMessage(opts: {
  message: string
  derivationPath?: string
}): Promise<Hex> {
  const path = opts.derivationPath ?? DEFAULT_ETH_PATH
  const { app, transport } = await getEthApp()
  try {
    const msgHex = Buffer.from(opts.message, 'utf-8').toString('hex')
    const { v, r, s } = await app.signPersonalMessage(path, msgHex)
    const sig = `0x${r}${s}${v.toString(16).padStart(2, '0')}`
    return sig as Hex
  } finally {
    await transport.close()
  }
}

export async function ledgerListAddresses(
  count = 5,
  derivationBase?: string
): Promise<Array<{ index: number; path: string; address: Address }>> {
  const base = derivationBase ?? "m/44'/60'/0'/0"
  const { app, transport } = await getEthApp()
  try {
    const results: Array<{ index: number; path: string; address: Address }> = []
    for (let i = 0; i < count; i++) {
      const p = `${base}/${i}`
      const { address } = await app.getAddress(p, false)
      results.push({ index: i, path: p, address: address as Address })
    }
    return results
  } finally {
    await transport.close()
  }
}
