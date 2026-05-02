import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleAccountList, handleAccountInfo } from '../../src/handlers/account.js'
import { handleKeysGenerate } from '../../src/handlers/keys.js'
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

describe('handleAccountList', () => {
  it('returns empty list when no smart accounts exist', async () => {
    const result = await handleAccountList({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data)).toBe(true)
  })
})

describe('handleAccountInfo', () => {
  it('returns ALIAS_NOT_FOUND for unknown alias', async () => {
    const result = await handleAccountInfo({ alias: 'ghost' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('ALIAS_NOT_FOUND')
  })
})
