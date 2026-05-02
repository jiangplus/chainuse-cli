import SignClient from '@walletconnect/sign-client'
import type { SignClientTypes, SessionTypes } from '@walletconnect/types'
import {
  upsertWcSession,
  deleteWcSession,
  getWcSession,
  listWcSessions,
  insertWcPending,
  deleteWcPending,
  listWcPending,
  type StoredWcSession,
  type StoredWcPending,
} from '../state/index.js'

const WC_PROJECT_ID = process.env.WC_PROJECT_ID ?? 'chainuse-placeholder'

let _client: InstanceType<typeof SignClient> | null = null

async function getClient(): Promise<InstanceType<typeof SignClient>> {
  if (_client) return _client
  _client = await SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'Chainuse',
      description: 'Multi-chain CLI wallet for AI agents',
      url: 'https://github.com/chainuse',
      icons: [],
    },
  })

  _client.on('session_request', (event: SignClientTypes.EventArguments['session_request']) => {
    insertWcPending({
      id: String(event.id),
      topic: event.topic,
      method: event.params.request.method,
      params: event.params.request.params,
      createdAt: Date.now(),
    })
  })

  _client.on('session_delete', (event: { topic: string }) => {
    deleteWcSession(event.topic)
  })

  return _client
}

function sessionToStored(
  topic: string,
  session: SessionTypes.Struct,
): StoredWcSession {
  const peer = session.peer.metadata
  const accounts = session.namespaces
    ? Object.values(session.namespaces).flatMap((ns) => (ns as { accounts: string[] }).accounts)
    : []
  const chains = session.namespaces
    ? Object.values(session.namespaces).flatMap((ns) =>
        (ns as { chains?: string[] }).chains ?? []
      )
    : []
  return {
    topic,
    peerName: peer.name,
    peerUrl: peer.url,
    peerIcons: peer.icons,
    accounts,
    chains,
    expiry: session.expiry,
    createdAt: Date.now(),
  }
}

export type PairResult = {
  topic: string
  peerName: string
  peerUrl?: string
  requiredChains: string[]
  requiredMethods: string[]
  optionalChains?: string[]
  optionalMethods?: string[]
}

export async function wcPair(uri: string): Promise<PairResult> {
  const client = await getClient()
  const { topic } = await client.core.pairing.pair({ uri })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WalletConnect pairing timed out (30s)')), 30_000)

    client.on('session_proposal', (proposal: SignClientTypes.EventArguments['session_proposal']) => {
      clearTimeout(timeout)
      const { requiredNamespaces, optionalNamespaces } = proposal.params
      const requiredChains = Object.values(requiredNamespaces).flatMap(
        (ns) => (ns as { chains?: string[] }).chains ?? []
      )
      const requiredMethods = Object.values(requiredNamespaces).flatMap(
        (ns) => (ns as { methods: string[] }).methods
      )
      const optionalChains = optionalNamespaces
        ? Object.values(optionalNamespaces).flatMap(
            (ns) => (ns as { chains?: string[] }).chains ?? []
          )
        : []
      const optionalMethods = optionalNamespaces
        ? Object.values(optionalNamespaces).flatMap(
            (ns) => (ns as { methods: string[] }).methods ?? []
          )
        : []

      resolve({
        topic: proposal.params.pairingTopic ?? topic,
        peerName: proposal.params.proposer.metadata.name,
        peerUrl: proposal.params.proposer.metadata.url,
        requiredChains,
        requiredMethods,
        optionalChains,
        optionalMethods,
      })
    })
  })
}

export type ApproveResult = {
  sessionTopic: string
  peerName: string
  accounts: string[]
  chains: string[]
}

