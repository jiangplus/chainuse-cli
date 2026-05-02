import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleDeploy, handleDeploymentsList, handleDeploymentShow } from '../../src/handlers/deploy.js'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('handleDeploy — validation', () => {
  it('returns error when bytecode is missing', async () => {
    const result = await handleDeploy({ bytecode: '', account: 'alice' })
    expect(result.ok).toBe(false)
  })

  it('returns error for invalid bytecode (not hex)', async () => {
    const result = await handleDeploy({ bytecode: 'not-hex', account: 'alice' })
    expect(result.ok).toBe(false)
  })

  it('returns ALIAS_NOT_FOUND for unknown account', async () => {
    const result = await handleDeploy({ bytecode: '0x6080', account: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleDeploymentsList', () => {
  it('returns empty list initially', async () => {
    const result = await handleDeploymentsList({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data).toHaveLength(0)
  })
})

describe('handleDeploymentShow', () => {
  it('returns error for unknown deployment address', async () => {
    const result = await handleDeploymentShow({ address: '0x1234567890123456789012345678901234567890' })
    expect(result.ok).toBe(false)
  })
})
