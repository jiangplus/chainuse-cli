import { generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { generateEOA, importFromMnemonic, importFromPrivateKey, DEFAULT_EVM_PATH } from '../accounts/eoa.js'
import { generateSolanaKeypair, solanaKeypairFromPrivkey } from '../accounts/solana-keypair.js'
import { generateBtcKeypair, btcKeypairFromWIF } from '../accounts/btc-bip84.js'
import { generateSuiKeypair, suiKeypairFromPrivkey } from '../accounts/sui-ed25519.js'
import { storeKey, loadKey, getPassphrase, keystoreAliasExists } from '../keystore/index.js'
import { insertAccount, listAccounts, accountExists } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, Account } from '../core/types.js'

export type GenerateResult = {
  alias: string
  address: string
  derivationPath: string
  chain: string
  mnemonic?: string // only shown on generation, never again
}

export type ImportResult = {
  alias: string
  address: string
  chain: string
}

export async function handleKeysGenerate(opts: {
  chain: string
  alias?: string
  passphrase?: string
  showMnemonic?: boolean
  network?: string // for BTC: mainnet | testnet
}): Promise<JsonResult<GenerateResult>> {
  try {
    const passphrase = getPassphrase(opts.passphrase)
    const chain = opts.chain.toLowerCase()

    if (chain === 'evm') {
      const generated = generateEOA(DEFAULT_EVM_PATH)
      const alias = opts.alias ?? `evm-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      await storeKey({
        alias,
        chain: 'evm',
        address: generated.address,
        material: { mnemonic: generated.mnemonic },
        passphrase,
      })

      const account: Account = {
        alias,
        chain: 'evm',
        address: generated.address,
        type: 'eoa',
        derivationPath: generated.derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return {
        ok: true,
        data: {
          alias,
          address: generated.address,
          derivationPath: generated.derivationPath,
          chain: 'evm',
          mnemonic: generated.mnemonic,
        },
      }
    }

    if (chain === 'solana') {
      const mnemonic = generateMnemonic(wordlist)
      const { keypair, address, derivationPath } = generateSolanaKeypair(mnemonic, 0)
      const alias = opts.alias ?? `solana-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      // Store private key as hex
      const privateKeyHex = Buffer.from(keypair.secretKey.slice(0, 32)).toString('hex')
      await storeKey({
        alias,
        chain: 'solana',
        address,
        material: { mnemonic, privateKey: privateKeyHex },
        passphrase,
      })

      const account: Account = {
        alias,
        chain: 'solana',
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return {
        ok: true,
        data: { alias, address, derivationPath, chain: 'solana', mnemonic },
      }
    }

    if (chain === 'btc') {
      const network = (opts.network === 'testnet' ? 'testnet' : 'mainnet') as 'mainnet' | 'testnet'
      const mnemonic = generateMnemonic(wordlist)
      const { address, wif, derivationPath } = generateBtcKeypair(mnemonic, network, 0)
      const alias = opts.alias ?? `btc-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      // Store WIF as secret material
      await storeKey({
        alias,
        chain: 'btc',
        address,
        material: { mnemonic, privateKey: wif },
        passphrase,
      })

      const account: Account = {
        alias,
        chain: 'btc',
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return {
        ok: true,
        data: { alias, address, derivationPath, chain: 'btc', mnemonic },
      }
    }

    if (chain === 'sui') {
      const mnemonic = generateMnemonic(wordlist)
      const { keypair, address, derivationPath } = generateSuiKeypair(mnemonic, 0)
      const alias = opts.alias ?? `sui-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      // Store private key as hex
      const privateKeyBytes = keypair.getSecretKey()
      const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex')
      await storeKey({
        alias,
        chain: 'sui',
        address,
        material: { mnemonic, privateKey: privateKeyHex },
        passphrase,
      })

      const account: Account = {
        alias,
        chain: 'sui',
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return {
        ok: true,
        data: { alias, address, derivationPath, chain: 'sui', mnemonic },
      }
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.INVALID_CHAIN,
        message: `Unsupported chain "${opts.chain}" for key generation. Supported: evm, solana, btc, sui`,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('ALIAS_EXISTS')) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_EXISTS, message: msg },
      }
    }
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: msg },
    }
  }
}

