import { isAddress, getAddress, parseUnits, parseAbi, encodeFunctionData } from 'viem'
import { randomUUID } from 'node:crypto'
import * as bitcoinjsLib from 'bitcoinjs-lib'
import { loadConfig, resolveChainFromConfig, resolveNonEvmRpcUrl } from '../config/index.js'
import { getAccount } from '../state/index.js'
import { insertTx, updateTx, getTx } from '../state/index.js'
import { loadKey, getPassphrase } from '../keystore/index.js'
import { ErrorCode } from '../core/errors.js'
import { isEvmChain, isSolanaChain, isBitcoinChain, isSuiChain, getBitcoinNetwork, getSolanaNetwork, getSuiNetwork } from '../chains/resolve.js'
import { buildSolanaConnection, buildSolTransfer, sendSolTransaction } from '../chains/solana/index.js'
import { buildBtcTransfer, broadcastBtcTx, getRecommendedFees } from '../chains/btc/index.js'
import { buildSuiClient, buildSuiTransfer, sendSuiTransaction } from '../chains/sui/index.js'
import { generateSolanaKeypair, solanaKeypairFromPrivkey, signSolanaTransaction } from '../accounts/solana-keypair.js'
import { signBtcPsbt } from '../accounts/btc-bip84.js'
import { generateSuiKeypair, suiKeypairFromPrivkey, signSuiTransaction } from '../accounts/sui-ed25519.js'
import type { JsonResult, TxEnvelope } from '../core/types.js'
import { handleTxPrepare, handleTxSign, handleTxSend } from './tx.js'

export type SendResult = {
  txId?: string
  hash?: string
  status: string
  message: string
}

async function finalizeSend(
  txId: string,
  opts: { oneShot?: boolean; passphrase?: string }
): Promise<JsonResult<SendResult>> {
  if (!opts.oneShot) {
    return {
      ok: true,
      data: {
        txId,
        status: 'prepared',
        message: `Transaction prepared: ${txId}. Sign with: chain tx sign --tx-id ${txId}`,
      },
    }
  }

  const signResult = await handleTxSign({ txId, passphrase: opts.passphrase })
  if (!signResult.ok) return signResult as JsonResult<SendResult>

  const sendResult = await handleTxSend({ txId })
  if (!sendResult.ok) return sendResult as JsonResult<SendResult>

  return {
    ok: true,
    data: {
      txId,
      hash: sendResult.data.hash,
      status: 'sent',
      message: `Transaction sent: ${sendResult.data.hash}`,
    },
  }
}

