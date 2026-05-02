import { describe, it, expect } from 'bun:test'
import { buildSiweMessage, signSiweMessage, verifySiweMessage } from '../../src/services/siwe.js'
import { TEST_PRIVATE_KEY, TEST_ADDRESS } from '../helpers.js'

describe('buildSiweMessage', () => {
  const base = {
    domain: 'example.com',
    address: TEST_ADDRESS,
    uri: 'https://example.com/login',
    chainId: 1,
  }

  it('builds a valid SIWE message', () => {
    const result = buildSiweMessage(base)
    expect(result.message).toContain('example.com')
    expect(result.message).toContain(TEST_ADDRESS)
    expect(result.message).toContain('https://example.com/login')
    expect(result.nonce).toBeTruthy()
    expect(result.issuedAt).toBeTruthy()
  })

  it('uses provided nonce', () => {
    const result = buildSiweMessage({ ...base, nonce: 'fixednonce12345' })
    expect(result.nonce).toBe('fixednonce12345')
    expect(result.message).toContain('fixednonce12345')
  })

  it('includes optional statement', () => {
    const result = buildSiweMessage({ ...base, statement: 'Sign in to access your account' })
    expect(result.message).toContain('Sign in to access your account')
  })

  it('includes chain ID', () => {
    const result = buildSiweMessage({ ...base, chainId: 8453 })
    expect(result.message).toContain('8453')
  })

  it('generates unique nonces across calls', () => {
    const a = buildSiweMessage(base)
    const b = buildSiweMessage(base)
    expect(a.nonce).not.toBe(b.nonce)
  })
})

describe('signSiweMessage + verifySiweMessage round-trip', () => {
  it('produces a valid signature that verifies correctly', async () => {
    const built = buildSiweMessage({
      domain: 'example.com',
      address: TEST_ADDRESS,
      uri: 'https://example.com',
      chainId: 1,
    })

    const { signature } = await signSiweMessage({
      message: built.message,
      privateKey: TEST_PRIVATE_KEY,
    })

    expect(signature).toMatch(/^0x[0-9a-f]+$/i)

    const verified = await verifySiweMessage({ message: built.message, signature })
    expect(verified.valid).toBe(true)
    expect(verified.address?.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
    expect(verified.domain).toBe('example.com')
    expect(verified.chainId).toBe(1)
  })

  it('fails verification with a tampered message', async () => {
    const built = buildSiweMessage({
      domain: 'example.com',
      address: TEST_ADDRESS,
      uri: 'https://example.com',
      chainId: 1,
    })

    const { signature } = await signSiweMessage({ message: built.message, privateKey: TEST_PRIVATE_KEY })
    const tampered = built.message.replace('example.com', 'evil.com')
    const result = await verifySiweMessage({ message: tampered, signature })
    expect(result.valid).toBe(false)
  })

  it('returns error for malformed message', async () => {
    const result = await verifySiweMessage({ message: 'not-a-siwe-message', signature: '0x1234' })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
