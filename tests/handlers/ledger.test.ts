import { describe, it, expect } from 'bun:test'
import { handleLedgerAddress, handleLedgerList, handleLedgerSign } from '../../src/handlers/ledger.js'

// Ledger tests require a physical device, so all live tests are skipped by default.
// Set CHAINUSE_TEST_LEDGER=1 and plug in a Ledger with the Ethereum app open to run them.
const HAS_LEDGER = process.env.CHAINUSE_TEST_LEDGER === '1'

describe('handleLedgerAddress — no device', () => {
  it.skipIf(HAS_LEDGER)('returns an error when no Ledger is connected', async () => {
    const result = await handleLedgerAddress({})
    expect(result.ok).toBe(false)
    if (result.ok) return
    // HID transport errors vary by OS; any error is acceptable
    expect(result.error.message).toBeTruthy()
  })
})

describe('handleLedgerList — no device', () => {
  it.skipIf(HAS_LEDGER)('returns an error when no Ledger is connected', async () => {
    const result = await handleLedgerList({ count: 1 })
    expect(result.ok).toBe(false)
  })
})

describe('handleLedgerSign — no device', () => {
  it.skipIf(HAS_LEDGER)('returns an error when no Ledger is connected', async () => {
    const result = await handleLedgerSign({ message: 'hello' })
    expect(result.ok).toBe(false)
  })
})

describe('handleLedgerAddress — live device', () => {
  it.skipIf(!HAS_LEDGER)('returns an EVM address at default path', async () => {
    const result = await handleLedgerAddress({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(result.data.path).toBe("m/44'/60'/0'/0/0")
  })

  it.skipIf(!HAS_LEDGER)('returns different addresses at different paths', async () => {
    const r0 = await handleLedgerAddress({ path: "m/44'/60'/0'/0/0" })
    const r1 = await handleLedgerAddress({ path: "m/44'/60'/0'/0/1" })
    expect(r0.ok && r1.ok).toBe(true)
    if (!r0.ok || !r1.ok) return
    expect(r0.data.address).not.toBe(r1.data.address)
  })
})

describe('handleLedgerList — live device', () => {
  it.skipIf(!HAS_LEDGER)('lists 5 addresses by default', async () => {
    const result = await handleLedgerList({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(5)
    for (const entry of result.data) {
      expect(entry.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(entry.path).toContain("m/44'/60'")
    }
  })
})
