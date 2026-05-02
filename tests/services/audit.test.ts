import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { writeAuditEntry } from '../../src/services/audit.js'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AuditEntry } from '../../src/core/types.js'

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

function makeEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: new Date().toISOString(),
    op: 'send',
    account: 'alice',
    chain: 'eip155:1',
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    value_eth: '0.1',
    value_usd: '300.00',
    decision: 'allow',
    reasons: ['All policy checks passed'],
    ...overrides,
  }
}

describe('writeAuditEntry', () => {
  it('creates audit.log and writes a JSON line', () => {
    writeAuditEntry(makeEntry())
    const logPath = join(tmpDir, 'audit.log')
    expect(existsSync(logPath)).toBe(true)
    const line = readFileSync(logPath, 'utf-8').trim()
    const entry = JSON.parse(line)
    expect(entry.op).toBe('send')
    expect(entry.account).toBe('alice')
    expect(entry.decision).toBe('allow')
  })

  it('appends multiple entries as separate lines', () => {
    writeAuditEntry(makeEntry({ op: 'send' }))
    writeAuditEntry(makeEntry({ op: 'swap' }))
    writeAuditEntry(makeEntry({ op: 'supply', decision: 'deny' }))
    const logPath = join(tmpDir, 'audit.log')
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean)
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).op).toBe('send')
    expect(JSON.parse(lines[1]).op).toBe('swap')
    expect(JSON.parse(lines[2]).decision).toBe('deny')
  })

  it('never throws even when given a broken home path', () => {
    process.env.CHAINUSE_HOME = '/proc/nonexistent-path-for-test'
    expect(() => writeAuditEntry(makeEntry())).not.toThrow()
  })

  it('serialises all AuditEntry fields', () => {
    const entry = makeEntry({ hash: '0xabc123', gas_usd: '0.50' })
    writeAuditEntry(entry)
    const logPath = join(tmpDir, 'audit.log')
    const parsed = JSON.parse(readFileSync(logPath, 'utf-8').trim())
    expect(parsed.hash).toBe('0xabc123')
    expect(parsed.gas_usd).toBe('0.50')
    expect(parsed.chain).toBe('eip155:1')
  })
})
