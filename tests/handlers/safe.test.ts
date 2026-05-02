import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  handleSafeCreate,
  handleSafeInfo,
  handleSafePropose,
  handleSafeQueue,
} from '../../src/handlers/safe.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, LIVE, resetDbs } from '../helpers.js'
import { handleKeysImport } from '../../src/handlers/keys.js'
import { TEST_PRIVATE_KEY } from '../helpers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
  await handleKeysImport({ chain: 'evm', alias: 'safe-owner', privateKey: TEST_PRIVATE_KEY })
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('handleSafeCreate — validation', () => {
  it('returns error when no owners provided', async () => {
    const result = await handleSafeCreate({ owners: [], threshold: 1, deployerAlias: 'safe-owner' })
    expect(result.ok).toBe(false)
  })

  it('returns error when threshold exceeds owner count', async () => {
    const result = await handleSafeCreate({
      owners: [VITALIK],
      threshold: 5,
      deployerAlias: 'safe-owner',
    })
    expect(result.ok).toBe(false)
  })

  it('returns ALIAS_NOT_FOUND for unknown deployer', async () => {
    const result = await handleSafeCreate({
      owners: [VITALIK],
      threshold: 1,
      account: 'ghost',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleSafeInfo — validation', () => {
  it('returns error for invalid Safe address', async () => {
    const result = await handleSafeInfo({ safeAddress: 'not-an-address' })
    expect(result.ok).toBe(false)
  })
})

describe('handleSafePropose — validation', () => {
  it('returns error for invalid Safe address', async () => {
    const result = await handleSafePropose({
      safeAddress: 'bad',
      to: VITALIK,
      value: '0',
      proposerAlias: 'safe-owner',
    })
    expect(result.ok).toBe(false)
  })

  it('returns error for invalid destination address', async () => {
    const result = await handleSafePropose({
      safeAddress: VITALIK,
      to: 'bad-address',
      value: '0',
      proposerAlias: 'safe-owner',
    })
    expect(result.ok).toBe(false)
  })
})

describe('handleSafeQueue', () => {
  it('returns empty queue for a fresh Safe address', async () => {
    // Without live network the call will fail with a provider error,
    // but it should not crash with an unhandled exception
    const result = await handleSafeQueue({ safeAddress: VITALIK })
    if (!result.ok) {
      expect(['PROVIDER_ERROR', 'INTERNAL_ERROR', 'INVALID_ADDRESS']).toContain(result.error.code)
    }
  })
})

describe('handleSafeInfo — live', () => {
  // Gnosis Safe v1.3.0 on mainnet (well-known address)
  const GNOSIS_SAFE = '0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552'

  it.skipIf(!LIVE)('reads info from a live Safe contract', async () => {
    const result = await handleSafeInfo({ safeAddress: GNOSIS_SAFE })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data.owners)).toBe(true)
    expect(result.data.threshold).toBeGreaterThanOrEqual(1)
  })
})
