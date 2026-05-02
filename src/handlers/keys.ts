import { generateEOA, importFromMnemonic, importFromPrivateKey, DEFAULT_EVM_PATH } from '../accounts/eoa.js'
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
}): Promise<JsonResult<GenerateResult>> {
  try {
    if (opts.chain !== 'evm') {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: `Unsupported chain "${opts.chain}" for key generation. M1 supports: evm`,
        },
      }
    }

    const passphrase = getPassphrase(opts.passphrase)
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

    // Store encrypted key material
    await storeKey({
      alias,
      chain: 'evm',
      address: generated.address,
      material: { mnemonic: generated.mnemonic },
      passphrase,
    })

    // Store account metadata in state DB
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
        mnemonic: generated.mnemonic, // shown once
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
}): Promise<JsonResult<ImportResult>> {
  try {
    const passphrase = getPassphrase(opts.passphrase)
    const chain = opts.chain ?? 'evm'

    if (chain !== 'evm') {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_CHAIN,
          message: `Unsupported chain "${chain}" for key import. M1 supports: evm`,
        },
      }
    }

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

    return {
      ok: true,
      data: { alias, address, chain },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Invalid BIP-39') || msg.includes('Invalid private key')) {
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
