import { describe, it, expect } from 'bun:test'
import {
  generateEOA,
  derivePrivateKeyFromMnemonic,
  importFromPrivateKey,
  importFromMnemonic,
  DEFAULT_EVM_PATH,
} from '../../src/accounts/eoa.js'
import { TEST_MNEMONIC, TEST_ADDRESS, TEST_PRIVATE_KEY } from '../helpers.js'
import { isAddress } from 'viem'

describe('generateEOA', () => {
  it('generates a valid EVM address', () => {
    const result = generateEOA()
    expect(isAddress(result.address)).toBe(true)
    expect(result.privateKey).toMatch(/^0x[0-9a-f]{64}$/i)
    expect(result.mnemonic.split(' ')).toHaveLength(12)
  })

  it('uses default derivation path', () => {
    const result = generateEOA()
    expect(result.derivationPath).toBe(DEFAULT_EVM_PATH)
  })

  it('generates unique keys each call', () => {
    const a = generateEOA()
    const b = generateEOA()
    expect(a.address).not.toBe(b.address)
    expect(a.mnemonic).not.toBe(b.mnemonic)
  })
})

describe('derivePrivateKeyFromMnemonic', () => {
  it('derives deterministic key from test mnemonic', () => {
    const pk = derivePrivateKeyFromMnemonic(TEST_MNEMONIC)
    expect(pk).toBe(TEST_PRIVATE_KEY)
  })

  it('returns different keys for different paths', () => {
    const pk0 = derivePrivateKeyFromMnemonic(TEST_MNEMONIC, "m/44'/60'/0'/0/0")
    const pk1 = derivePrivateKeyFromMnemonic(TEST_MNEMONIC, "m/44'/60'/0'/0/1")
    expect(pk0).not.toBe(pk1)
  })
})

describe('importFromPrivateKey', () => {
  it('recovers the correct address from a known private key', () => {
    const result = importFromPrivateKey(TEST_PRIVATE_KEY)
    expect(result.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
    expect(result.privateKey).toMatch(/^0x[0-9a-f]{64}$/i)
  })

  it('handles key without 0x prefix', () => {
    const raw = TEST_PRIVATE_KEY.slice(2)
    const result = importFromPrivateKey(raw)
    expect(result.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
  })
})

describe('importFromMnemonic', () => {
  it('derives the correct address from test mnemonic', () => {
    const result = importFromMnemonic(TEST_MNEMONIC)
    expect(result.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
  })

  it('uses a custom derivation path', () => {
    const r0 = importFromMnemonic(TEST_MNEMONIC, "m/44'/60'/0'/0/0")
    const r1 = importFromMnemonic(TEST_MNEMONIC, "m/44'/60'/0'/0/1")
    expect(r0.address).not.toBe(r1.address)
  })
})
