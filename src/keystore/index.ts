import { openCompatDb, type CompatDB } from '../state/db-compat.js'
import { scrypt } from '@noble/hashes/scrypt'
import { randomBytes } from 'node:crypto'
import { getKeystorePath } from '../config/index.js'

let _db: CompatDB | null = null

export function resetKeystoreDb(): void { _db = null }

function openKeystoreDb(): CompatDB {
  if (_db) return _db
  const dbPath = getKeystorePath()
  _db = openCompatDb(dbPath)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      alias TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      address TEXT NOT NULL,
      encrypted_data BLOB NOT NULL,
      salt BLOB NOT NULL,
      nonce BLOB NOT NULL,
      created_at INTEGER NOT NULL
    )
  `)
  return _db
}

type KeyRow = {
  alias: string
  chain: string
  address: string
  encrypted_data: Buffer
  salt: Buffer
  nonce: Buffer
  created_at: number
}

type KeyMaterial = {
  mnemonic?: string
  privateKey?: string
}

function deriveKey(passphrase: string, salt: Uint8Array): Uint8Array {
  // N=262144 (2^18) matches go-ethereum keystore standard; 8× harder than the previous 2^15.
  return scrypt(passphrase, salt, { N: 262144, r: 8, p: 1, dkLen: 32 })
}

async function encryptData(key: Uint8Array, plaintext: string): Promise<{ nonce: Buffer; ciphertext: Buffer }> {
  const { subtle } = globalThis.crypto
  const nonce = randomBytes(12)
  const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt'])
  const enc = new TextEncoder()
  const cipherBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    enc.encode(plaintext)
  )
  return { nonce, ciphertext: Buffer.from(cipherBuf) }
}

async function decryptData(key: Uint8Array, nonce: Buffer, ciphertext: Buffer): Promise<string> {
  const { subtle } = globalThis.crypto
  const cryptoKey = await subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt'])
  let plainBuf: ArrayBuffer
  try {
    plainBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      ciphertext
    )
  } catch {
    throw new Error('DECRYPTION_FAILED: Invalid passphrase or corrupted keystore entry')
  }
  return new TextDecoder().decode(plainBuf)
}

export function getPassphrase(flagValue?: string): string {
  const passphrase = flagValue ?? process.env['CHAINUSE_PASSPHRASE']
  if (!passphrase) {
    throw new Error(
      'Passphrase required. Set CHAINUSE_PASSPHRASE env var or use --passphrase flag.'
    )
  }
  return passphrase
}

export async function storeKey(params: {
  alias: string
  chain: string
  address: string
  material: KeyMaterial
  passphrase: string
}): Promise<void> {
  const db = openKeystoreDb()
  const existing = db.prepare('SELECT 1 FROM keys WHERE alias = ?').get(params.alias)
  if (existing) throw new Error(`ALIAS_EXISTS: Key with alias "${params.alias}" already exists`)

  const salt = randomBytes(32)
  const key = deriveKey(params.passphrase, salt)
  const plaintext = JSON.stringify(params.material)
  const { nonce, ciphertext } = await encryptData(key, plaintext)

  db.prepare(`
    INSERT INTO keys (alias, chain, address, encrypted_data, salt, nonce, created_at)
    VALUES (@alias, @chain, @address, @encryptedData, @salt, @nonce, @createdAt)
  `).run({
    alias: params.alias,
    chain: params.chain,
    address: params.address,
    encryptedData: ciphertext,
    salt,
    nonce,
    createdAt: Date.now(),
  })
}

export async function loadKey(alias: string, passphrase: string): Promise<KeyMaterial> {
  const db = openKeystoreDb()
  const row = db.prepare('SELECT * FROM keys WHERE alias = ?').get(alias) as KeyRow | undefined
  if (!row) throw new Error(`ALIAS_NOT_FOUND: Key with alias "${alias}" not found`)

  const key = deriveKey(passphrase, row.salt)
  const plaintext = await decryptData(key, row.nonce, row.encrypted_data)
  return JSON.parse(plaintext) as KeyMaterial
}

export function keystoreAliasExists(alias: string): boolean {
  const db = openKeystoreDb()
  return db.prepare('SELECT 1 FROM keys WHERE alias = ?').get(alias) != null
}
