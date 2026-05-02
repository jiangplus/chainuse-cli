import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { JsonResult } from '../core/types.js'

// ─── helpers ─────────────────────────────────────────────────────────────────

function toText(result: JsonResult<unknown>): { content: Array<{ type: 'text'; text: string }> } {
  const text = JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
  return { content: [{ type: 'text' as const, text }] }
}

// ─── shared param schemas ─────────────────────────────────────────────────────

const chain = z.string().optional().describe("Chain ID or alias (e.g. '1', 'base', 'arbitrum'). Defaults to configured default chain.")
const ownerAlias = z.string().describe('Local account alias (from `chain keys list`)')
const tokenSymbolOrAddress = z.string().describe("Token symbol (e.g. 'USDC', 'WETH') or 0x contract address")
const evmAddress = z.string().describe('EVM address (0x…)')
const amount = z.string().describe('Human-readable amount (e.g. "1.5", "100")')
const slippageBps = z.number().int().optional().describe('Slippage tolerance in basis points (default 50 = 0.5%)')

// ─── MCP server factory ───────────────────────────────────────────────────────

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'chainuse',
    version: '0.1.0',
  })

  // Lazy-load handlers so startup is fast for all transport modes
  const [
    balanceHandler,
    sendHandler,
    accountHandler,
    tokensHandler,
    ensHandler,
    priceHandler,
    swapHandler,
    aaveHandler,
  ] = await Promise.all([
    import('../handlers/balance.js'),
    import('../handlers/send.js'),
    import('../handlers/account.js'),
    import('../handlers/tokens.js'),
    import('../handlers/ens.js'),
    import('../handlers/price.js'),
    import('../handlers/swap.js'),
    import('../handlers/aave.js'),
  ])

  // ── balance ────────────────────────────────────────────────────────────────

  server.tool(
    'balance_get',
    'Get the native token balance (ETH, SOL, BTC, SUI) or ERC-20 balance for an address. Use this before any send or swap to confirm funds.',
    {
      address: z.string().describe('Address or account alias to check'),
      token: tokenSymbolOrAddress.optional().describe('Omit for native balance; provide symbol/address for ERC-20'),
      chain,
    },
    async (p) => toText(await balanceHandler.handleBalance({ addressOrAlias: p.address, token: p.token, chain: p.chain }))
  )

  // ── ERC-20 ─────────────────────────────────────────────────────────────────

  server.tool(
    'erc20_info',
    'Get ERC-20 token metadata: name, symbol, decimals, total supply.',
    { token: tokenSymbolOrAddress, chain },
    async (p) => toText(await tokensHandler.handleErc20Info({ token: p.token, chain: p.chain }))
  )

  server.tool(
    'erc20_balance',
    'Get ERC-20 token balance for an address.',
    { token: tokenSymbolOrAddress, address: evmAddress, chain },
    async (p) => toText(await tokensHandler.handleErc20Balance({ token: p.token, address: p.address, chain: p.chain }))
  )

  server.tool(
    'erc20_allowance',
    'Check how much of an ERC-20 token a spender is approved to use on behalf of an owner.',
    {
      token: tokenSymbolOrAddress,
      owner: evmAddress,
      spender: evmAddress.describe('Spender address (e.g. Uniswap router)'),
      chain,
    },
    async (p) => toText(await tokensHandler.handleErc20Allowance({ token: p.token, owner: p.owner, spender: p.spender, chain: p.chain }))
  )

  server.tool(
    'erc20_transfer',
    'Transfer ERC-20 tokens from an owned account to a recipient. Requires the account alias to be unlocked.',
    {
      token: tokenSymbolOrAddress,
      from: ownerAlias,
      to: z.string().describe('Recipient address or ENS name'),
      amount,
      chain,
    },
    async (p) => toText(await tokensHandler.handleErc20Transfer({ token: p.token, account: p.from, to: p.to, amount: p.amount, chain: p.chain }))
  )

  server.tool(
    'erc20_approve',
    'Approve an ERC-20 spender allowance. Use before a swap or DeFi deposit that requires a prior approval.',
    {
      token: tokenSymbolOrAddress,
      from: ownerAlias,
      spender: evmAddress,
      amount,
      chain,
    },
    async (p) => toText(await tokensHandler.handleErc20Approve({ token: p.token, account: p.from, spender: p.spender, amount: p.amount, chain: p.chain }))
  )

  // ── send ───────────────────────────────────────────────────────────────────

  server.tool(
    'send',
    'Send native tokens (ETH, SOL, BTC, SUI) or an ERC-20/SPL asset to an address. For ERC-20 sends prefer erc20_transfer; use this for native transfers.',
    {
      from: ownerAlias,
      to: z.string().describe('Recipient address or ENS name'),
      amount,
      asset: z.string().optional().describe("Asset: 'native' for ETH/SOL/BTC/SUI (default), 'erc20:0x…' for ERC-20, 'spl:…' for Solana SPL"),
      chain,
    },
    async (p) => toText(await sendHandler.handleSend({ account: p.from, to: p.to, amount: p.amount, asset: p.asset ?? 'native', chain: p.chain }))
  )

  // ── ENS ────────────────────────────────────────────────────────────────────

  server.tool(
    'ens_resolve',
    'Resolve an ENS name to an EVM address (forward lookup). Works on Ethereum mainnet.',
    {
      name: z.string().describe('ENS name, e.g. "vitalik.eth"'),
      chain,
    },
    async (p) => toText(await ensHandler.handleEnsResolve({ name: p.name, chain: p.chain }))
  )

  server.tool(
    'ens_reverse',
    'Reverse-resolve an EVM address to its primary ENS name.',
    {
      address: evmAddress,
      chain,
    },
    async (p) => toText(await ensHandler.handleEnsReverse({ address: p.address, chain: p.chain }))
  )

  // ── Chainlink price ────────────────────────────────────────────────────────

  server.tool(
    'price_get',
    'Read a Chainlink price feed. Pass a well-known symbol pair like "ETH/USD" or "BTC/USD", or a feed contract address. Returns current price, round ID, and timestamp.',
    {
      feed: z.string().describe('Feed symbol (e.g. "ETH/USD") or aggregator contract address'),
      chain,
    },
    async (p) => toText(await priceHandler.handlePrice({ feed: p.feed, chain: p.chain }))
  )

  // ── Uniswap V4 swap ────────────────────────────────────────────────────────

  server.tool(
    'swap_quote',
    'Get a Uniswap V4 swap quote: best fee tier, expected output, minimum output after slippage, and pre-built calldata. Call this before swap_execute to preview the trade.',
    {
      from_token: tokenSymbolOrAddress.describe('Input token symbol or address'),
      to_token: tokenSymbolOrAddress.describe('Output token symbol or address'),
      amount_in: amount.describe('Exact input amount'),
      owner: ownerAlias.describe('Account alias (used to derive recipient)'),
      recipient: evmAddress.optional().describe('Override recipient address'),
      slippage_bps: slippageBps,
      chain,
    },
    async (p) => toText(await swapHandler.handleSwapQuote({
      from: p.from_token,
      to: p.to_token,
      amount: p.amount_in,
      ownerAlias: p.owner,
      recipient: p.recipient,
      slippageBps: p.slippage_bps,
      chain: p.chain,
    }))
  )

  server.tool(
    'swap_execute',
    'Execute a Uniswap V4 token swap. Automatically approves the router and sends the swap transaction. Returns the transaction hash. Use swap_quote first to confirm the rate.',
    {
      from_token: tokenSymbolOrAddress.describe('Input token symbol or address'),
      to_token: tokenSymbolOrAddress.describe('Output token symbol or address'),
      amount_in: amount.describe('Exact input amount'),
      owner: ownerAlias,
      recipient: evmAddress.optional(),
      slippage_bps: slippageBps,
      chain,
    },
    async (p) => toText(await swapHandler.handleSwapExecute({
      from: p.from_token,
      to: p.to_token,
      amount: p.amount_in,
      ownerAlias: p.owner,
      recipient: p.recipient,
      slippageBps: p.slippage_bps,
      chain: p.chain,
    }))
  )

  // ── Squid bridge ───────────────────────────────────────────────────────────

  server.tool(
    'bridge_quote',
    'Get a cross-chain bridge quote via Squid Router. Returns estimated output, fees, and estimated time. Use bridge_status after executing to poll completion.',
    {
      from_chain: z.string().describe('Source chain ID or alias (e.g. "1", "base")'),
      to_chain: z.string().describe('Destination chain ID or alias'),
      from_token: tokenSymbolOrAddress.describe('Source token'),
      to_token: tokenSymbolOrAddress.describe('Destination token'),
      amount,
      owner: ownerAlias,
      to_address: evmAddress.optional().describe('Override destination recipient'),
      slippage_bps: slippageBps,
    },
    async (p) => toText(await swapHandler.handleBridgeQuote({
      fromChain: p.from_chain,
      toChain: p.to_chain,
      fromToken: p.from_token,
      toToken: p.to_token,
      amount: p.amount,
      ownerAlias: p.owner,
      toAddress: p.to_address,
      slippageBps: p.slippage_bps,
    }))
  )

  server.tool(
    'bridge_status',
    'Poll the status of an in-flight cross-chain bridge transaction.',
    {
      tx_hash: z.string().describe('Source chain transaction hash'),
      from_chain: z.string().describe('Source chain ID or alias'),
      to_chain: z.string().describe('Destination chain ID or alias'),
    },
    async (p) => toText(await swapHandler.handleBridgeStatus({ txHash: p.tx_hash, fromChain: p.from_chain, toChain: p.to_chain }))
  )

  // ── Aave V3 ────────────────────────────────────────────────────────────────

  server.tool(
    'aave_account',
    'Get Aave V3 account summary: total collateral, total debt, available borrows, liquidation threshold, LTV, and health factor. Health factor below 1 means liquidation risk.',
    {
      owner: ownerAlias,
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveAccount({ ownerAlias: p.owner, chain: p.chain }))
  )

  server.tool(
    'aave_reserve',
    'Get Aave V3 reserve data for a specific asset: current supply balance (aToken), variable debt, supply APY.',
    {
      asset: tokenSymbolOrAddress.describe('Asset to query (e.g. "USDC", "WETH")'),
      owner: ownerAlias,
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveReserve({ asset: p.asset, ownerAlias: p.owner, chain: p.chain }))
  )

  server.tool(
    'aave_supply',
    'Supply (deposit) an asset into Aave V3 as collateral. Automatically approves the pool. Returns approve and supply tx hashes.',
    {
      asset: tokenSymbolOrAddress,
      amount,
      owner: ownerAlias,
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveSupply({ asset: p.asset, amount: p.amount, ownerAlias: p.owner, chain: p.chain }))
  )

  server.tool(
    'aave_withdraw',
    'Withdraw a previously supplied asset from Aave V3. Pass amount="max" to withdraw the full balance.',
    {
      asset: tokenSymbolOrAddress,
      amount: z.string().describe('Amount to withdraw, or "max" for full balance'),
      owner: ownerAlias,
      to: evmAddress.optional().describe('Override recipient (default: owner)'),
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveWithdraw({ asset: p.asset, amount: p.amount, ownerAlias: p.owner, to: p.to, chain: p.chain }))
  )

  server.tool(
    'aave_borrow',
    'Borrow an asset from Aave V3 against existing collateral. Check aave_account health factor first. Mode 2 = variable rate (recommended).',
    {
      asset: tokenSymbolOrAddress,
      amount,
      owner: ownerAlias,
      interest_rate_mode: z.enum(['1', '2']).optional().describe('1 = stable, 2 = variable (default)'),
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveBorrow({ asset: p.asset, amount: p.amount, ownerAlias: p.owner, interestRateMode: p.interest_rate_mode, chain: p.chain }))
  )

  server.tool(
    'aave_repay',
    'Repay borrowed assets in Aave V3. Automatically approves the pool. Returns approve and repay tx hashes.',
    {
      asset: tokenSymbolOrAddress,
      amount,
      owner: ownerAlias,
      interest_rate_mode: z.enum(['1', '2']).optional(),
      chain,
    },
    async (p) => toText(await aaveHandler.handleAaveRepay({ asset: p.asset, amount: p.amount, ownerAlias: p.owner, interestRateMode: p.interest_rate_mode, chain: p.chain }))
  )

  // ── account ────────────────────────────────────────────────────────────────

  server.tool(
    'account_list',
    'List all locally stored accounts (EOA and smart accounts) with their aliases, addresses, and chain types. Use this to find the right alias for other tools.',
    {},
    async () => toText(await accountHandler.handleAccountList({}))
  )

  return server
}

// ─── transport modes ──────────────────────────────────────────────────────────

export async function startMcpStdio(): Promise<void> {
  const server = await createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // runs until stdin closes
}

export async function startMcpHttp(opts: { port?: number; host?: string } = {}): Promise<void> {
  const { createServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')

  const port = opts.port ?? 3132
  const host = opts.host ?? '127.0.0.1'

  const server = await createMcpServer()

  const httpServer = createServer(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => { const { randomBytes } = require('node:crypto'); return randomBytes(16).toString('hex') },
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(port, host, () => {
      process.stdout.write(
        JSON.stringify({ ok: true, data: { pid: process.pid, host, port, endpoint: `http://${host}:${port}/mcp`, transport: 'streamable-http' } }) + '\n'
      )
      resolve()
    })
  })

  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve)
    process.once('SIGTERM', resolve)
  })

  httpServer.close()
}
