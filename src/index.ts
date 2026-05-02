#!/usr/bin/env node
// Suppress noisy native-binding fallback warnings from secp256k1 / bigint libs
const _consoleError = console.error.bind(console)
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Failed to load bindings')) return
  _consoleError(...args)
}

// Load .env from cwd or project root before anything else
import { config as loadDotenv } from 'dotenv'
loadDotenv()

import { buildCLI } from './cli/index.js'

const program = buildCLI()
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
