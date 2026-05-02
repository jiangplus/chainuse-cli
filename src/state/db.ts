import { openCompatDb, type CompatDB } from './db-compat.js'
import { getStatePath } from '../config/index.js'

let _db: CompatDB | null = null

export function resetStateDb(): void { _db = null }

export function openStateDb(): CompatDB {
  if (_db) return _db
  const dbPath = getStatePath()
  _db = openCompatDb(dbPath)
  migrate(_db)
  return _db
}

function migrate(db: CompatDB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      alias TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      address TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'eoa',
      derivation_path TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tx_history (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      value TEXT NOT NULL,
      data TEXT,
      gas_estimate TEXT,
      gas_price TEXT,
      max_fee_per_gas TEXT,
      max_priority_fee_per_gas TEXT,
      nonce INTEGER,
      signed_raw_tx TEXT,
      hash TEXT,
      simulation_result TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nonce_cache (
      address TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      nonce INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (address, chain_id)
    );

    CREATE TABLE IF NOT EXISTS deployments (
      address TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      tx_hash TEXT,
      abi TEXT,
      bytecode_hash TEXT,
      salt TEXT,
      deployer TEXT,
      created_at INTEGER,
      PRIMARY KEY (address, chain_id)
    );

    CREATE TABLE IF NOT EXISTS smart_accounts (
      alias TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      address TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      owner_alias TEXT NOT NULL,
      factory TEXT,
      delegate TEXT,
      paymaster_policy TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS safe_txs (
      safe_tx_hash TEXT PRIMARY KEY,
      safe_address TEXT NOT NULL,
      chain_id TEXT NOT NULL,
      to_address TEXT NOT NULL,
      value TEXT NOT NULL,
      data TEXT,
      nonce INTEGER,
      signatures TEXT,
      status TEXT NOT NULL,
      tx_hash TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS wc_sessions (
      topic TEXT PRIMARY KEY,
      peer_name TEXT NOT NULL,
      peer_url TEXT,
      peer_icons TEXT,
      accounts TEXT NOT NULL,
      chains TEXT NOT NULL,
      expiry INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wc_pending (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      method TEXT NOT NULL,
      params TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      op TEXT NOT NULL,
      account TEXT NOT NULL,
      chain TEXT NOT NULL,
      to_address TEXT,
      value_eth TEXT,
      value_usd TEXT,
      gas_usd TEXT,
      hash TEXT,
      decision TEXT NOT NULL,
      reasons TEXT NOT NULL
    );
  `)
}
