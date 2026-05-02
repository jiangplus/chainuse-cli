import { readFileSync, existsSync } from 'node:fs'
import { loadPolicy } from '../policy/index.js'
import { getPolicyPath } from '../config/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, PolicyConfig } from '../core/types.js'

export async function handlePolicyShow(): Promise<JsonResult<PolicyConfig & { raw: string }>> {
  try {
    const policy = loadPolicy()
    const raw = existsSync(getPolicyPath()) ? readFileSync(getPolicyPath(), 'utf-8') : ''
    return { ok: true, data: { ...policy, raw } }
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: ErrorCode.NOT_INITIALIZED,
        message: err instanceof Error ? err.message : String(err),
        hint: 'Run "chain init" to create the default policy',
      },
    }
  }
}
