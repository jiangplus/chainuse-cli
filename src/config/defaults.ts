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
  solana:mainnet:
    kind: alchemy
    key_env: ALCHEMY_KEY
    url: https://solana-mainnet.g.alchemy.com/v2
  solana:devnet:
    kind: public-rpc
    url: https://api.devnet.solana.com
  bitcoin:mainnet:
    kind: mempool
    url: https://mempool.space/api
  bitcoin:testnet:
    kind: mempool
    url: https://mempool.space/testnet/api
  sui:mainnet:
    kind: public-rpc
    url: https://fullnode.mainnet.sui.io
  sui:testnet:
    kind: public-rpc
    url: https://fullnode.testnet.sui.io
testnets:
  - eip155:11155111   # Sepolia
  - eip155:84532      # Base Sepolia
  - solana:devnet
  - bitcoin:testnet
  - sui:testnet
`
