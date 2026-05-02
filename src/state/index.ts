import { openStateDb } from './db.js'
import type { Account, TxEnvelope } from '../core/types.js'

// ─── Smart Accounts ──────────────────────────────────────────────────────────

export type StoredAccount = {
  alias: string
  type: '4337' | '7702'
  address: string
  chainId: string
  ownerAlias: string
  factory?: string
  delegate?: string
  paymasterPolicy?: string
  createdAt: number
}

type DbSmartAccount = {
  alias: string
  type: string
  address: string
  chain_id: string
  owner_alias: string
  factory: string | null
  delegate: string | null
  paymaster_policy: string | null
  created_at: number
}

function rowToSmartAccount(row: DbSmartAccount): StoredAccount {
  return {
    alias: row.alias,
    type: row.type as '4337' | '7702',
    address: row.address,
    chainId: row.chain_id,
    ownerAlias: row.owner_alias,
    factory: row.factory ?? undefined,
    delegate: row.delegate ?? undefined,
    paymasterPolicy: row.paymaster_policy ?? undefined,
    createdAt: row.created_at,
  }
}

export function insertSmartAccount(account: StoredAccount): void {
  const db = openStateDb()
  db.prepare(`
    INSERT INTO smart_accounts (alias, type, address, chain_id, owner_alias, factory, delegate, paymaster_policy, created_at)
    VALUES (@alias, @type, @address, @chainId, @ownerAlias, @factory, @delegate, @paymasterPolicy, @createdAt)
  `).run({
    alias: account.alias,
    type: account.type,
    address: account.address,
    chainId: account.chainId,
    ownerAlias: account.ownerAlias,
    factory: account.factory ?? null,
    delegate: account.delegate ?? null,
    paymasterPolicy: account.paymasterPolicy ?? null,
    createdAt: account.createdAt,
  })
}

export function getSmartAccount(alias: string): StoredAccount | null {
  const db = openStateDb()
  const row = db
    .prepare('SELECT * FROM smart_accounts WHERE alias = ?')
    .get(alias) as DbSmartAccount | undefined
  return row ? rowToSmartAccount(row) : null
}

export function listSmartAccounts(chainId?: string): StoredAccount[] {
  const db = openStateDb()
  let rows: DbSmartAccount[]
  if (chainId) {
    rows = db
      .prepare('SELECT * FROM smart_accounts WHERE chain_id = ? ORDER BY created_at ASC')
      .all(chainId) as DbSmartAccount[]
  } else {
    rows = db
      .prepare('SELECT * FROM smart_accounts ORDER BY created_at ASC')
      .all() as DbSmartAccount[]
  }
  return rows.map(rowToSmartAccount)
}

export function smartAccountExists(alias: string): boolean {
  const db = openStateDb()
  return db.prepare('SELECT 1 FROM smart_accounts WHERE alias = ?').get(alias) !== undefined
}

// ─── Safe Transactions ───────────────────────────────────────────────────────

export type StoredSafeTx = {
  safeTxHash: string
  safeAddress: string
  chainId: string
  toAddress: string
  value: string
  data: string | null
  nonce: number | null
  signatures: string | null
  status: 'pending' | 'executed' | 'failed'
  txHash: string | null
  createdAt: number
  updatedAt: number
}

type DbSafeTx = {
  safe_tx_hash: string
  safe_address: string
  chain_id: string
  to_address: string
  value: string
  data: string | null
  nonce: number | null
  signatures: string | null
  status: string
  tx_hash: string | null
  created_at: number
  updated_at: number
}

function rowToSafeTx(row: DbSafeTx): StoredSafeTx {
  return {
    safeTxHash: row.safe_tx_hash,
    safeAddress: row.safe_address,
    chainId: row.chain_id,
    toAddress: row.to_address,
    value: row.value,
    data: row.data,
    nonce: row.nonce,
    signatures: row.signatures,
    status: row.status as StoredSafeTx['status'],
    txHash: row.tx_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function insertSafeTx(tx: StoredSafeTx): void {
  const db = openStateDb()
  db.prepare(`
    INSERT INTO safe_txs (safe_tx_hash, safe_address, chain_id, to_address, value, data, nonce, signatures, status, tx_hash, created_at, updated_at)
    VALUES (@safeTxHash, @safeAddress, @chainId, @toAddress, @value, @data, @nonce, @signatures, @status, @txHash, @createdAt, @updatedAt)
  `).run({
    safeTxHash: tx.safeTxHash,
    safeAddress: tx.safeAddress,
    chainId: tx.chainId,
    toAddress: tx.toAddress,
    value: tx.value,
    data: tx.data ?? null,
    nonce: tx.nonce ?? null,
    signatures: tx.signatures ?? null,
    status: tx.status,
    txHash: tx.txHash ?? null,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  })
}

export function updateSafeTx(patch: {
  safeTxHash: string
  signatures?: string
  status?: string
  txHash?: string | null
  updatedAt: number
}): void {
  const db = openStateDb()
  db.prepare(`
    UPDATE safe_txs SET
      signatures = COALESCE(@signatures, signatures),
      status = COALESCE(@status, status),
      tx_hash = COALESCE(@txHash, tx_hash),
      updated_at = @updatedAt
    WHERE safe_tx_hash = @safeTxHash
  `).run({
    safeTxHash: patch.safeTxHash,
    signatures: patch.signatures ?? null,
    status: patch.status ?? null,
    txHash: patch.txHash ?? null,
    updatedAt: patch.updatedAt,
  })
}

export function getSafeTx(safeTxHash: string): StoredSafeTx | null {
  const db = openStateDb()
  const row = db
    .prepare('SELECT * FROM safe_txs WHERE safe_tx_hash = ?')
    .get(safeTxHash) as DbSafeTx | undefined
  return row ? rowToSafeTx(row) : null
}

export function listSafeTxs(safeAddress?: string): StoredSafeTx[] {
  const db = openStateDb()
  let rows: DbSafeTx[]
  if (safeAddress) {
    rows = db
      .prepare('SELECT * FROM safe_txs WHERE LOWER(safe_address) = LOWER(?) ORDER BY created_at DESC')
      .all(safeAddress) as DbSafeTx[]
  } else {
    rows = db
      .prepare('SELECT * FROM safe_txs ORDER BY created_at DESC')
      .all() as DbSafeTx[]
  }
  return rows.map(rowToSafeTx)
}

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
