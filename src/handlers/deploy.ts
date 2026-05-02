import { getAddress, keccak256, type Hex } from 'viem'
import { randomUUID } from 'node:crypto'
import { loadConfig, resolveChainFromConfig } from '../config/index.js'
import { buildProvider } from '../providers/index.js'
import {
  estimateGas,
  getMaxPriorityFeePerGas,
  getBlockBaseFee,
  getNonce,
  simulateTx,
} from '../chains/evm/index.js'
import { listAccounts, insertTx, insertDeployment, getDeployment, listDeployments } from '../state/index.js'
import type { Deployment } from '../state/index.js'
import { ErrorCode } from '../core/errors.js'
import type { JsonResult, TxEnvelope } from '../core/types.js'
import type { PrepareResult } from './tx.js'
import {
  parseDeployInput,
  encodeDeployData,
  computeCreate2Address,
  encodeCreate2Calldata,
  hashInitcode,
  CREATE2_FACTORY,
} from '../services/deploy-evm.js'

function catchError(err: unknown): JsonResult<never> {
  const msg = err instanceof Error ? err.message : String(err)
  const isNetwork = msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('JsonRpc')
  return {
    ok: false,
    error: {
      code: isNetwork ? ErrorCode.PROVIDER_ERROR : ErrorCode.INTERNAL_ERROR,
      message: msg,
    },
  }
}

export type DeployResult = PrepareResult & { contractAddress?: string }

export async function handleDeploy(opts: {
  bytecodeFile?: string
  abiFile?: string
  artifactFile?: string
  args?: string[]
  salt?: string
  account: string
  chain?: string
}): Promise<JsonResult<DeployResult>> {
  try {
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)

    const accounts = listAccounts()
    const acct = accounts.find((a) => a.alias === opts.account)
    if (!acct) {
      return { ok: false, error: { code: ErrorCode.ALIAS_NOT_FOUND, message: `Account alias not found: ${opts.account}` } }
    }

    // Parse deploy input
    let parsed: ReturnType<typeof parseDeployInput>
    try {
      parsed = parseDeployInput({
        bytecodeFile: opts.bytecodeFile,
        abiFile: opts.abiFile,
        artifactFile: opts.artifactFile,
      })
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCode.INVALID_ABI,
          message: err instanceof Error ? err.message : String(err),
        },
      }
    }

    // Parse constructor args — try JSON, then string fallback
    const constructorArgs: unknown[] = (opts.args ?? []).map((arg) => {
      try {
        return JSON.parse(arg)
      } catch {
        return arg
      }
    })

    const initcode = encodeDeployData(parsed.abi, parsed.bytecode, constructorArgs)
    const client = buildProvider(config, chainId)
    const from = getAddress(acct.address) as `0x${string}`

    let to: `0x${string}`
    let data: Hex
    let contractAddress: string | undefined

    if (opts.salt) {
      // CREATE2 deployment via deterministic factory
      const salt = opts.salt as Hex
      data = encodeCreate2Calldata(salt, initcode)
      to = CREATE2_FACTORY
      const initcodeHash = hashInitcode(initcode)
      contractAddress = computeCreate2Address(CREATE2_FACTORY, salt, initcodeHash)
    } else {
      // Regular CREATE deployment — send to zero address with initcode as data
      to = '0x0000000000000000000000000000000000000000'
      data = initcode
    }

    const simulation = await simulateTx(client, { from, to, value: 0n, data })

    let gasEstimate: bigint
    try {
      gasEstimate = await estimateGas(client, { from, to, value: 0n, data })
      gasEstimate = (gasEstimate * 120n) / 100n
    } catch (err) {
      return {
        ok: false,
        error: {
          code: ErrorCode.GAS_ESTIMATION_FAILED,
          message: `Gas estimation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      }
    }

    const [maxPriorityFeePerGas, baseFee] = await Promise.all([
      getMaxPriorityFeePerGas(client),
      getBlockBaseFee(client),
    ])
    const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas
    const nonce = await getNonce(client, from)

    const now = Date.now()
    const envelope: TxEnvelope = {
      id: randomUUID(),
      status: 'prepared',
      chainId,
      from,
      to,
      value: 0n,
      data,
      gasEstimate,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      simulationResult: simulation,
      createdAt: now,
      updatedAt: now,
    }

    insertTx(envelope)

    // If CREATE2, we know the address — persist deployment record now
    if (contractAddress && opts.salt) {
      insertDeployment({
        address: contractAddress,
        chainId,
        txHash: undefined,
        abi: JSON.stringify(parsed.abi),
        bytecodeHash: keccak256(parsed.bytecode),
        salt: opts.salt,
        deployer: from,
        createdAt: now,
      })
    }

    return {
      ok: true,
      data: { ...(envelope as PrepareResult), contractAddress },
    }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleDeploymentsList(opts: {
  chain?: string
}): Promise<JsonResult<Deployment[]>> {
  try {
    const config = loadConfig()
    let chainId: string | undefined
    if (opts.chain) {
      chainId = resolveChainFromConfig(config, opts.chain)
    }
    const deployments = listDeployments(chainId)
    return { ok: true, data: deployments }
  } catch (err) {
    return catchError(err)
  }
}

export async function handleDeploymentShow(opts: {
  address: string
  chain?: string
}): Promise<JsonResult<Deployment>> {
  try {
    if (!opts.address) {
      return { ok: false, error: { code: ErrorCode.MISSING_ARGUMENT, message: 'Supply --address <0x...>' } }
    }
    const config = loadConfig()
    const chainId = resolveChainFromConfig(config, opts.chain)
    const deployment = getDeployment(opts.address, chainId)
    if (!deployment) {
      return {
        ok: false,
        error: {
          code: ErrorCode.TX_NOT_FOUND,
          message: `No deployment found for address ${opts.address} on chain ${chainId}`,
        },
      }
    }
    return { ok: true, data: deployment }
  } catch (err) {
    return catchError(err)
  }
}
