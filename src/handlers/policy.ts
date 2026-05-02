import { loadPolicy } from '../policy/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, PolicyConfig } from '../core/types.js'

export async function handlePolicyShow(): Promise<JsonResult<PolicyConfig>> {
  try {
    const policy = loadPolicy()
    return { ok: true, data: policy }
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
