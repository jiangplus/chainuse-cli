import { openStateDb } from './db.js'
import type { Account, TxEnvelope } from '../core/types.js'

// ─── Deployment type ──────────────────────────────────────────────────────────

export type Deployment = {
  address: string
  chainId: string
  txHash?: string
  abi?: string
  bytecodeHash?: string
  salt?: string
  deployer?: string
  createdAt?: number
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function insertAccount(account: Account): void {
  const db = openStateDb()
  db.prepare(`
    INSERT INTO accounts (alias, chain, address, type, derivation_path, created_at)
    VALUES (@alias, @chain, @address, @type, @derivationPath, @createdAt)
  `).run({
    alias: account.alias,
    chain: account.chain,
    address: account.address,
    type: account.type,
    derivationPath: account.derivationPath ?? null,
    createdAt: account.createdAt,
  })
}

export function getAccount(alias: string): Account | null {
  const db = openStateDb()
  const row = db
    .prepare('SELECT * FROM accounts WHERE alias = ?')
    .get(alias) as DbAccount | undefined
  return row ? rowToAccount(row) : null
}

export function getAccountByAddress(address: string): Account | null {
  const db = openStateDb()
  const row = db
    .prepare('SELECT * FROM accounts WHERE address = ?')
    .get(address.toLowerCase()) as DbAccount | undefined
  if (!row) {
    // Also try mixed case
    const row2 = db
      .prepare('SELECT * FROM accounts WHERE LOWER(address) = LOWER(?)')
      .get(address) as DbAccount | undefined
    return row2 ? rowToAccount(row2) : null
  }
  return rowToAccount(row)
}

export function listAccounts(): Account[] {
  const db = openStateDb()
  const rows = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as DbAccount[]
  return rows.map(rowToAccount)
}

export function accountExists(alias: string): boolean {
  const db = openStateDb()
  const row = db.prepare('SELECT 1 FROM accounts WHERE alias = ?').get(alias)
  return row !== undefined
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function insertTx(envelope: TxEnvelope): void {
  const db = openStateDb()
  db.prepare(`
    INSERT INTO tx_history (
      id, status, chain_id, from_address, to_address, value, data,
      gas_estimate, gas_price, max_fee_per_gas, max_priority_fee_per_gas,
      nonce, signed_raw_tx, hash, simulation_result, created_at, updated_at
    ) VALUES (
      @id, @status, @chainId, @from, @to, @value, @data,
      @gasEstimate, @gasPrice, @maxFeePerGas, @maxPriorityFeePerGas,
      @nonce, @signedRawTx, @hash, @simulationResult, @createdAt, @updatedAt
    )
  `).run(envelopeToRow(envelope))
}

export function updateTx(envelope: TxEnvelope): void {
  const db = openStateDb()
  const row = envelopeToRow(envelope)
  db.prepare(`
    UPDATE tx_history SET
      status = @status,
      gas_estimate = @gasEstimate,
      gas_price = @gasPrice,
      max_fee_per_gas = @maxFeePerGas,
      max_priority_fee_per_gas = @maxPriorityFeePerGas,
      nonce = @nonce,
      signed_raw_tx = @signedRawTx,
      hash = @hash,
      simulation_result = @simulationResult,
      updated_at = @updatedAt
    WHERE id = @id
  `).run(row)
}

export function getTx(id: string): TxEnvelope | null {
  const db = openStateDb()
  const row = db.prepare('SELECT * FROM tx_history WHERE id = ?').get(id) as DbTx | undefined
  return row ? rowToEnvelope(row) : null
}

export function listTxs(): TxEnvelope[] {
  const db = openStateDb()
  const rows = db
    .prepare('SELECT * FROM tx_history ORDER BY created_at DESC')
    .all() as DbTx[]
  return rows.map(rowToEnvelope)
}

// ─── Deployments ─────────────────────────────────────────────────────────────

export function insertDeployment(deployment: Deployment): void {
  const db = openStateDb()
  db.prepare(`
    INSERT OR REPLACE INTO deployments (address, chain_id, tx_hash, abi, bytecode_hash, salt, deployer, created_at)
    VALUES (@address, @chainId, @txHash, @abi, @bytecodeHash, @salt, @deployer, @createdAt)
  `).run({
    address: deployment.address,
    chainId: deployment.chainId,
    txHash: deployment.txHash ?? null,
    abi: deployment.abi ?? null,
    bytecodeHash: deployment.bytecodeHash ?? null,
    salt: deployment.salt ?? null,
    deployer: deployment.deployer ?? null,
    createdAt: deployment.createdAt ?? Date.now(),
  })
}

export function getDeployment(address: string, chainId: string): Deployment | null {
  const db = openStateDb()
  const row = db
    .prepare('SELECT * FROM deployments WHERE LOWER(address) = LOWER(?) AND chain_id = ?')
    .get(address, chainId) as DbDeployment | undefined
  return row ? rowToDeployment(row) : null
}

export function listDeployments(chainId?: string): Deployment[] {
  const db = openStateDb()
  let rows: DbDeployment[]
  if (chainId) {
    rows = db
      .prepare('SELECT * FROM deployments WHERE chain_id = ? ORDER BY created_at DESC')
      .all(chainId) as DbDeployment[]
  } else {
    rows = db
      .prepare('SELECT * FROM deployments ORDER BY created_at DESC')
      .all() as DbDeployment[]
  }
  return rows.map(rowToDeployment)
}

// ─── Internal types ──────────────────────────────────────────────────────────

type DbAccount = {
  alias: string
  chain: string
  address: string
  type: string
  derivation_path: string | null
  created_at: number
}

type DbTx = {
  id: string
  status: string
  chain_id: string
  from_address: string
  to_address: string
  value: string
  data: string | null
  gas_estimate: string | null
  gas_price: string | null
  max_fee_per_gas: string | null
  max_priority_fee_per_gas: string | null
  nonce: number | null
  signed_raw_tx: string | null
  hash: string | null
  simulation_result: string | null
  created_at: number
  updated_at: number
}

type DbDeployment = {
  address: string
  chain_id: string
  tx_hash: string | null
  abi: string | null
  bytecode_hash: string | null
  salt: string | null
  deployer: string | null
  created_at: number | null
}

function rowToDeployment(row: DbDeployment): Deployment {
  return {
    address: row.address,
    chainId: row.chain_id,
    txHash: row.tx_hash ?? undefined,
    abi: row.abi ?? undefined,
    bytecodeHash: row.bytecode_hash ?? undefined,
    salt: row.salt ?? undefined,
    deployer: row.deployer ?? undefined,
    createdAt: row.created_at ?? undefined,
  }
}

function rowToAccount(row: DbAccount): Account {
  return {
    alias: row.alias,
    chain: row.chain,
    address: row.address,
    type: row.type as 'eoa',
    derivationPath: row.derivation_path ?? undefined,
    createdAt: row.created_at,
  }
}

function envelopeToRow(e: TxEnvelope) {
  return {
    id: e.id,
    status: e.status,
    chainId: e.chainId,
    from: e.from,
    to: e.to,
    value: e.value.toString(),
    data: e.data ?? null,
    gasEstimate: e.gasEstimate?.toString() ?? null,
    gasPrice: e.gasPrice?.toString() ?? null,
    maxFeePerGas: e.maxFeePerGas?.toString() ?? null,
    maxPriorityFeePerGas: e.maxPriorityFeePerGas?.toString() ?? null,
    nonce: e.nonce ?? null,
    signedRawTx: e.signedRawTx ?? null,
    hash: e.hash ?? null,
    simulationResult: e.simulationResult !== undefined
      ? JSON.stringify(e.simulationResult, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
      : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }
}

function rowToEnvelope(row: DbTx): TxEnvelope {
  return {
    id: row.id,
    status: row.status as TxEnvelope['status'],
    chainId: row.chain_id,
    from: row.from_address,
    to: row.to_address,
    value: BigInt(row.value),
    data: row.data ?? undefined,
    gasEstimate: row.gas_estimate ? BigInt(row.gas_estimate) : undefined,
    gasPrice: row.gas_price ? BigInt(row.gas_price) : undefined,
    maxFeePerGas: row.max_fee_per_gas ? BigInt(row.max_fee_per_gas) : undefined,
    maxPriorityFeePerGas: row.max_priority_fee_per_gas
      ? BigInt(row.max_priority_fee_per_gas)
      : undefined,
    nonce: row.nonce ?? undefined,
    signedRawTx: row.signed_raw_tx ?? undefined,
    hash: row.hash ?? undefined,
    simulationResult: row.simulation_result ? JSON.parse(row.simulation_result) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
