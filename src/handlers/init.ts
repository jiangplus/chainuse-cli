import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { getChainuseDir, getConfigPath, getPolicyPath, isInitialized } from '../config/index.js'
import { DEFAULT_CONFIG_YAML } from '../config/defaults.js'
import { DEFAULT_POLICY_YAML } from '../policy/defaults.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'

export type InitResult = {
  dir: string
  configPath: string
  policyPath: string
  alreadyExisted: boolean
}

export async function handleInit(opts: { force?: boolean }): Promise<JsonResult<InitResult>> {
  try {
    const dir = getChainuseDir()
    const configPath = getConfigPath()
    const policyPath = getPolicyPath()
    const alreadyExisted = isInitialized()

    if (alreadyExisted && !opts.force) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALREADY_INITIALIZED,
          message: `Chainuse is already initialized at ${dir}`,
          hint: 'Use --force to reinitialize (will overwrite config and policy)',
        },
      }
    }

    // Create the directory if needed
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }

    // Write config.yaml (only if not exists, or force)
    if (!existsSync(configPath) || opts.force) {
      writeFileSync(configPath, DEFAULT_CONFIG_YAML, { encoding: 'utf-8', mode: 0o600 })
    }

    // Write policy.yaml (only if not exists, or force)
    if (!existsSync(policyPath) || opts.force) {
      writeFileSync(policyPath, DEFAULT_POLICY_YAML, { encoding: 'utf-8', mode: 0o600 })
    }

    return {
      ok: true,
      data: { dir, configPath, policyPath, alreadyExisted },
    }
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
