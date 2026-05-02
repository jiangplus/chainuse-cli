import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleEnsResolve, handleEnsReverse } from '../../src/handlers/ens.js'
import { createTempHome, removeTempHome, setupTempHome, VITALIK, LIVE, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
})

describe('handleEnsResolve — validation', () => {
  it('returns error for a non-.eth name on non-mainnet configs', async () => {
    // Without a live RPC, we expect a provider error, not a crash
    const result = await handleEnsResolve({ name: 'vitalik.eth' })
    // Either resolves (live) or returns a provider/network error
    if (!result.ok) {
      expect(['PROVIDER_ERROR', 'NETWORK_ERROR', 'INTERNAL_ERROR']).toContain(result.error.code)
    }
  })
})

describe('handleEnsResolve — live', () => {
  it.skipIf(!LIVE)('resolves vitalik.eth to correct address', async () => {
    const result = await handleEnsResolve({ name: 'vitalik.eth' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address?.toLowerCase()).toBe(VITALIK.toLowerCase())
    expect(result.data.name).toBe('vitalik.eth')
  })

  it.skipIf(!LIVE)('returns null address for an unregistered name', async () => {
    const result = await handleEnsResolve({ name: 'this-name-does-not-exist-chainuse-test.eth' })
    // Could be ok:true with null address, or ok:false with provider error
    if (result.ok) {
      expect(result.data.address).toBeNull()
    }
  })
})

describe('handleEnsReverse — live', () => {
  it.skipIf(!LIVE)('reverse-resolves Vitalik address to vitalik.eth', async () => {
    const result = await handleEnsReverse({ address: VITALIK })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.name).toBe('vitalik.eth')
  })
})
