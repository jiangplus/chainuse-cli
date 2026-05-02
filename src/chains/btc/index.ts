import * as bitcoin from 'bitcoinjs-lib'
import { ECPairFactory } from 'ecpair'
import * as tinysecp from 'tiny-secp256k1'

bitcoin.initEccLib(tinysecp)
const ECPair = ECPairFactory(tinysecp)

type BtcNetwork = 'mainnet' | 'testnet'

function getNetwork(network: BtcNetwork): bitcoin.networks.Network {
  return network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet
}

function getMempoolBaseUrl(network: BtcNetwork): string {
  return network === 'mainnet' ? 'https://mempool.space/api' : 'https://mempool.space/testnet/api'
}

type UtxoEntry = {
  txid: string
  vout: number
  status: { confirmed: boolean }
  value: number
}

type AddressStats = {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number }
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number }
}

export async function getBtcBalance(
  address: string,
  network: BtcNetwork
): Promise<{ confirmed: bigint; unconfirmed: bigint; total: bigint; formatted: string }> {
  const baseUrl = getMempoolBaseUrl(network)
  // Use /address/:addr (aggregate stats) instead of /utxo (fails on >500 UTXOs)
  const resp = await fetch(`${baseUrl}/address/${address}`)
  if (!resp.ok) throw new Error(`mempool.space error: ${resp.status} ${resp.statusText}`)
  const data = (await resp.json()) as AddressStats

  const confirmed = BigInt(data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum)
  const unconfirmed = BigInt(data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum)
  const total = confirmed + unconfirmed
  const formatted = (Number(total) / 1e8).toFixed(8)
  return { confirmed, unconfirmed, total, formatted }
}

export async function getRecommendedFees(
  network: BtcNetwork
): Promise<{ fastestFee: number; halfHourFee: number; economyFee: number }> {
  const baseUrl = getMempoolBaseUrl(network)
  const resp = await fetch(`${baseUrl}/v1/fees/recommended`)
  if (!resp.ok) throw new Error(`mempool.space fees error: ${resp.status}`)
  const data = (await resp.json()) as { fastestFee: number; halfHourFee: number; economyFee: number }
  return {
    fastestFee: data.fastestFee,
    halfHourFee: data.halfHourFee,
    economyFee: data.economyFee,
  }
}

export async function buildBtcTransfer(opts: {
  from: string
  to: string
  amountSats: bigint
  feeRate: number
  network: BtcNetwork
}): Promise<{ psbtBase64: string; fee: bigint; inputCount: number; outputCount: number }> {
  const { from, to, amountSats, feeRate, network } = opts
  const net = getNetwork(network)
  const baseUrl = getMempoolBaseUrl(network)

  // Fetch UTXOs
  const resp = await fetch(`${baseUrl}/address/${from}/utxo`)
  if (!resp.ok) throw new Error(`Failed to fetch UTXOs: ${resp.status}`)
  const utxos = (await resp.json()) as UtxoEntry[]
  const confirmedUtxos = utxos.filter((u) => u.status.confirmed)

  if (confirmedUtxos.length === 0) {
    throw new Error('No confirmed UTXOs available for spending')
  }

  // Sort by value descending for coin selection
  confirmedUtxos.sort((a, b) => b.value - a.value)

  // Estimate fee: P2WPKH input ~68 vbytes, output ~31 vbytes, overhead ~11 vbytes
  const estimateFee = (inputCount: number, outputCount: number) =>
    BigInt(Math.ceil((inputCount * 68 + outputCount * 31 + 11) * feeRate))

  // Simple coin selection
  let selected: UtxoEntry[] = []
  let selectedTotal = 0n
  for (const utxo of confirmedUtxos) {
    selected.push(utxo)
    selectedTotal += BigInt(utxo.value)
    const fee = estimateFee(selected.length, 2)
    if (selectedTotal >= amountSats + fee) break
  }

  const fee = estimateFee(selected.length, 2)
  if (selectedTotal < amountSats + fee) {
    throw new Error(
      `Insufficient funds: have ${selectedTotal} sats, need ${amountSats + fee} sats (including fee)`
    )
  }

  const change = selectedTotal - amountSats - fee

  // Build PSBT
  const psbt = new bitcoin.Psbt({ network: net })

  // Fetch raw tx hex for each UTXO to get witness data
  for (const utxo of selected) {
    const txResp = await fetch(`${baseUrl}/tx/${utxo.txid}/hex`)
    if (!txResp.ok) throw new Error(`Failed to fetch tx ${utxo.txid}: ${txResp.status}`)
    const txHex = await txResp.text()
    const tx = bitcoin.Transaction.fromHex(txHex)
    const output = tx.outs[utxo.vout]

    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: output.script,
        value: BigInt(utxo.value),
      },
    })
  }

  // Add recipient output
  psbt.addOutput({ address: to, value: amountSats })

  // Add change output if worthwhile (> dust: 546 sats)
  const outputCount = change > 546n ? 2 : 1
  if (change > 546n) {
    psbt.addOutput({ address: from, value: change })
  }

  const psbtBase64 = psbt.toBase64()
  return { psbtBase64, fee, inputCount: selected.length, outputCount }
}

export async function broadcastBtcTx(txHex: string, network: BtcNetwork): Promise<string> {
  const baseUrl = getMempoolBaseUrl(network)
  const resp = await fetch(`${baseUrl}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: txHex,
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Broadcast failed: ${resp.status} ${body}`)
  }
  const txid = await resp.text()
  return txid.trim()
}
