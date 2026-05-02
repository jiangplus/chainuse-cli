import chalk from 'chalk'
import type { JsonResult } from '../core/types.js'

export function isJsonMode(humanFlag?: boolean): boolean {
  if (humanFlag) return false
  // Default to JSON when not a TTY
  return !process.stdout.isTTY
}

export function printResult<T>(
  result: JsonResult<T>,
  formatter?: (data: T) => void,
  opts?: { json?: boolean; human?: boolean }
): void {
  const useJson = opts?.json || (!opts?.human && !process.stdout.isTTY)

  if (useJson) {
    // Serialize bigints as strings
    console.log(JSON.stringify(result, bigintReplacer, 2))
    return
  }

  if (!result.ok) {
    console.error(chalk.red(`Error [${result.error.code}]: ${result.error.message}`))
    if (result.error.hint) {
      console.error(chalk.yellow(`Hint: ${result.error.hint}`))
    }
    if (result.error.details) {
      if (Array.isArray(result.error.details)) {
        result.error.details.forEach((d) => console.error(chalk.dim(`  - ${d}`)))
      } else {
        console.error(chalk.dim(JSON.stringify(result.error.details, null, 2)))
      }
    }
    return
  }

  if (formatter) {
    formatter(result.data)
  } else {
    console.log(JSON.stringify(result.data, bigintReplacer, 2))
  }
}

export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg)
}

export function info(msg: string): void {
  console.log(chalk.cyan('ℹ') + ' ' + msg)
}

export function warn(msg: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + msg)
}

export function label(key: string, value: string): void {
  console.log(`  ${chalk.bold(key.padEnd(24))} ${value}`)
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  return value
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toISOString()
}

export function formatAddress(addr: string): string {
  return chalk.cyan(addr)
}

export function formatHash(hash: string): string {
  return chalk.magenta(hash)
}

export function formatStatus(status: string): string {
  switch (status) {
    case 'confirmed': return chalk.green(status)
    case 'sent': return chalk.blue(status)
    case 'signed': return chalk.cyan(status)
    case 'prepared': return chalk.yellow(status)
    case 'failed': return chalk.red(status)
    default: return chalk.dim(status)
  }
}
