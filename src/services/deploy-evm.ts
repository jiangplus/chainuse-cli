import { readFileSync } from 'node:fs'
import {
  encodeDeployData as viemEncodeDeployData,
  keccak256,
  concat,
  pad,
  getContractAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem'

export type ParsedDeployInput = {
  bytecode: Hex
  abi: Abi
}

export function parseDeployInput(opts: {
  bytecodeFile?: string
  abiFile?: string
  artifactFile?: string
}): ParsedDeployInput {
  if (opts.artifactFile) {
    // Hardhat/Foundry artifact format
    const raw = readFileSync(opts.artifactFile, 'utf-8')
    const artifact = JSON.parse(raw) as {
      abi?: Abi
      bytecode?: string | { object?: string }
      deployedBytecode?: string
    }

    let bytecode: string | undefined
    if (typeof artifact.bytecode === 'string') {
      bytecode = artifact.bytecode
    } else if (typeof artifact.bytecode === 'object' && artifact.bytecode?.object) {
      bytecode = artifact.bytecode.object
    }

    if (!bytecode) {
      throw new Error('No bytecode found in artifact file')
    }
    if (!artifact.abi) {
      throw new Error('No ABI found in artifact file')
    }

    const bytecodeHex = bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`
    return { bytecode: bytecodeHex as Hex, abi: artifact.abi }
  }

  if (!opts.bytecodeFile) {
    throw new Error('Supply --artifact or --bytecode (with optional --abi)')
  }

  const bytecodeRaw = readFileSync(opts.bytecodeFile, 'utf-8').trim()
  const bytecodeHex = bytecodeRaw.startsWith('0x') ? bytecodeRaw : `0x${bytecodeRaw}`

  let abi: Abi = []
  if (opts.abiFile) {
    const abiRaw = readFileSync(opts.abiFile, 'utf-8')
    abi = JSON.parse(abiRaw) as Abi
  }

  return { bytecode: bytecodeHex as Hex, abi }
}

export function encodeDeployData(
  abi: Abi,
  bytecode: Hex,
  constructorArgs: unknown[]
): Hex {
  if (constructorArgs.length === 0) {
    return bytecode
  }
  return viemEncodeDeployData({
    abi,
    bytecode,
    args: constructorArgs as readonly unknown[],
  })
}

// Standard CREATE2 factory (deterministic deployer)
export const CREATE2_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as Address

export function encodeCreate2Calldata(salt: Hex, initcode: Hex): Hex {
  // CREATE2 factory expects: salt (32 bytes) + initcode
  const saltPadded = pad(salt, { size: 32 })
  return concat([saltPadded, initcode]) as Hex
}

export function computeCreate2Address(
  deployer: Address,
  salt: Hex,
  initcodeHash: Hex
): Address {
  return getContractAddress({
    opcode: 'CREATE2',
    from: deployer,
    salt: salt as `0x${string}`,
    bytecodeHash: initcodeHash as `0x${string}`,
  })
}

export function hashInitcode(initcode: Hex): Hex {
  return keccak256(initcode)
}
