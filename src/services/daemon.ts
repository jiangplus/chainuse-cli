import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

// ─── JSON-RPC 2.0 types ───────────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc: '2.0'
  id: string | number | null
  method: string
  params?: Record<string, unknown>
}

type JsonRpcError = {
  code: number
  message: string
  data?: unknown
}

type JsonRpcResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcError
}

// ─── Method registry ──────────────────────────────────────────────────────────

type RpcHandler = (params: Record<string, unknown>) => Promise<unknown>
const METHODS: Record<string, RpcHandler> = {}

function register(name: string, fn: RpcHandler) {
  METHODS[name] = fn
}

async function loadHandlers() {
  const [
    balance,
    send,
    account,
    tokens,
    ens,
    price,
    swap,
    aave,
    deploy,
    safe,
    wc,
    siwe,
    ledger,
    call,
  ] = await Promise.all([
    import('../handlers/balance.js'),
    import('../handlers/send.js'),
    import('../handlers/account.js'),
    import('../handlers/tokens.js'),
    import('../handlers/ens.js'),
    import('../handlers/price.js'),
    import('../handlers/swap.js'),
    import('../handlers/aave.js'),
    import('../handlers/deploy.js'),
    import('../handlers/safe.js'),
    import('../handlers/wc.js'),
    import('../handlers/siwe.js'),
    import('../handlers/ledger.js'),
    import('../handlers/call.js'),
  ])

  // balance
  register('balance.get', (p) => balance.handleBalance(p as Parameters<typeof balance.handleBalance>[0]))

  // send
  register('send.execute', (p) => send.handleSend(p as Parameters<typeof send.handleSend>[0]))

  // account
  register('account.list', (p) => account.handleAccountList(p as Parameters<typeof account.handleAccountList>[0]))
  register('account.info', (p) => account.handleAccountInfo(p as Parameters<typeof account.handleAccountInfo>[0]))
  register('account.create.4337', (p) => account.handleAccountCreate4337(p as Parameters<typeof account.handleAccountCreate4337>[0]))
  register('account.create.7702', (p) => account.handleAccountCreate7702(p as Parameters<typeof account.handleAccountCreate7702>[0]))
  register('account.send', (p) => account.handleAccountSend(p as Parameters<typeof account.handleAccountSend>[0]))

  // call (read contract)
  register('call', (p) => call.handleCall(p as Parameters<typeof call.handleCall>[0]))
  register('storage.get', (p) => call.handleStorageGet(p as Parameters<typeof call.handleStorageGet>[0]))

  // erc20
  register('erc20.info', (p) => tokens.handleErc20Info(p as Parameters<typeof tokens.handleErc20Info>[0]))
  register('erc20.balance', (p) => tokens.handleErc20Balance(p as Parameters<typeof tokens.handleErc20Balance>[0]))
  register('erc20.transfer', (p) => tokens.handleErc20Transfer(p as Parameters<typeof tokens.handleErc20Transfer>[0]))
  register('erc20.approve', (p) => tokens.handleErc20Approve(p as Parameters<typeof tokens.handleErc20Approve>[0]))
  register('erc20.allowance', (p) => tokens.handleErc20Allowance(p as Parameters<typeof tokens.handleErc20Allowance>[0]))

  // erc721
  register('erc721.info', (p) => tokens.handleErc721Info(p as Parameters<typeof tokens.handleErc721Info>[0]))
  register('erc721.owner', (p) => tokens.handleErc721Owner(p as Parameters<typeof tokens.handleErc721Owner>[0]))
  register('erc721.balance', (p) => tokens.handleErc721Balance(p as Parameters<typeof tokens.handleErc721Balance>[0]))
  register('erc721.tokenUri', (p) => tokens.handleErc721TokenURI(p as Parameters<typeof tokens.handleErc721TokenURI>[0]))
  register('erc721.transfer', (p) => tokens.handleErc721Transfer(p as Parameters<typeof tokens.handleErc721Transfer>[0]))

  // erc1155
  register('erc1155.balance', (p) => tokens.handleErc1155Balance(p as Parameters<typeof tokens.handleErc1155Balance>[0]))
  register('erc1155.uri', (p) => tokens.handleErc1155URI(p as Parameters<typeof tokens.handleErc1155URI>[0]))
  register('erc1155.transfer', (p) => tokens.handleErc1155Transfer(p as Parameters<typeof tokens.handleErc1155Transfer>[0]))
  register('erc1155.batchTransfer', (p) => tokens.handleErc1155BatchTransfer(p as Parameters<typeof tokens.handleErc1155BatchTransfer>[0]))

  // ens
  register('ens.resolve', (p) => ens.handleEnsResolve(p as Parameters<typeof ens.handleEnsResolve>[0]))
  register('ens.reverse', (p) => ens.handleEnsReverse(p as Parameters<typeof ens.handleEnsReverse>[0]))
  register('ens.setPrimary', (p) => ens.handleEnsSetPrimary(p as Parameters<typeof ens.handleEnsSetPrimary>[0]))
  register('ens.setRecord', (p) => ens.handleEnsSetRecord(p as Parameters<typeof ens.handleEnsSetRecord>[0]))

  // price
  register('price.get', (p) => price.handlePrice(p as Parameters<typeof price.handlePrice>[0]))
  register('price.feeds', (p) => price.handlePriceFeeds(p as Parameters<typeof price.handlePriceFeeds>[0]))

  // swap
  register('swap.quote', (p) => swap.handleSwapQuote(p as Parameters<typeof swap.handleSwapQuote>[0]))
  register('swap.execute', (p) => swap.handleSwapExecute(p as Parameters<typeof swap.handleSwapExecute>[0]))
  register('bridge.quote', (p) => swap.handleBridgeQuote(p as Parameters<typeof swap.handleBridgeQuote>[0]))
  register('bridge.status', (p) => swap.handleBridgeStatus(p as Parameters<typeof swap.handleBridgeStatus>[0]))

  // aave
  register('aave.account', (p) => aave.handleAaveAccount(p as Parameters<typeof aave.handleAaveAccount>[0]))
  register('aave.reserve', (p) => aave.handleAaveReserve(p as Parameters<typeof aave.handleAaveReserve>[0]))
  register('aave.supply', (p) => aave.handleAaveSupply(p as Parameters<typeof aave.handleAaveSupply>[0]))
  register('aave.withdraw', (p) => aave.handleAaveWithdraw(p as Parameters<typeof aave.handleAaveWithdraw>[0]))
  register('aave.borrow', (p) => aave.handleAaveBorrow(p as Parameters<typeof aave.handleAaveBorrow>[0]))
  register('aave.repay', (p) => aave.handleAaveRepay(p as Parameters<typeof aave.handleAaveRepay>[0]))

  // deploy
  register('deploy.evm', (p) => deploy.handleDeploy(p as Parameters<typeof deploy.handleDeploy>[0]))
  register('deploy.list', (p) => deploy.handleDeploymentsList(p as Parameters<typeof deploy.handleDeploymentsList>[0]))
  register('deploy.show', (p) => deploy.handleDeploymentShow(p as Parameters<typeof deploy.handleDeploymentShow>[0]))

  // safe
  register('safe.create', (p) => safe.handleSafeCreate(p as Parameters<typeof safe.handleSafeCreate>[0]))
  register('safe.info', (p) => safe.handleSafeInfo(p as Parameters<typeof safe.handleSafeInfo>[0]))
  register('safe.propose', (p) => safe.handleSafePropose(p as Parameters<typeof safe.handleSafePropose>[0]))
  register('safe.confirm', (p) => safe.handleSafeConfirm(p as Parameters<typeof safe.handleSafeConfirm>[0]))
  register('safe.execute', (p) => safe.handleSafeExecute(p as Parameters<typeof safe.handleSafeExecute>[0]))
  register('safe.queue', (p) => safe.handleSafeQueue(p as Parameters<typeof safe.handleSafeQueue>[0]))

  // walletconnect
  register('wc.pair', (p) => wc.handleWcPair(p as Parameters<typeof wc.handleWcPair>[0]))
  register('wc.approve', (p) => wc.handleWcApprove(p as Parameters<typeof wc.handleWcApprove>[0]))
  register('wc.reject', (p) => wc.handleWcReject(p as Parameters<typeof wc.handleWcReject>[0]))
  register('wc.sessions', (_p) => wc.handleWcSessions())
  register('wc.disconnect', (p) => wc.handleWcDisconnect(p as Parameters<typeof wc.handleWcDisconnect>[0]))
  register('wc.pending', (_p) => wc.handleWcPending())
  register('wc.sign', (p) => wc.handleWcSign(p as Parameters<typeof wc.handleWcSign>[0]))

  // siwe
  register('siwe.build', (p) => siwe.handleSiweBuild(p as Parameters<typeof siwe.handleSiweBuild>[0]))
  register('siwe.sign', (p) => siwe.handleSiweSign(p as Parameters<typeof siwe.handleSiweSign>[0]))
  register('siwe.verify', (p) => siwe.handleSiweVerify(p as Parameters<typeof siwe.handleSiweVerify>[0]))
  register('siwe.login', (p) => siwe.handleSiweLogin(p as Parameters<typeof siwe.handleSiweLogin>[0]))

  // ledger
  register('ledger.address', (p) => ledger.handleLedgerAddress(p as Parameters<typeof ledger.handleLedgerAddress>[0]))
  register('ledger.list', (p) => ledger.handleLedgerList(p as Parameters<typeof ledger.handleLedgerList>[0]))
  register('ledger.sign', (p) => ledger.handleLedgerSign(p as Parameters<typeof ledger.handleLedgerSign>[0]))
}