export async function handleSend(opts: {
  to: string
  amount: string
  asset: string
  account?: string
  chain?: string
  oneShot?: boolean
  passphrase?: string
  feeRate?: number   // BTC: sats/vbyte
}): Promise<JsonResult<SendResult>> {
  try {
    if (!opts.account) {
      return {
        ok: false,
        error: {
          code: ErrorCode.MISSING_ARGUMENT,
          message: 'No account specified. Use --account <alias>',
          hint: 'Run "chain keys list" to see available accounts',
        },
      }
    }

    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)

    const account = getAccount(opts.account)
    if (!account) {
      return {
        ok: false,
        error: {
          code: ErrorCode.ALIAS_NOT_FOUND,
          message: `No account with alias "${opts.account}"`,
        },
      }
    }

    // ─── Solana ───────────────────────────────────────────────────────────────
    if (isSolanaChain(chainId)) {
      const rpcUrl = resolveNonEvmRpcUrl(config, chainId)
      const conn = buildSolanaConnection(rpcUrl)

      // Parse SOL amount to lamports
      const LAMPORTS_PER_SOL = 1_000_000_000n
      const lamports = BigInt(Math.round(parseFloat(opts.amount) * Number(LAMPORTS_PER_SOL)))

      const { transaction, blockhash, lastValidBlockHeight } = await buildSolTransfer(
        conn,
        account.address,
        opts.to,
        lamports
      )

      const txBytes = transaction.serializeMessage()
      const txBase64 = Buffer.from(txBytes).toString('base64')

      const now = Date.now()
      const envelope: TxEnvelope = {
        id: randomUUID(),
        status: 'prepared',
        chainId,
        from: account.address,
        to: opts.to,
        value: lamports,
        data: JSON.stringify({ type: 'solana-transfer', txBase64, blockhash, lastValidBlockHeight }),
        createdAt: now,
        updatedAt: now,
      }
      insertTx(envelope)

      if (!opts.oneShot) {
        return {
          ok: true,
          data: {
            txId: envelope.id,
            status: 'prepared',
            message: `Transaction prepared: ${envelope.id}. Sign with: chain tx sign --tx-id ${envelope.id}`,
          },
        }
      }

      // One-shot: sign and send
      const passphrase = getPassphrase(opts.passphrase)
      const keyMaterial = await loadKey(account.alias, passphrase)

      let keypair: ReturnType<typeof solanaKeypairFromPrivkey>['keypair']
      if (keyMaterial.privateKey) {
        keypair = solanaKeypairFromPrivkey(keyMaterial.privateKey).keypair
      } else if (keyMaterial.mnemonic) {
        keypair = generateSolanaKeypair(keyMaterial.mnemonic, 0).keypair
      } else {
        return {
          ok: false,
          error: { code: ErrorCode.SIGNING_ERROR, message: 'No key material found in keystore' },
        }
      }

      const signedBytes = signSolanaTransaction(keypair, transaction)
      const signedBase64 = Buffer.from(signedBytes).toString('base64')

      const updatedEnvelope: TxEnvelope = {
        ...envelope,
        status: 'signed',
        signedRawTx: signedBase64,
        updatedAt: Date.now(),
      }
      updateTx(updatedEnvelope)

      const signature = await sendSolTransaction(conn, signedBase64)

      const sentEnvelope: TxEnvelope = {
        ...updatedEnvelope,
        status: 'sent',
        hash: signature,
        updatedAt: Date.now(),
      }
      updateTx(sentEnvelope)

      return {
        ok: true,
        data: {
          txId: envelope.id,
          hash: signature,
          status: 'sent',
          message: `Transaction sent: ${signature}`,
        },
      }
    }

    // ─── Bitcoin ──────────────────────────────────────────────────────────────
    if (isBitcoinChain(chainId)) {
      const network = getBitcoinNetwork(chainId)

      // Parse BTC amount to satoshis
      const amountSats = BigInt(Math.round(parseFloat(opts.amount) * 1e8))

      // Determine fee rate
      let feeRate = opts.feeRate
      if (!feeRate) {
        const fees = await getRecommendedFees(network)
        feeRate = fees.halfHourFee
      }

      const { psbtBase64, fee } = await buildBtcTransfer({
        from: account.address,
        to: opts.to,
        amountSats,
        feeRate,
        network,
      })

      const now = Date.now()
      const envelope: TxEnvelope = {
        id: randomUUID(),
        status: 'prepared',
        chainId,
        from: account.address,
        to: opts.to,
        value: amountSats,
        data: JSON.stringify({ type: 'btc-transfer', psbtBase64, feeRate, fee: fee.toString() }),
        createdAt: now,
        updatedAt: now,
      }
      insertTx(envelope)

      if (!opts.oneShot) {
        return {
          ok: true,
          data: {
            txId: envelope.id,
            status: 'prepared',
            message: `Transaction prepared: ${envelope.id}. Sign with: chain tx sign --tx-id ${envelope.id}`,
          },
        }
      }

      // One-shot: sign and send
      const passphrase = getPassphrase(opts.passphrase)
      const keyMaterial = await loadKey(account.alias, passphrase)

      const wif = keyMaterial.privateKey
      if (!wif) {
        return {
          ok: false,
          error: { code: ErrorCode.SIGNING_ERROR, message: 'No WIF key material found in keystore' },
        }
      }

      const signedPsbtBase64 = signBtcPsbt(psbtBase64, wif, network)
      const psbt = bitcoinjsLib.Psbt.fromBase64(signedPsbtBase64)
      const txHex = psbt.extractTransaction().toHex()

      const updatedEnvelope: TxEnvelope = {
        ...envelope,
        status: 'signed',
        signedRawTx: txHex,
        updatedAt: Date.now(),
      }
      updateTx(updatedEnvelope)

      const txid = await broadcastBtcTx(txHex, network)

      const sentEnvelope: TxEnvelope = {
        ...updatedEnvelope,
        status: 'sent',
        hash: txid,
        updatedAt: Date.now(),
      }
      updateTx(sentEnvelope)

      return {
        ok: true,
        data: {
          txId: envelope.id,
          hash: txid,
          status: 'sent',
          message: `Transaction sent: ${txid}`,
        },
      }
    }

    // ─── Sui ─────────────────────────────────────────────────────────────────
    if (isSuiChain(chainId)) {
      const rpcUrl = resolveNonEvmRpcUrl(config, chainId)
      const suiNetwork = getSuiNetwork(chainId)
      const client = buildSuiClient(rpcUrl, suiNetwork)

      // Parse SUI amount to MIST (1 SUI = 1e9 MIST)
      const amountMist = BigInt(Math.round(parseFloat(opts.amount) * 1e9))

      const { txBytes } = await buildSuiTransfer(client, account.address, opts.to, amountMist)

      const now = Date.now()
      const envelope: TxEnvelope = {
        id: randomUUID(),
        status: 'prepared',
        chainId,
        from: account.address,
        to: opts.to,
        value: amountMist,
        data: JSON.stringify({ type: 'sui-transfer', txBytes }),
        createdAt: now,
        updatedAt: now,
      }
      insertTx(envelope)

      if (!opts.oneShot) {
        return {
          ok: true,
          data: {
            txId: envelope.id,
            status: 'prepared',
            message: `Transaction prepared: ${envelope.id}. Sign with: chain tx sign --tx-id ${envelope.id}`,
          },
        }
      }

      // One-shot: sign and send
      const passphrase = getPassphrase(opts.passphrase)
      const keyMaterial = await loadKey(account.alias, passphrase)

      let keypair: ReturnType<typeof suiKeypairFromPrivkey>['keypair']
      if (keyMaterial.privateKey) {
        keypair = suiKeypairFromPrivkey(keyMaterial.privateKey).keypair
      } else if (keyMaterial.mnemonic) {
        keypair = generateSuiKeypair(keyMaterial.mnemonic, 0).keypair
      } else {
        return {
          ok: false,
          error: { code: ErrorCode.SIGNING_ERROR, message: 'No key material found in keystore' },
        }
      }

      const txBytesRaw = Buffer.from(txBytes, 'base64')
      const { signature } = await signSuiTransaction(keypair, txBytesRaw)

      const updatedEnvelope: TxEnvelope = {
        ...envelope,
        status: 'signed',
        signedRawTx: txBytes,
        updatedAt: Date.now(),
      }
      updateTx(updatedEnvelope)

      const digest = await sendSuiTransaction(client, txBytes, signature)

      const sentEnvelope: TxEnvelope = {
        ...updatedEnvelope,
        status: 'sent',
        hash: digest,
        updatedAt: Date.now(),
      }
      updateTx(sentEnvelope)

      return {
        ok: true,
        data: {
          txId: envelope.id,
          hash: digest,
          status: 'sent',
          message: `Transaction sent: ${digest}`,
        },
      }
    }

    // ─── EVM (default) ───────────────────────────────────────────────────────
    if (!isAddress(opts.to)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` },
      }
    }

    if (opts.asset === 'native') {
      const prepResult = await handleTxPrepare({
        to: opts.to,
        value: opts.amount,
        from: account.address,
        chain: chainId,
      })
      if (!prepResult.ok) return prepResult as JsonResult<SendResult>
      return finalizeSend(prepResult.data.id, opts)
    }

    if (opts.asset.startsWith('ERC20:')) {
      const tokenAddr = opts.asset.slice(6)
      if (!isAddress(tokenAddr)) {
        return {
          ok: false,
          error: {
            code: ErrorCode.INVALID_ADDRESS,
            message: `Invalid ERC-20 address in asset: ${tokenAddr}`,
          },
        }
      }
      const erc20Abi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])
      const amount = parseUnits(opts.amount, 18)
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [getAddress(opts.to) as `0x${string}`, amount],
      })
      const prepResult = await handleTxPrepare({
        to: tokenAddr,
        value: '0',
        data,
        from: account.address,
        chain: chainId,
      })
      if (!prepResult.ok) return prepResult as JsonResult<SendResult>
      return finalizeSend(prepResult.data.id, opts)
    }

    return {
      ok: false,
      error: {
        code: ErrorCode.MISSING_ARGUMENT,
        message: `Unknown asset: ${opts.asset}. Use "native" or "ERC20:0x..."`,
      },
    }
  } catch (err: unknown) {
    return {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: err instanceof Error ? err.message : String(err) },
    }
  }
}
