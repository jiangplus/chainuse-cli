export const DEFAULT_CONFIG_YAML = `version: 1
default_chain: eip155:1
providers:
  eip155:1:
    kind: alchemy
    key_env: ALCHEMY_KEY
    url: https://eth-mainnet.g.alchemy.com/v2
  eip155:8453:
    kind: alchemy
    key_env: ALCHEMY_KEY
    url: https://base-mainnet.g.alchemy.com/v2
  eip155:42161:
    kind: alchemy
    key_env: ALCHEMY_KEY
    url: https://arb-mainnet.g.alchemy.com/v2
  eip155:11155111:
    kind: alchemy
    key_env: ALCHEMY_KEY
    url: https://eth-sepolia.g.alchemy.com/v2
testnets:
  - eip155:11155111   # Sepolia
  - eip155:84532      # Base Sepolia
`
