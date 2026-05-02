# Chainuse (`chain`)

Multi-chain CLI for EVM key management, transaction signing, and smart contract interactions.

## Quickstart

### Install

```bash
npm install
npm run build
# Link the binary globally
npm link
```

Or run directly:

```bash
node dist/index.js <command>
```

### Prerequisites

```bash
# Required: Alchemy API key for RPC access
export ALCHEMY_API_KEY=your_alchemy_key

# Required: Passphrase for keystore encryption
export CHAINUSE_PASSPHRASE=your_secure_passphrase
```

### Initialize

```bash
chain init
```

Creates `~/.chainuse/`:
- `config.yaml` — provider and chain configuration
- `policy.yaml` — signing policy (gas limits, value limits)
- `keystore.db` — encrypted key storage (SQLite)
- `state.db` — accounts and transaction history (SQLite)

### Generate a key

```bash
chain keys generate --chain evm --alias mykey
```

Save the mnemonic shown — it will not be displayed again.

### Check balance

```bash
# By address
chain balance 0xYourAddress --chain mainnet

# By alias
chain balance mykey --chain base

# ERC-20 token
chain balance mykey --chain eip155:1 --token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

### Send ETH (two-phase)

```bash
# Step 1: Prepare
chain tx prepare --from 0xYourAddress --to 0xDest --value 0.01 --chain sepolia

# Step 2: Sign (policy-gated)
chain tx sign --tx-id <id>

# Step 3: Broadcast
chain tx send --tx-id <id>

# Check status
chain tx status --hash 0x...
```

### Send ETH (one-shot)

```bash
chain send --to 0xDest --amount 0.01 --asset native --account mykey --one-shot
```

### Import a key

```bash
# From mnemonic
chain keys import --from mnemonic --alias imported "word1 word2 ... word12"

# From private key
chain keys import --from privkey --alias hardhat "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

### List accounts

```bash
chain keys list
```

### Call a contract

```bash
# With method signature
chain call 0xContractAddr "balanceOf(address)" 0xYourAddress --chain mainnet

# With ABI file
chain call 0xContractAddr transfer --abi ./erc20.abi.json 0xDest 1000000
```

### Read storage slot

```bash
chain storage-get 0xContractAddr 0 --chain mainnet
```

### View policy

```bash
chain policy show
```

## Output formats

```bash
# JSON (default when piping / not a TTY)
chain keys list --json

# Human-readable (default in terminal)
chain keys list --human
```

## Chain aliases

| Alias | Chain ID |
|-------|----------|
| `mainnet`, `ethereum` | `eip155:1` |
| `base` | `eip155:8453` |
| `arbitrum`, `arb` | `eip155:42161` |
| `optimism`, `op` | `eip155:10` |
| `polygon` | `eip155:137` |
| `sepolia` | `eip155:11155111` |
| `base-sepolia` | `eip155:84532` |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User error (bad input, missing arg, alias not found) |
| `2` | Policy denial |
| `3` | Provider/network error |
| `4` | Signing/decryption error |

## Architecture

```
src/
  index.ts              # Entry point
  cli/
    index.ts            # Commander setup, all commands
    format.ts           # Output formatting helpers
  handlers/             # Pure async handler functions (testable without CLI)
    init.ts
    keys.ts
    balance.ts
    send.ts
    tx.ts
    call.ts
    policy.ts
  core/
    types.ts            # Shared types: JsonResult, TxEnvelope, Account, etc.
    errors.ts           # Error codes enum + exit code mapping
  chains/evm/
    index.ts            # viem wrappers: gas, eth_call, storage, broadcast
    utils.ts            # Address helpers, chain alias resolution
  providers/
    index.ts            # Build viem PublicClient from config
    alchemy/index.ts    # Alchemy-specific helpers
  accounts/
    eoa.ts              # BIP-39/44 generate, import, sign
  keystore/
    index.ts            # scrypt + AES-256-GCM, SQLite storage
  policy/
    index.ts            # Load policy.yaml, evaluate tx
    defaults.ts         # Default policy YAML template
  state/
    index.ts            # Account and tx CRUD
    db.ts               # SQLite open + migrate
  config/
    index.ts            # Load config.yaml, path helpers
    defaults.ts         # Default config YAML template
```

## Security

- Private keys and mnemonics are **never stored in plaintext**
- Keystore encrypted with scrypt(N=32768, r=8, p=1) → AES-256-GCM
- Passphrase from env var `CHAINUSE_PASSPHRASE` or `--passphrase` flag
- Keystore database permissions: `0600`
- Config directory permissions: `0700`