export async function handleKeysImport(opts: {
  from: 'mnemonic' | 'privkey'
  value: string
  alias?: string
  passphrase?: string
  chain?: string
  derivationPath?: string
  network?: string // for BTC
}): Promise<JsonResult<ImportResult>> {
  try {
    const passphrase = getPassphrase(opts.passphrase)
    const chain = (opts.chain ?? 'evm').toLowerCase()

    if (chain === 'evm') {
      let address: string
      let material: { mnemonic?: string; privateKey?: string }
      let derivationPath: string | undefined

      if (opts.from === 'mnemonic') {
        const path = opts.derivationPath ?? DEFAULT_EVM_PATH
        const result = importFromMnemonic(opts.value.trim(), path)
        address = result.address
        derivationPath = result.derivationPath
        material = { mnemonic: opts.value.trim() }
      } else {
        const result = importFromPrivateKey(opts.value.trim())
        address = result.address
        material = { privateKey: result.privateKey }
      }

      const alias = opts.alias ?? `evm-imported-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      await storeKey({ alias, chain, address, material, passphrase })

      const account: Account = {
        alias,
        chain,
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return { ok: true, data: { alias, address, chain } }
    }

    if (chain === 'solana') {
      let address: string
      let material: { mnemonic?: string; privateKey?: string }
      let derivationPath: string | undefined

      if (opts.from === 'mnemonic') {
        const { keypair, address: addr, derivationPath: dp } = generateSolanaKeypair(opts.value.trim(), 0)
        address = addr
        derivationPath = dp
        const privateKeyHex = Buffer.from(keypair.secretKey.slice(0, 32)).toString('hex')
        material = { mnemonic: opts.value.trim(), privateKey: privateKeyHex }
      } else {
        const { address: addr } = solanaKeypairFromPrivkey(opts.value.trim())
        address = addr
        material = { privateKey: opts.value.trim().replace(/^0x/, '') }
      }

      const alias = opts.alias ?? `solana-imported-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      await storeKey({ alias, chain, address, material, passphrase })

      const account: Account = {
        alias,
        chain,
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return { ok: true, data: { alias, address, chain } }
    }

    if (chain === 'btc') {
      const network = (opts.network === 'testnet' ? 'testnet' : 'mainnet') as 'mainnet' | 'testnet'
      let address: string
      let material: { mnemonic?: string; privateKey?: string }
      let derivationPath: string | undefined

      if (opts.from === 'mnemonic') {
        const { address: addr, wif, derivationPath: dp } = generateBtcKeypair(opts.value.trim(), network, 0)
        address = addr
        derivationPath = dp
        material = { mnemonic: opts.value.trim(), privateKey: wif }
      } else {
        // Assume WIF format for privkey import
        const { address: addr } = btcKeypairFromWIF(opts.value.trim(), network)
        address = addr
        material = { privateKey: opts.value.trim() }
      }

      const alias = opts.alias ?? `btc-imported-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      await storeKey({ alias, chain, address, material, passphrase })

      const account: Account = {
        alias,
        chain,
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return { ok: true, data: { alias, address, chain } }
    }

    if (chain === 'sui') {
      let address: string
      let material: { mnemonic?: string; privateKey?: string }
      let derivationPath: string | undefined

      if (opts.from === 'mnemonic') {
        const { keypair, address: addr, derivationPath: dp } = generateSuiKeypair(opts.value.trim(), 0)
        address = addr
        derivationPath = dp
        const privateKeyBytes = keypair.getSecretKey()
        const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex')
        material = { mnemonic: opts.value.trim(), privateKey: privateKeyHex }
      } else {
        const { address: addr } = suiKeypairFromPrivkey(opts.value.trim())
        address = addr
        material = { privateKey: opts.value.trim().replace(/^0x/, '') }
      }

      const alias = opts.alias ?? `sui-imported-${Date.now()}`

      if (accountExists(alias)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.ALIAS_EXISTS,
            message: `Account with alias "${alias}" already exists`,
            hint: 'Choose a different alias with --alias',
          },
        }
      }

      await storeKey({ alias, chain, address, material, passphrase })

      const account: Account = {
        alias,
        chain,
        address,
        type: 'eoa',
        derivationPath,
        createdAt: Date.now(),
      }
      insertAccount(account)

      return { ok: true, data: { alias, address, chain } }
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.INVALID_CHAIN,
        message: `Unsupported chain "${chain}" for key import. Supported: evm, solana, btc, sui`,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Invalid BIP-39') || msg.includes('Invalid private key') || msg.includes('Invalid WIF')) {
      return {
        ok: false,
        error: { code: ErrorCode.IMPORT_FAILED, message: msg },
      }
    }
    if (msg.startsWith('ALIAS_EXISTS')) {
      return {
        ok: false,
        error: { code: ErrorCode.ALIAS_EXISTS, message: msg },
      }
    }
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: msg },
    }
  }
}

export async function handleKeysList(): Promise<JsonResult<Account[]>> {
  try {
    const accounts = listAccounts()
    return { ok: true, data: accounts }
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
