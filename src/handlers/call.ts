import { isAddress, getAddress, type Hex } from 'viem'
import { readFileSync, existsSync } from 'node:fs'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import { ethCall, getStorageAt, callContractMethod } from '../chains/evm/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'

export type CallResult = {
  contract: string
  method: string
  result: unknown
  raw?: string
}

export type StorageGetResult = {
  contract: string
  slot: string
  value: string
}

export async function handleCall(opts: {
  contract: string
  method: string
  args: string[]
  abiFile?: string
  from?: string
  chain?: string
}): Promise<JsonResult<CallResult>> {
  try {
    if (!isAddress(opts.contract)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid contract address: ${opts.contract}` },
      }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)

    const contractAddr = getAddress(opts.contract) as `0x${string}`
    let abiJson: string | undefined

    if (opts.abiFile) {
      if (!existsSync(opts.abiFile)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.INVALID_ABI,
            message: `ABI file not found: ${opts.abiFile}`,
          },
        }
      }
      abiJson = readFileSync(opts.abiFile, 'utf-8')
    }

    // Parse args - try to detect types (numbers, addresses, booleans)
    const parsedArgs = opts.args.map((arg) => {
      if (isAddress(arg)) return getAddress(arg)
      if (arg === 'true') return true
      if (arg === 'false') return false
      if (/^\d+$/.test(arg)) return BigInt(arg)
      return arg
    })

    const result = await callContractMethod(client, {
      contract: contractAddr,
      method: opts.method,
      args: parsedArgs,
      abiJson,
      from: opts.from ? getAddress(opts.from) as `0x${string}` : undefined,
    })

    return {
      ok: true,
      data: {
        contract: contractAddr,
        method: opts.method,
        result,
        raw: typeof result === 'bigint' ? result.toString() : undefined,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.RPC_ERROR, message: msg },
    }
  }
}

export async function handleStorageGet(opts: {
  contract: string
  slot: string
  chain?: string
}): Promise<JsonResult<StorageGetResult>> {
  try {
    if (!isAddress(opts.contract)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid contract address: ${opts.contract}` },
      }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const client = buildProvider(config, chainId)

    const contractAddr = getAddress(opts.contract) as `0x${string}`

    // Normalize slot to 32-byte hex
    let slot: Hex
    if (opts.slot.startsWith('0x')) {
      slot = opts.slot.padStart(66, '0').slice(0, 2) + opts.slot.slice(2).padStart(64, '0') as Hex
    } else {
      const num = BigInt(opts.slot)
      slot = `0x${num.toString(16).padStart(64, '0')}` as Hex
    }

    const value = await getStorageAt(client, contractAddr, slot)

    return {
      ok: true,
      data: { contract: contractAddr, slot, value },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: { code: ErrorCode.RPC_ERROR, message: msg },
    }
  }
}
