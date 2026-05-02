/**
 * Synchronous SQLite adapter — bun:sqlite when running under Bun,
 * better-sqlite3 when running under Node.js.
 *
 * Named-param compatibility note:
 *   better-sqlite3 supports @param SQL with { param: value } objects.
 *   bun:sqlite only supports positional ? or $param with { $param: value }.
 *   The wrapStmt() helper below translates @param SQL to positional ? so
 *   both runtimes accept the same calling convention.
 */

export type Stmt = {
  run(...args: unknown[]): unknown
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

export type CompatDB = {
  exec(sql: string): void
  prepare(sql: string): Stmt
}

// Translate `@param` SQL to `?` positional, return (positional_sql, ordered_keys)
function parseNamedParams(sql: string): { sql: string; keys: string[] } | null {
  const keys: string[] = []
  let hasNamed = false
  const positional = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    hasNamed = true
    keys.push(name)
    return '?'
  })
  return hasNamed ? { sql: positional, keys } : null
}

// Wrap a bun:sqlite statement to accept better-sqlite3-style { key: value } objects
function wrapStmt(rawPrepare: (sql: string) => Stmt, sql: string): Stmt {
  const parsed = parseNamedParams(sql)
  if (!parsed) {
    // No named params — pass through
    return rawPrepare(sql)
  }
  const { sql: positionalSql, keys } = parsed
  const inner = rawPrepare(positionalSql)

  function toPositional(args: unknown[]): unknown[] {
    if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      const obj = args[0] as Record<string, unknown>
      return keys.map((k) => obj[k] ?? null)
    }
    return args
  }

  return {
    run(...args: unknown[]) { return inner.run(...toPositional(args)) },
    get(...args: unknown[]) { return inner.get(...toPositional(args)) },
    all(...args: unknown[]) { return inner.all(...toPositional(args)) },
  }
}

export function openCompatDb(path: string): CompatDB {
  if (process.versions.bun) {
    // bun:sqlite — pragma via exec, no separate pragma() method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Database } = require('bun:sqlite') as { Database: new (p: string) => any }
    const rawDb = new Database(path)
    rawDb.exec('PRAGMA journal_mode = WAL')
    rawDb.exec('PRAGMA foreign_keys = ON')
    return {
      exec(sql: string) { rawDb.exec(sql) },
      prepare(sql: string) { return wrapStmt((s) => rawDb.prepare(s), sql) },
    }
  }

  // Node.js — better-sqlite3
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BetterSqlite3 = require('better-sqlite3') as new (p: string) => CompatDB & { pragma(s: string): void }
  const db = new BetterSqlite3(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
