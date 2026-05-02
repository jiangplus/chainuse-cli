import {
  createWalletClient,
  http,
  isAddress,
  getAddress,
  parseUnits,
  type Hex,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { derivePrivateKeyFromMnemonic } from '../accounts/eoa.js'
import {
  listAccounts,
  insertSmartAccount,
  getSmartAccount,
  listSmartAccounts,
  smartAccountExists,
  type StoredAccount,
} from '../state/index.js'
import {
  computeSmartAccountAddress,
  sendUserOperation,
  type SmartAccountConfig,
} from '../services/erc4337.js'
import { sign7702Authorization, build7702Tx } from '../services/erc7702.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'
import { chainIdToNumber } from '../chains/evm/utils.js'
import { getNonce, getMaxPriorityFeePerGas, getBlockBaseFee, broadcastTx } from '../chains/evm/index.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function resolvePrivateKey(alias: string): Promise<Hex> {
  const passphrase = getPassphrase()
  const keyData = await loadKey(alias, passphrase)
  if (keyData.privateKey) {
    let pk = keyData.privateKey
    if (!pk.startsWith('0x')) pk = `0x${pk}`
    return pk as Hex
  }
  if (keyData.mnemonic) {
    return derivePrivateKeyFromMnemonic(keyData.mnemonic)
  }
  throw new Error(`No key material found for alias: ${alias}`)
}

function getRpcUrl(chainId: string): string {
  const config = loadConfig()
  const providerConfig = config.providers[chainId]
  if (!providerConfig) {
    throw new Error(`No provider configured for chain ${chainId}`)
  }
  const apiKey = process.env[providerConfig.key_env]
  if (!apiKey) {
    throw new Error(`Environment variable ${providerConfig.key_env} is not set`)
  }
  return `${providerConfig.url}/${apiKey}`
}

// ─── account create --type 4337 ─────────────────────────────────────────────

export async function handleAccountCreate4337(opts: {
  ownerAlias: string
  factory: 'simple' | 'safe'
  alias?: string
  paymasterPolicy?: string
  chain?: string
}): Promise<JsonResult<{ alias: string; address: string; type: '4337'; owner: string; factory: string }>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)

    // Validate owner alias
    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `Owner alias not found: ${opts.ownerAlias}`,
        },
      }
    }

    const alias = opts.alias ?? `4337-${opts.ownerAlias}-${Date.now()}`
    if (smartAccountExists(alias)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_EXISTS,
          message: `Smart account alias "${alias}" already exists`,
          hint: 'Choose a different alias with --alias',
        },
      }
    }

    if (opts.factory === 'simple' || opts.factory === 'safe') {
      // Kernel not supported
    } else {
      return {
        ok: false,
        error: {
          code: ErrorCode.PROVIDER_ERROR,
          message: `Factory "${opts.factory}" is not supported. Supported: simple, safe`,
        },
      }
    }

    const rpcUrl = getRpcUrl(chainId)
    const privateKey = await resolvePrivateKey(opts.ownerAlias)

    const saConfig: SmartAccountConfig = {
      factory: opts.factory,
      ownerAddress: ownerAccount.address,
      chainId,
      bundlerUrl: rpcUrl,
    }

    const address = await computeSmartAccountAddress(saConfig, privateKey)

    const stored: StoredAccount = {
      alias,
      type: '4337',
      address,
      chainId,
      ownerAlias: opts.ownerAlias,
      factory: opts.factory,
      paymasterPolicy: opts.paymasterPolicy,
      createdAt: Date.now(),
    }
    insertSmartAccount(stored)

    return {
      ok: true,
      data: {
        alias,
        address,
        type: '4337',
        owner: opts.ownerAlias,
        factory: opts.factory,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.PROVIDER_ERROR, message: msg },
    }
  }
}

// ─── account create --type 7702 ─────────────────────────────────────────────

export async function handleAccountCreate7702(opts: {
  ownerAlias: string
  delegateAddress: string
  alias?: string
  chain?: string
}): Promise<JsonResult<{ alias: string; address: string; type: '7702'; owner: string; delegate: string }>> {
  try {
    if (!isAddress(opts.delegateAddress)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_ADDRESS,
          message: `Invalid delegate address: ${opts.delegateAddress}`,
        },
      }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)

    const accounts = listAccounts()
    const ownerAccount = accounts.find((a) => a.alias === opts.ownerAlias)
    if (!ownerAccount) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `Owner alias not found: ${opts.ownerAlias}`,
        },
      }
    }

    const alias = opts.alias ?? `7702-${opts.ownerAlias}-${Date.now()}`
    if (smartAccountExists(alias)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_EXISTS,
          message: `Smart account alias "${alias}" already exists`,
          hint: 'Choose a different alias with --alias',
        },
      }
    }

    // For 7702, the address IS the EOA address
    const address = ownerAccount.address

    const stored: StoredAccount = {
      alias,
      type: '7702',
      address,
      chainId,
      ownerAlias: opts.ownerAlias,
      delegate: opts.delegateAddress,
      createdAt: Date.now(),
    }
    insertSmartAccount(stored)

    return {
      ok: true,
      data: {
        alias,
        address,
        type: '7702',
        owner: opts.ownerAlias,
        delegate: opts.delegateAddress,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: msg },
    }
  }
}

