import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleSiweBuild, handleSiweSign, handleSiweVerify, handleSiweLogin } from '../../src/handlers/siwe.js'
import { handleKeysImport } from '../../src/handlers/keys.js'
import { createTempHome, removeTempHome, setupTempHome, TEST_ADDRESS, TEST_PRIVATE_KEY, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
  // Seed a known account for signing tests
  await handleKeysImport({ from: 'privkey', value: TEST_PRIVATE_KEY, chain: 'evm', alias: 'siwe-test' })
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('handleSiweBuild', () => {
  it('builds a SIWE message for a known account', async () => {
    const result = await handleSiweBuild({
      domain: 'example.com',
      ownerAlias: 'siwe-test',
      uri: 'https://example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.message).toContain('example.com')
    expect(result.data.message).toContain(TEST_ADDRESS)
    expect(result.data.nonce).toBeTruthy()
  })

  it('returns ALIAS_NOT_FOUND for unknown alias', async () => {
    const result = await handleSiweBuild({ domain: 'x.com', ownerAlias: 'ghost', uri: 'https://x.com' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleSiweSign', () => {
  it('signs a SIWE message and returns a 0x signature', async () => {
    const built = await handleSiweBuild({ domain: 'example.com', ownerAlias: 'siwe-test', uri: 'https://example.com' })
    if (!built.ok) throw new Error('build failed')

    const signed = await handleSiweSign({ message: built.data.message, ownerAlias: 'siwe-test' })
    expect(signed.ok).toBe(true)
    if (!signed.ok) return
    expect(signed.data.signature).toMatch(/^0x[0-9a-f]+$/i)
  })

  it('returns ALIAS_NOT_FOUND for unknown alias', async () => {
    const result = await handleSiweSign({ message: 'msg', ownerAlias: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})

describe('handleSiweVerify', () => {
  it('verifies a freshly-signed SIWE message as valid', async () => {
    const built = await handleSiweBuild({ domain: 'example.com', ownerAlias: 'siwe-test', uri: 'https://example.com' })
    if (!built.ok) throw new Error('build failed')
    const signed = await handleSiweSign({ message: built.data.message, ownerAlias: 'siwe-test' })
    if (!signed.ok) throw new Error('sign failed')

    const verified = await handleSiweVerify({ message: built.data.message, signature: signed.data.signature })
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.data.valid).toBe(true)
    expect(verified.data.address?.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
  })

  it('returns valid:false for a mismatched signature', async () => {
    const built = await handleSiweBuild({ domain: 'example.com', ownerAlias: 'siwe-test', uri: 'https://example.com' })
    if (!built.ok) throw new Error('build failed')

    const verified = await handleSiweVerify({
      message: built.data.message,
      signature: '0x' + 'ab'.repeat(65),
    })
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.data.valid).toBe(false)
  })
})

describe('handleSiweLogin', () => {
  it('performs build+sign in one step', async () => {
    const result = await handleSiweLogin({
      domain: 'app.example.com',
      ownerAlias: 'siwe-test',
      uri: 'https://app.example.com',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.message).toContain('app.example.com')
    expect(result.data.signature).toMatch(/^0x/)
    expect(result.data.nonce).toBeTruthy()
    expect(result.data.issuedAt).toBeTruthy()
  })
})
