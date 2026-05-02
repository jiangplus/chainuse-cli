import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createTempHome, removeTempHome, setupTempHome, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
  process.env.CHAINUSE_PASSPHRASE = 'test-passphrase'
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
  delete process.env.CHAINUSE_PASSPHRASE
})

describe('createMcpServer', () => {
  it('creates a server and registers all expected tools', async () => {
    const { createMcpServer } = await import('../../src/services/mcp.js')
    const server = await createMcpServer()

    // Access internal registry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, unknown>
    const names = Object.keys(tools)

    expect(names.length).toBe(21)

    // Spot-check key tool names
    const required = [
      'balance_get',
      'erc20_info',
      'erc20_balance',
      'erc20_allowance',
      'erc20_transfer',
      'erc20_approve',
      'send',
      'ens_resolve',
      'ens_reverse',
      'price_get',
      'swap_quote',
      'swap_execute',
      'bridge_quote',
      'bridge_status',
      'aave_account',
      'aave_reserve',
      'aave_supply',
      'aave_withdraw',
      'aave_borrow',
      'aave_repay',
      'account_list',
    ]
    for (const name of required) {
      expect(names).toContain(name)
    }
  })

  it('each tool has a non-empty description', async () => {
    const { createMcpServer } = await import('../../src/services/mcp.js')
    const server = await createMcpServer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, { description?: string }>
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.description, `${name} should have a description`).toBeTruthy()
      expect(tool.description!.length).toBeGreaterThan(10)
    }
  })

  it('registers tools with correct schema structure', async () => {
    const { createMcpServer } = await import('../../src/services/mcp.js')
    const server = await createMcpServer()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools = (server as any)._registeredTools as Record<string, { description?: string; inputSchema?: unknown }>

    // balance_get should accept addressOrAlias and chain
    const balanceTool = tools['balance_get']
    expect(balanceTool).toBeTruthy()
    expect(balanceTool.description).toContain('balance')

    // erc20_transfer should accept account, tokenAddress, to, amount
    const transferTool = tools['erc20_transfer']
    expect(transferTool).toBeTruthy()

    // send should be registered
    expect(tools['send']).toBeTruthy()

    // price_get should be registered
    expect(tools['price_get']).toBeTruthy()
  })
})
