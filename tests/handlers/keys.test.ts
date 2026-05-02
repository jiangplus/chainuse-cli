import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleKeysGenerate, handleKeysImport, handleKeysList } from '../../src/handlers/keys.js'
import { createTempHome, removeTempHome, setupTempHome, TEST_PRIVATE_KEY, TEST_ADDRESS, TEST_MNEMONIC, resetDbs } from '../helpers.js'
import { isAddress } from 'viem'

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

describe('handleKeysGenerate', () => {
  it('generates a new EVM key with a random address', async () => {
    const result = await handleKeysGenerate({ chain: 'evm', alias: 'test-evm' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(isAddress(result.data.address)).toBe(true)
    expect(result.data.alias).toBe('test-evm')
    expect(result.data.chain).toBe('evm')
  })

  it('generates a Solana key', async () => {
    const result = await handleKeysGenerate({ chain: 'solana', alias: 'test-sol' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address).toBeTruthy()
    expect(result.data.chain).toBe('solana')
  })

  it('generates a Bitcoin key', async () => {
    const result = await handleKeysGenerate({ chain: 'btc', alias: 'test-btc' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address).toMatch(/^bc1/)
    expect(result.data.chain).toBe('btc')
  })

  it('generates a Sui key', async () => {
    const result = await handleKeysGenerate({ chain: 'sui', alias: 'test-sui' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address).toBeTruthy()
    expect(result.data.chain).toBe('sui')
  })

  it('rejects a duplicate alias', async () => {
    await handleKeysGenerate({ chain: 'evm', alias: 'dup' })
    const second = await handleKeysGenerate({ chain: 'evm', alias: 'dup' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('ALIAS_EXISTS')
  })

  it('uses auto-generated alias when not provided', async () => {
    const result = await handleKeysGenerate({ chain: 'evm' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.alias).toBeTruthy()
  })
})

describe('handleKeysImport', () => {
  it('imports from private key', async () => {
    const result = await handleKeysImport({
      from: 'privkey',
      value: TEST_PRIVATE_KEY,
      chain: 'evm',
      alias: 'imported-pk',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
  })

  it('imports from mnemonic', async () => {
    const result = await handleKeysImport({
      from: 'mnemonic',
      value: TEST_MNEMONIC,
      chain: 'evm',
      alias: 'imported-mn',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.address.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase())
  })

  it('rejects import with duplicate alias', async () => {
    await handleKeysImport({ from: 'privkey', value: TEST_PRIVATE_KEY, chain: 'evm', alias: 'dup-import' })
    const second = await handleKeysImport({ from: 'privkey', value: TEST_PRIVATE_KEY, chain: 'evm', alias: 'dup-import' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('ALIAS_EXISTS')
  })
})

describe('handleKeysList', () => {
  it('returns empty list initially', async () => {
    const result = await handleKeysList()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(0)
  })

  it('lists accounts after generation', async () => {
    await handleKeysGenerate({ chain: 'evm', alias: 'list-test-1' })
    await handleKeysGenerate({ chain: 'evm', alias: 'list-test-2' })
    const result = await handleKeysList()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.length).toBeGreaterThanOrEqual(2)
    const aliases = result.data.map((a) => a.alias)
    expect(aliases).toContain('list-test-1')
    expect(aliases).toContain('list-test-2')
  })
})
