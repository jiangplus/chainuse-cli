import { readFileSync, existsSync } from 'node:fs'
import yaml from 'js-yaml'
import { getPolicyPath } from '../config/index.js'
import type { PolicyConfig, PolicyDecision, TxEnvelope } from '../core/types.js'
import { formatUnits } from 'viem'

export function loadPolicy(): PolicyConfig {
  const policyPath = getPolicyPath()
  if (!existsSync(policyPath)) {
    throw new Error('Policy file not found. Run: chain init')
  }
  const raw = readFileSync(policyPath, 'utf-8')
  return yaml.load(raw) as PolicyConfig
}

export function evaluatePolicy(
  policy: PolicyConfig,
  envelope: TxEnvelope,
  ethPriceUsd: number
): PolicyDecision {
  const reasons: string[] = []
  const defaults = policy.defaults

  // Check simulation requirement
  if (defaults.require_simulation && envelope.simulationResult === undefined) {
    reasons.push('Simulation is required by policy but was not run')
    return { decision: 'deny', reasons }
  }

  // Check simulation success
  if (envelope.simulationResult !== null && typeof envelope.simulationResult === 'object') {
    const sim = envelope.simulationResult as { success?: boolean; returnData?: string }
    if (sim.success === false) {
      reasons.push(`Simulation failed: ${sim.returnData ?? 'unknown reason'}`)
      return { decision: 'deny', reasons }
    }
  }

  // Check max gas USD
  if (envelope.gasEstimate !== undefined && envelope.maxFeePerGas !== undefined) {
    const gasWei = envelope.gasEstimate * envelope.maxFeePerGas
    const gasEth = parseFloat(formatUnits(gasWei, 18))
    const gasUsd = gasEth * ethPriceUsd
    if (gasUsd > defaults.max_gas_usd) {
      reasons.push(
        `Estimated gas cost $${gasUsd.toFixed(2)} exceeds policy max $${defaults.max_gas_usd}`
      )
      return { decision: 'deny', reasons }
    }
  }

  // Check max value USD
  const valueEth = parseFloat(formatUnits(envelope.value, 18))
  const valueUsd = valueEth * ethPriceUsd
  if (valueUsd > defaults.max_value_per_tx_usd) {
    reasons.push(
      `Transaction value $${valueUsd.toFixed(2)} exceeds policy max $${defaults.max_value_per_tx_usd}`
    )
    return { decision: 'deny', reasons }
  }

  return { decision: 'allow', reasons: ['All policy checks passed'] }
}
