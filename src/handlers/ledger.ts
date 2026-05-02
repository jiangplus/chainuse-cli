import type { JsonResult } from '../core/types.js'
import { ErrorCode } from '../core/errors.js'
import {
  ledgerGetAddress,
  ledgerListAddresses,
  ledgerSignMessage,
} from '../services/ledger.js'

export async function handleLedgerAddress(opts: {
  path?: string
}): Promise<JsonResult<{ address: string; path: string }>> {
  try {
    const path = opts.path ?? "m/44'/60'/0'/0/0"
    const address = await ledgerGetAddress(path)
    return { ok: true, data: { address, path } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

export async function handleLedgerList(opts: {
  count?: number
  base?: string
}): Promise<JsonResult<Array<{ index: number; path: string; address: string }>>> {
  try {
    const results = await ledgerListAddresses(opts.count ?? 5, opts.base)
    return { ok: true, data: results }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}

export async function handleLedgerSign(opts: {
  message: string
  path?: string
}): Promise<JsonResult<{ signature: string }>> {
  try {
    const sig = await ledgerSignMessage({ message: opts.message, derivationPath: opts.path })
    return { ok: true, data: { signature: sig } }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: { code: ErrorCode.INTERNAL_ERROR, message: msg } }
  }
}
