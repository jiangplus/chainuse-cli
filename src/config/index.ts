import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import yaml from 'js-yaml'
import type { Config } from '../core/types.js'
import { resolveChainId } from '../chains/evm/utils.js'

export function getChainuseDir(): string {
  return process.env.CHAINUSE_HOME ?? join(homedir(), '.chainuse')
}

export function getConfigPath(): string {
  return join(getChainuseDir(), 'config.yaml')
}

export function getPolicyPath(): string {
  return join(getChainuseDir(), 'policy.yaml')
}

export function getKeystorePath(): string {
  return join(getChainuseDir(), 'keystore.db')
}

export function getStatePath(): string {
  return join(getChainuseDir(), 'state.db')
}

export function isInitialized(): boolean {
  return existsSync(getConfigPath())
}

export function loadConfig(): Config {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) {
    throw new Error(
      `Chainuse not initialized. Run: chain init`
    )
  }
  const raw = readFileSync(configPath, 'utf-8')
  return yaml.load(raw) as Config
}

export function resolveChainFromConfig(config: Config, chainInput?: string): string {
  const input = chainInput ?? config.default_chain
  return resolveChainId(input)
}
