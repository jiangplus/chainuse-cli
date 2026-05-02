/**
 * Shared test helpers: temp CHAINUSE_HOME, seeded accounts, mock provider.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resetStateDb } from '../src/state/db.js'
import { resetKeystoreDb } from '../src/keystore/index.js'

export function resetDbs(): void {
  resetStateDb()
  resetKeystoreDb()
}

// ─── Temp home ────────────────────────────────────────────────────────────────

export function createTempHome(): string {
  const dir = join(tmpdir(), `chainuse-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function removeTempHome(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}

/**
 * Write a minimal config + policy into a temp CHAINUSE_HOME so handlers can
 * call loadConfig() without hitting the real ~/.chainuse directory.
 */
export function setupTempHome(dir: string, extraProviders: Record<string, unknown> = {}): void {
  const config = {
    version: 1,
    default_chain: 'eip155:1',
    providers: {
      'eip155:1': { kind: 'alchemy', url: 'https://eth-mainnet.g.alchemy.com/v2', key_env: 'ALCHEMY_API_KEY' },
      ...extraProviders,
    },
  }
  const policy = `version: 1\ndefaults:\n  require_simulation: false\n  max_gas_usd: 10.00\n  max_value_per_tx_usd: 1000.00\n`

  writeFileSync(join(dir, 'config.yaml'), Object.entries(config.providers).length
    ? `version: 1\ndefault_chain: eip155:1\nproviders:\n  eip155:1:\n    kind: alchemy\n    url: https://eth-mainnet.g.alchemy.com/v2\n    key_env: ALCHEMY_API_KEY\n`
    : `version: 1\ndefault_chain: eip155:1\nproviders: {}\n`
  )
  writeFileSync(join(dir, 'policy.yaml'), policy)
}

// ─── Well-known test fixtures ─────────────────────────────────────────────────

export const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const USDC_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const WETH_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

// A deterministic test private key (DO NOT use on mainnet)
export const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
export const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
export const TEST_MNEMONIC = 'test test test test test test test test test test test junk'

// ─── Skip guard for live-network tests ───────────────────────────────────────

export const LIVE = process.env.CHAINUSE_TEST_LIVE === '1'
export function skipUnlessLive() {
  if (!LIVE) return true // truthy → bun:test `skip` condition
  return false
}
