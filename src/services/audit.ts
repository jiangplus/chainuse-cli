import { appendFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { getAuditLogPath } from '../config/index.js'
import { insertAuditEntry } from '../state/index.js'
import type { AuditEntry } from '../core/types.js'

export function writeAuditEntry(entry: AuditEntry): void {
  // Write to SQLite for query/spend-tracking
  try {
    insertAuditEntry(entry)
  } catch {
    // best-effort
  }

  // Append to the human-readable JSON-lines file
  try {
    const path = getAuditLogPath()
    mkdirSync(dirname(path), { recursive: true })
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // best-effort: never fail a tx because audit write failed
  }
}
