import { describe, it, expect } from 'bun:test'
import { evaluatePolicy } from '../../src/policy/index.js'
import type { PolicyConfig, TxEnvelope } from '../../src/core/types.js'
import { parseUnits } from 'viem'

const ETH_PRICE = 3000

function makeEnvelope(overrides: Partial<TxEnvelope> = {}): TxEnvelope {
  return {
    id: 'test-id',
    status: 'prepared',
    chainId: 'eip155:1',
    from: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    value: 0n,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

function makePolicy(overrides: Partial<PolicyConfig['defaults']> = {}, accounts: PolicyConfig['accounts'] = {}): PolicyConfig {
  return {
    version: 1,
    defaults: {
      require_simulation: false,
      max_gas_usd: 10,
      max_value_per_tx_usd: 1000,
      ...overrides,
    },
    accounts,
  }
}

describe('evaluatePolicy — basic allow', () => {
  it('allows a zero-value tx by default', async () => {
    const result = await evaluatePolicy(makePolicy(), makeEnvelope(), ETH_PRICE, 'alice')
    expect(result.decision).toBe('allow')
  })

  it('allows a tx under the value cap', async () => {
    const value = parseUnits('0.1', 18) // $300 at $3000/ETH
    const result = await evaluatePolicy(makePolicy(), makeEnvelope({ value }), ETH_PRICE, 'alice')
    expect(result.decision).toBe('allow')
  })
})

describe('evaluatePolicy — value cap', () => {
  it('denies a tx exceeding max_value_per_tx_usd', async () => {
    const value = parseUnits('1', 18) // $3000 > $1000 cap
    const result = await evaluatePolicy(makePolicy(), makeEnvelope({ value }), ETH_PRICE, 'alice')
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/exceeds policy max/)
  })

  it('allows a tx at exactly the cap', async () => {
    // $1000 / $3000 per ETH = 0.3333 ETH
    const value = parseUnits('0.3333', 18)
    const result = await evaluatePolicy(makePolicy(), makeEnvelope({ value }), ETH_PRICE, 'alice')
    expect(result.decision).toBe('allow')
  })
})

describe('evaluatePolicy — gas cap', () => {
  it('denies when estimated gas exceeds max_gas_usd', async () => {
    // 500k gas at 100 gwei = 0.05 ETH = $150 > $10 cap
    const envelope = makeEnvelope({
      gasEstimate: 500_000n,
      maxFeePerGas: parseUnits('100', 9),
    })
    const result = await evaluatePolicy(makePolicy(), envelope, ETH_PRICE, 'alice')
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/gas cost/)
  })

  it('allows gas within cap', async () => {
    // 100k gas at 1 gwei = 0.0001 ETH = $0.30 < $10 cap
    const envelope = makeEnvelope({
      gasEstimate: 100_000n,
      maxFeePerGas: parseUnits('1', 9),
    })
    const result = await evaluatePolicy(makePolicy(), envelope, ETH_PRICE, 'alice')
    expect(result.decision).toBe('allow')
  })
})

describe('evaluatePolicy — simulation requirement', () => {
  it('denies when simulation required but not run', async () => {
    const result = await evaluatePolicy(
      makePolicy({ require_simulation: true }),
      makeEnvelope(), // no simulationResult
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/Simulation is required/)
  })

  it('denies when simulation explicitly failed', async () => {
    const result = await evaluatePolicy(
      makePolicy({ require_simulation: true }),
      makeEnvelope({ simulationResult: { success: false, returnData: '0x' } }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/Simulation failed/)
  })

  it('allows when simulation passed', async () => {
    const result = await evaluatePolicy(
      makePolicy({ require_simulation: true }),
      makeEnvelope({ simulationResult: { success: true } }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('allow')
  })
})

describe('evaluatePolicy — chain allowlist', () => {
  it('denies a tx on a non-allowlisted chain', async () => {
    const result = await evaluatePolicy(
      makePolicy({ allowed_chains: ['8453', '42161'] }),
      makeEnvelope({ chainId: 'eip155:1' }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/allowed_chains/)
  })

  it('allows a tx on an allowlisted chain', async () => {
    const result = await evaluatePolicy(
      makePolicy({ allowed_chains: ['1', '8453'] }),
      makeEnvelope({ chainId: 'eip155:1' }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('allow')
  })

  it('matches CAIP-2 format in the list', async () => {
    const result = await evaluatePolicy(
      makePolicy({ allowed_chains: ['eip155:1'] }),
      makeEnvelope({ chainId: 'eip155:1' }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('allow')
  })
})

describe('evaluatePolicy — contract deny/allow lists', () => {
  const CONTRACT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'

  it('denies when to address is on deny list', async () => {
    const result = await evaluatePolicy(
      makePolicy({ denied_contracts: [CONTRACT] }),
      makeEnvelope({ to: CONTRACT }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/deny list/)
  })

  it('denies when to address is NOT on allow list', async () => {
    const result = await evaluatePolicy(
      makePolicy({ allowed_contracts: ['0x0000000000000000000000000000000000000001'] }),
      makeEnvelope({ to: CONTRACT }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
    expect(result.reasons[0]).toMatch(/allow list/)
  })

  it('allows when to address IS on allow list', async () => {
    const result = await evaluatePolicy(
      makePolicy({ allowed_contracts: [CONTRACT] }),
      makeEnvelope({ to: CONTRACT }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('allow')
  })

  it('deny list check is case-insensitive', async () => {
    const result = await evaluatePolicy(
      makePolicy({ denied_contracts: [CONTRACT.toLowerCase()] }),
      makeEnvelope({ to: CONTRACT }),
      ETH_PRICE,
      'alice'
    )
    expect(result.decision).toBe('deny')
  })
})

describe('evaluatePolicy — per-account overrides', () => {
  it('applies tighter per-account cap over defaults', async () => {
    const policy = makePolicy(
      { max_value_per_tx_usd: 1000 },
      { alice: { max_value_per_tx_usd: 50 } }
    )
    const value = parseUnits('0.1', 18) // $300 > alice's $50 cap but < default $1000
    const result = await evaluatePolicy(policy, makeEnvelope({ value }), ETH_PRICE, 'alice')
    expect(result.decision).toBe('deny')
  })

  it('bob with default limit passes same tx that alice denied', async () => {
    const policy = makePolicy(
      { max_value_per_tx_usd: 1000 },
      { alice: { max_value_per_tx_usd: 50 } }
    )
    const value = parseUnits('0.1', 18) // $300 < bob's default $1000 cap
    const result = await evaluatePolicy(policy, makeEnvelope({ value }), ETH_PRICE, 'bob')
    expect(result.decision).toBe('allow')
  })
})
