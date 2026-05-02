import { isAddress, getAddress, parseUnits, parseAbi, encodeFunctionData } from 'viem'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { getAccount } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult } from '../core/types.js'
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
}): Promise<JsonResult<SendResult>> {
  try {
    if (!isAddress(opts.to)) {
      return {
        ok: false,
        error: { code: ErrorCode.INVALID_ADDRESS, message: `Invalid destination address: ${opts.to}` },
      }
    }

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
      // Use 18 decimals as default; use chain call to get real decimals for production use
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
