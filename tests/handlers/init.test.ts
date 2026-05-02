import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handleInit } from '../../src/handlers/init.js'
import { createTempHome, removeTempHome, resetDbs } from '../helpers.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('handleInit', () => {
  it('creates config.yaml and policy.yaml', async () => {
    const result = await handleInit({})
    expect(result.ok).toBe(true)
    expect(existsSync(join(tmpDir, 'config.yaml'))).toBe(true)
    expect(existsSync(join(tmpDir, 'policy.yaml'))).toBe(true)
  })

  it('returns ok:false on second init without force', async () => {
    await handleInit({})
    const second = await handleInit({})
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error.code).toBe('ALREADY_INITIALIZED')
  })

  it('succeeds on second init with force:true', async () => {
    await handleInit({})
    const second = await handleInit({ force: true })
    expect(second.ok).toBe(true)
  })
})