export async function wcApprove(opts: {
  pairingTopic: string
  accounts: string[]
  chains: string[]
  methods?: string[]
  events?: string[]
}): Promise<ApproveResult> {
  const client = await getClient()

  const methods = opts.methods ?? [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData',
    'eth_signTypedData_v4',
  ]
  const events = opts.events ?? ['chainChanged', 'accountsChanged']

  // Build namespaces grouped by chain namespace prefix
  const namespaces: Record<string, { accounts: string[]; chains: string[]; methods: string[]; events: string[] }> = {}
  for (const caip2 of opts.chains) {
    const ns = caip2.split(':')[0]
    if (!namespaces[ns]) {
      namespaces[ns] = { accounts: [], chains: [], methods, events }
    }
    namespaces[ns].chains.push(caip2)
  }
  for (const caip10 of opts.accounts) {
    const ns = caip10.split(':')[0]
    if (!namespaces[ns]) {
      namespaces[ns] = { accounts: [], chains: [], methods, events }
    }
    namespaces[ns].accounts.push(caip10)
  }

  // Find pending proposal for this pairing topic
  const proposals = client.proposal.getAll()
  const proposal = proposals.find((p) => p.pairingTopic === opts.pairingTopic)
  if (!proposal) {
    throw new Error(`No pending proposal for pairing topic: ${opts.pairingTopic}`)
  }

  const { topic: sessionTopic, acknowledged } = await client.approve({
    id: proposal.id,
    namespaces,
  })
  const session = await acknowledged()

  const stored = sessionToStored(sessionTopic, session)
  upsertWcSession(stored)

  return {
    sessionTopic,
    peerName: session.peer.metadata.name,
    accounts: stored.accounts,
    chains: stored.chains,
  }
}

export async function wcReject(pairingTopic: string): Promise<void> {
  const client = await getClient()
  const proposals = client.proposal.getAll()
  const proposal = proposals.find((p) => p.pairingTopic === pairingTopic)
  if (!proposal) throw new Error(`No pending proposal for pairing topic: ${pairingTopic}`)
  await client.reject({ id: proposal.id, reason: { code: 4001, message: 'User rejected' } })
}

export async function wcDisconnect(topic: string): Promise<void> {
  const client = await getClient()
  await client.disconnect({ topic, reason: { code: 6000, message: 'User disconnected' } })
  deleteWcSession(topic)
}

export { listWcSessions, listWcPending, deleteWcPending }

export async function wcSignRequest(opts: {
  requestId: string
  privateKey: string
  chainId: string
}): Promise<{ result: string }> {
  const client = await getClient()
  const pending = listWcPending().find((p) => p.id === opts.requestId)
  if (!pending) throw new Error(`No pending WC request: ${opts.requestId}`)

  const { createWalletClient, http, custom } = await import('viem')
  const { privateKeyToAccount } = await import('viem/accounts')

  const account = privateKeyToAccount(opts.privateKey as `0x${string}`)

  const walletClient = createWalletClient({
    account,
    transport: http(),
  })

  let result: string

  if (pending.method === 'personal_sign') {
    const [message] = pending.params as [string, string]
    result = await walletClient.signMessage({ message: { raw: message as `0x${string}` } })
  } else if (pending.method === 'eth_sign') {
    const [, message] = pending.params as [string, string]
    result = await walletClient.signMessage({ message: { raw: message as `0x${string}` } })
  } else if (pending.method === 'eth_signTypedData' || pending.method === 'eth_signTypedData_v4') {
    const [, typedDataJson] = pending.params as [string, string]
    const typedData = JSON.parse(typedDataJson)
    const { domain, types, message: value, primaryType } = typedData
    // Remove EIP712Domain from types if present (viem handles it internally)
    const filteredTypes = { ...types }
    delete filteredTypes['EIP712Domain']
    result = await walletClient.signTypedData({ domain, types: filteredTypes, primaryType, message: value })
  } else {
    throw new Error(`Unsupported WC method for signing: ${pending.method}`)
  }

  // Respond to the dapp
  const session = getWcSession(pending.topic)
  if (!session) throw new Error(`Session not found for topic: ${pending.topic}`)

  await client.respond({
    topic: pending.topic,
    response: {
      id: Number(opts.requestId),
      jsonrpc: '2.0',
      result,
    },
  })

  deleteWcPending(opts.requestId)
  return { result }
}
