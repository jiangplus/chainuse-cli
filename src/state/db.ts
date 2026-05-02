import Database from 'better-sqlite3'
import { getStatePath } from '../config/index.js'

let _db: Database.Database | null = null

export function openStateDb(): Database.Database {
  if (_db) return _db

  const dbPath = getStatePath()
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  migrate(_db)
  return _db
}

function migrate(db: Database.Database): void {
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
  `)
}
