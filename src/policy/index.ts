import { readFileSync, existsSync } from 'node:fs'
import yaml from 'js-yaml'
import { getPolicyPath } from '../config/index.js'
import type { PolicyConfig, PolicyDecision, TxEnvelope } from '../core/types.js'
import { formatUnits, isAddress } from 'viem'
import { getAuditSpendToday } from '../state/index.js'

export function loadPolicy(): PolicyConfig {
  const policyPath = getPolicyPath()
  if (!existsSync(policyPath)) {
    throw new Error('Policy file not found. Run: chain init')
  }
  const raw = readFileSync(policyPath, 'utf-8')
  return yaml.load(raw) as PolicyConfig
}

export async function evaluatePolicy(
  policy: PolicyConfig,
  envelope: TxEnvelope,
  ethPriceUsd: number,
  accountAlias: string
): Promise<PolicyDecision> {
  const reasons: string[] = []

  // Merge defaults with per-account overrides
  const accountRule = policy.accounts?.[accountAlias] ?? {}
  const maxGasUsd = accountRule.max_gas_usd ?? policy.defaults.max_gas_usd
  const maxValuePerTxUsd = accountRule.max_value_per_tx_usd ?? policy.defaults.max_value_per_tx_usd
  const maxDailySpendUsd = accountRule.max_daily_spend_usd ?? policy.defaults.max_daily_spend_usd
  const requireSimulation = accountRule.require_simulation ?? policy.defaults.require_simulation
  const allowedChains = accountRule.allowed_chains ?? policy.defaults.allowed_chains
  const allowedContracts = accountRule.allowed_contracts ?? policy.defaults.allowed_contracts
  const deniedContracts = accountRule.denied_contracts ?? policy.defaults.denied_contracts

  // Validate envelope.to before any address comparisons
  if (!isAddress(envelope.to)) {
    return { decision: 'deny', reasons: [`Invalid destination address: "${envelope.to}"`] }
  }

  // Chain allowlist
  if (allowedChains && allowedChains.length > 0) {
    const chainNum = envelope.chainId.replace('eip155:', '')
    if (!allowedChains.includes(chainNum) && !allowedChains.includes(envelope.chainId)) {
      reasons.push(`Chain ${envelope.chainId} not in policy allowed_chains`)
      return { decision: 'deny', reasons }
    }
  }

  // Contract deny list
  if (deniedContracts && deniedContracts.length > 0) {
    const toAddr = envelope.to.toLowerCase()
    if (deniedContracts.some((c) => c.toLowerCase() === toAddr)) {
      reasons.push(`Contract ${envelope.to} is on the policy deny list`)
      return { decision: 'deny', reasons }
    }
  }

  // Contract allowlist (only enforced when non-empty)
  if (allowedContracts && allowedContracts.length > 0) {
    const toAddr = envelope.to.toLowerCase()
    if (!allowedContracts.some((c) => c.toLowerCase() === toAddr)) {
      reasons.push(`Contract ${envelope.to} is not on the policy allow list`)
      return { decision: 'deny', reasons }
    }
  }

  // Simulation requirement
  if (requireSimulation && envelope.simulationResult === undefined) {
    reasons.push('Simulation is required by policy but was not run')
    return { decision: 'deny', reasons }
  }
  if (envelope.simulationResult !== null && typeof envelope.simulationResult === 'object') {
    const sim = envelope.simulationResult as { success?: boolean; returnData?: string }
    if (sim.success === false) {
      reasons.push(`Simulation failed: ${sim.returnData ?? 'unknown reason'}`)
      return { decision: 'deny', reasons }
    }
  }

  // Gas cost cap
  if (envelope.gasEstimate !== undefined && envelope.maxFeePerGas !== undefined) {
    const gasWei = envelope.gasEstimate * envelope.maxFeePerGas
    const gasEth = parseFloat(formatUnits(gasWei, 18))
    const gasUsd = gasEth * ethPriceUsd
    if (gasUsd > maxGasUsd) {
      reasons.push(
        `Estimated gas cost $${gasUsd.toFixed(2)} exceeds policy max $${maxGasUsd}`
      )
      return { decision: 'deny', reasons }
    }
  }

  // Per-tx value cap
  const valueEth = parseFloat(formatUnits(envelope.value, 18))
  const valueUsd = valueEth * ethPriceUsd
  if (valueUsd > maxValuePerTxUsd) {
    reasons.push(
      `Transaction value $${valueUsd.toFixed(2)} exceeds policy max $${maxValuePerTxUsd}`
    )
    return { decision: 'deny', reasons }
  }

  // Daily spend cap
  if (maxDailySpendUsd !== undefined) {
    const spentTodayUsd = await getAuditSpendToday(accountAlias)
    const projectedUsd = spentTodayUsd + valueUsd
    if (projectedUsd > maxDailySpendUsd) {
      reasons.push(
        `Daily spend would reach $${projectedUsd.toFixed(2)}, exceeding policy cap $${maxDailySpendUsd}`
      )
      return { decision: 'deny', reasons }
    }
  }

  return { decision: 'allow', reasons: ['All policy checks passed'] }
}
