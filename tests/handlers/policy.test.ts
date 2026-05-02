import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handlePolicyShow } from '../../src/handlers/policy.js'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
})

describe('handlePolicyShow', () => {
  it('returns NOT_INITIALIZED when policy.yaml missing', async () => {
    // No setupTempHome call — so policy.yaml does not exist
    const result = await handlePolicyShow()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_INITIALIZED')
    expect(result.error.hint).toContain('chain init')
  })

  it('returns the parsed policy when file exists', async () => {
    writeFileSync(
      join(tmpDir, 'policy.yaml'),
      `version: 1\ndefaults:\n  require_simulation: false\n  max_gas_usd: 5.00\n  max_value_per_tx_usd: 500.00\n`
    )
    const result = await handlePolicyShow()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.version).toBe(1)
    expect(result.data.defaults.max_gas_usd).toBe(5)
    expect(result.data.defaults.max_value_per_tx_usd).toBe(500)
    expect(result.data.defaults.require_simulation).toBe(false)
  })

  it('includes raw YAML in the response', async () => {
    const yaml = `version: 1\ndefaults:\n  require_simulation: true\n  max_gas_usd: 10.00\n  max_value_per_tx_usd: 1000.00\n`
    writeFileSync(join(tmpDir, 'policy.yaml'), yaml)
    const result = await handlePolicyShow()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.raw).toContain('require_simulation')
    expect(result.data.raw).toContain('max_gas_usd')
  })

  it('reflects per-account rules when present', async () => {
    writeFileSync(
      join(tmpDir, 'policy.yaml'),
      `version: 1\ndefaults:\n  require_simulation: false\n  max_gas_usd: 10.00\n  max_value_per_tx_usd: 1000.00\naccounts:\n  hot-wallet:\n    max_value_per_tx_usd: 50.00\n`
    )
    const result = await handlePolicyShow()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.accounts?.['hot-wallet']?.max_value_per_tx_usd).toBe(50)
  })
})
