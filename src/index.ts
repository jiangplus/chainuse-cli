#!/usr/bin/env node
// Load .env from cwd or project root before anything else
import { config as loadDotenv } from 'dotenv'
loadDotenv()

import { buildCLI } from './cli/index.js'

const program = buildCLI()
program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
