export const DEFAULT_POLICY_YAML = `version: 1
defaults:
  require_simulation: true
  max_gas_usd: 10.00
  max_value_per_tx_usd: 1000.00
  max_daily_spend_usd: 5000.00
  # allowed_chains: ['1', '8453', '42161']
  # denied_contracts: []
  # allowed_contracts: []

# Per-account overrides (account alias as key)
# accounts:
#   hot-wallet:
#     max_value_per_tx_usd: 50.00
#     max_daily_spend_usd: 200.00
#     allowed_chains: ['8453']
`