// ─── account list ────────────────────────────────────────────────────────────

export async function handleAccountList(opts: {
  chain?: string
}): Promise<JsonResult<StoredAccount[]>> {
  try {
    let chainId: string | undefined
    if (opts.chain) {
      const config = loadConfig()
      chainId = resolveChainFromConfig(config, opts.chain)
    }
    const accounts = listSmartAccounts(chainId)
    return { ok: true, data: accounts }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: msg },
    }
  }
}

// ─── account info ────────────────────────────────────────────────────────────

export async function handleAccountInfo(opts: {
  alias: string
}): Promise<JsonResult<StoredAccount>> {
  try {
    const account = getSmartAccount(opts.alias)
    if (!account) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `Smart account not found: ${opts.alias}`,
        },
      }
    }
    return { ok: true, data: account }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: msg },
    }
  }
}

// ─── account send ────────────────────────────────────────────────────────────

export async function handleAccountSend(opts: {
  alias: string
  to: string
  amount: string
  asset: string
  chain?: string
  paymasterPolicy?: string
}): Promise<JsonResult<{ hash: string; type: 'userOp' | 'tx'; userOpHash?: string }>> {
  try {
    if (!isAddress(opts.to)) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_ADDRESS,
          message: `Invalid destination address: ${opts.to}`,
        },
      }
    }

    const smartAcct = getSmartAccount(opts.alias)
    if (!smartAcct) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `Smart account not found: ${opts.alias}`,
        },
      }
    }

    const config = loadConfig()
    const chainId = opts.chain
      ? resolveChainFromConfig(config, opts.chain)
      : smartAcct.chainId

    let value: bigint
    let calldata: Hex | undefined

    if (opts.asset === 'native') {
      value = parseUnits(opts.amount, 18)
    } else if (opts.asset.startsWith('ERC20:')) {
      // ERC-20 transfer via calldata
      const tokenAddr = opts.asset.slice(6)
      if (!isAddress(tokenAddr)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.INVALID_ADDRESS,
            message: `Invalid ERC-20 token address: ${tokenAddr}`,
          },
        }
      }
      // Encode ERC20 transfer(address,uint256)
      const { encodeFunctionData } = await import('viem')
      calldata = encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'transfer',
        args: [getAddress(opts.to) as Address, parseUnits(opts.amount, 18)],
      })
      value = 0n
    } else {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_AMOUNT,
          message: `Unsupported asset: ${opts.asset}. Use "native" or "ERC20:0x..."`,
        },
      }
    }

    const privateKey = await resolvePrivateKey(smartAcct.ownerAlias)
    const to = getAddress(opts.to) as Address

    if (smartAcct.type === '4337') {
      const rpcUrl = getRpcUrl(chainId)
      const saConfig: SmartAccountConfig = {
        factory: (smartAcct.factory as 'simple' | 'safe') ?? 'simple',
        ownerAddress: smartAcct.address,
        chainId,
        bundlerUrl: rpcUrl,
      }

      const result = await sendUserOperation({
        config: saConfig,
        ownerPrivateKey: privateKey,
        to,
        value,
        data: calldata,
        paymasterPolicy: opts.paymasterPolicy ?? smartAcct.paymasterPolicy,
      })

      return {
        ok: true,
        data: {
          hash: result.userOpHash,
          type: 'userOp',
          userOpHash: result.userOpHash,
        },
      }
    } else if (smartAcct.type === '7702') {
      if (!smartAcct.delegate) {
        return {
          ok: false,
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: `7702 account ${opts.alias} has no delegate address`,
          },
        }
      }

      const chainNumId = chainIdToNumber(chainId)
      const ownerAccount = privateKeyToAccount(privateKey)
      const client = buildProvider(config, chainId)

      const { createWalletClient: cwc } = await import('viem')
      const walletClient = cwc({
        account: ownerAccount,
        transport: http(getRpcUrl(chainId)),
      })

      const nonce = await getNonce(client, ownerAccount.address)
      const authorization = await sign7702Authorization(
        walletClient,
        smartAcct.delegate as Address,
        chainNumId,
        nonce
      )

      const tx = build7702Tx({
        from: ownerAccount.address,
        to: calldata ? (smartAcct.delegate as Address) : to,
        data: calldata,
        value,
        authorization,
      })

      // Sign and send via raw transaction with authorizationList
      const [maxPriorityFeePerGas, baseFee] = await Promise.all([
        getMaxPriorityFeePerGas(client),
        getBlockBaseFee(client),
      ])
      const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas

      const signedTx = await ownerAccount.signTransaction({
        type: 'eip7702',
        chainId: chainNumId,
        to: tx.to,
        value: tx.value,
        data: tx.data as Hex,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gas: 200000n,
        authorizationList: tx.authorizationList,
      })

      const hash = await broadcastTx(client, signedTx)

      return {
        ok: true,
        data: {
          hash,
          type: 'tx',
        },
      }
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: `Unknown account type: ${smartAcct.type}`,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('JsonRpc')
    return {
      ok: false,
      error: {
        code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
        message: msg,
      },
    }
  }
}