// ─── HTTP request handler ─────────────────────────────────────────────────────

function sendResponse(res: ServerResponse, data: JsonRpcResponse) {
  const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, methods: Object.keys(METHODS).sort() }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end()
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  let rpc: JsonRpcRequest
  try {
    rpc = JSON.parse(body)
  } catch {
    sendResponse(res, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }

  const handler = METHODS[rpc.method]
  if (!handler) {
    sendResponse(res, {
      jsonrpc: '2.0',
      id: rpc.id,
      error: { code: -32601, message: `Method not found: ${rpc.method}` },
    })
    return
  }

  try {
    const result = await handler(rpc.params ?? {})
    sendResponse(res, { jsonrpc: '2.0', id: rpc.id, result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    sendResponse(res, {
      jsonrpc: '2.0',
      id: rpc.id,
      error: { code: -32603, message: msg },
    })
  }
}

// ─── Start daemon ─────────────────────────────────────────────────────────────

export async function startDaemon(opts: { port?: number; host?: string } = {}): Promise<void> {
  const port = opts.port ?? 3131
  const host = opts.host ?? '127.0.0.1'

  await loadHandlers()

  const server = createServer(handleHttpRequest)

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      const startupInfo = JSON.stringify({
        ok: true,
        data: {
          pid: process.pid,
          host,
          port,
          endpoint: `http://${host}:${port}`,
          methods: Object.keys(METHODS).length,
        },
      })
      process.stdout.write(startupInfo + '\n')
      resolve()
    })
  })

  // Keep running until signal
  await new Promise<void>((resolve) => {
    process.once('SIGINT', resolve)
    process.once('SIGTERM', resolve)
  })

  server.close()
}
