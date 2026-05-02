# Chainuse — Blockchain CLI Wallet for AI Agents

> A multi-chain CLI wallet (EVM, Solana, BTC, Sui) designed first for **autonomous AI agents** and second for human operators. Built on Alchemy infrastructure. Deterministic, JSON-first, policy-gated.
>
> **Project name:** Chainuse. **CLI binary:** `chain`. **Config dir:** `~/.chainuse/`.

---

## 1. Overview & Goals

### Problem
AI agents that hold or move on-chain assets need a wallet that is:

- **Scriptable end-to-end** — no interactive prompts, no GUI, no hidden state.
- **Multi-chain by one mental model** — same verbs (`balance`, `send`, `prepare`, `sign`, `send`) across EVM, Solana, BTC, Sui.
- **Safe by construction** — every signing decision passes a declarative policy, every state-changing op is previewable, every action is auditable.
- **Modern** — first-class support for ERC-4337, ERC-7702, Safe, WalletConnect, Uniswap, Squid, Chainlink, ENS.

### Non-goals
- GUI / mobile app / browser extension.
- Custodial cloud key storage.
- Building our own bundler, indexer, or RPC node — we consume Alchemy.
- Becoming a wallet UI for end users; humans are welcome but not the design center.

### Target users
1. **Autonomous agents** running in trusted environments (long-running processes, cron jobs, MCP tools).
2. **Engineers / researchers** scripting on-chain workflows from a terminal or notebook.

### Headline capabilities
| Area | Support |
| --- | --- |
| Chains | Ethereum + L2s (OP, Arbitrum, Base, Polygon, zkSync, Linea, Scroll), Solana, Bitcoin, Sui |
| Account types | EOA, ERC-4337 SmartAccount, ERC-7702 delegated EOA, Gnosis Safe (multisig), Solana ed25519, BTC BIP-84/86, Sui ed25519 |
| Token standards | ERC-20, ERC-721, ERC-1155, SPL, BRC-20 (read), Sui Coin / Object |
| Stablecoins | First-class **USDC** and **USDT** verbs (`chain usdc …`, `chain usdt …`) across all supported EVM chains and Solana |
| Token registry | Built-in symbol → address registry (USDC, USDT, WETH, WBTC, DAI, LINK, UNI, native wraps, LSTs, …); user-extensible |
| DeFi | Uniswap v3/v4 swap, Squid Router cross-chain transfer + swap, **Aave v3 (supply / borrow / repay / withdraw / health)** |
| Pricing | Chainlink price feeds (per-chain registry) |
| Naming | ENS resolve / reverse / set-primary / records |
| Auth | **Sign In With Ethereum (EIP-4361 / SIWE)** — build, sign, and verify SIWE messages |
| Connectivity | WalletConnect v2 (pair, approve, listen, sign) |
| Deployment | EVM contract deploy with CREATE / CREATE2 |
| Provider | Alchemy (RPC + Enhanced APIs + Gas Manager + Account Kit) behind a chain-agnostic `Provider` interface; public-RPC / Infura swap-in |
| Roadmap | **Nervos CKB chain adapter; x402 provider + consumer** (see §17) |

---

## 2. Design Principles

1. **JSON-first I/O.** When stdout is not a TTY, output is JSON by default. Human-readable output is opt-in (`--human`). Every JSON response follows one envelope:
   ```json
   { "ok": true, "data": { ... } }
   { "ok": false, "error": { "code": "E_POLICY_DENIED", "message": "...", "hint": "..." } }
   ```
2. **Deterministic command surface.** Stable verb-noun structure, stable flag names, stable error codes, stable exit codes. Breaking changes require a major version bump and a `--compat <version>` shim.
3. **Two-phase execution.** State-changing operations decompose into:
   ```
   prepare → (returns unsigned tx + simulation + cost + risk notes)
   sign    → (returns signed payload, gated by policy)
   send    → (broadcasts, returns hash + tracking handle)
   ```
   A `--one-shot` flag chains them — explicitly opted into.
4. **Policy gates every signature.** No sign without a policy. No silent overrides. Policy decisions are logged.
5. **Provider-agnostic core.** Alchemy is the default provider plug-in; public RPC and Infura are drop-in alternatives. The agent should never care which is being used.
6. **Idempotent where possible.** `prepare` is pure. `send` is keyed by a client-supplied idempotency key.
7. **Local state is the source of truth for accounts and history.** Chain state is the source of truth for balances and nonces — but cached.

---

## 3. Architecture

### Stack
- **Language:** TypeScript on Node 20+. Chosen because the richest open-source SDKs for every required capability live in the JS ecosystem (`viem`, `@solana/web3.js`, `bitcoinjs-lib`, `@mysten/sui`, `@walletconnect/sign-client`, `@safe-global/protocol-kit`, `permissionless`, `@uniswap/sdk`, `@0xsquid/sdk`, Alchemy SDK, Chainlink ABIs).
- **Distribution:** single self-contained binary named `chain` via `bun build --compile` (primary) and `npm i -g chainuse` (secondary; npm package `chainuse` installs the `chain` binary).
- **Storage:** SQLite via `better-sqlite3` for accounts, address book, tx history, nonce cache, WC sessions, deployments.
- **Crypto at rest:** `scrypt` (N=2¹⁷, r=8, p=1) → AES-256-GCM. OS keychain integration optional via `keytar`.
- **Hardware wallet:** Ledger via `@ledgerhq/hw-app-eth`, `@ledgerhq/hw-app-solana`, `@ledgerhq/hw-app-btc` — pluggable signer.

### Layered layout

> **Handler/adapter split (decided):** every verb is implemented once in `handlers/` as a pure async function returning the JSON envelope. `cli/` is a thin commander adapter. M1 ships CLI only; the JSON-RPC daemon (M7) and MCP adapter (M8) are additional thin adapters over the same handlers — no re-plumbing.

```
src/
  cli/                     # commander/clipanion command tree, output formatter (M1)
  handlers/                # pure verb implementations → JSON envelope (M1)
  core/                    # chain-agnostic interfaces
    Wallet.ts              # opens keystore, lists accounts
    Account.ts             # an addressable, signable identity
    Tx.ts                  # unsigned/signed/broadcast tx envelope
    Asset.ts               # native / fungible / non-fungible / multi
    Provider.ts            # RPC + enhanced data
    Signer.ts              # local | hardware | smart-account | safe
    Policy.ts              # decision result + reasons
  chains/
    evm/                   # viem-based adapter, multi-network
    solana/                # @solana/web3.js adapter
    btc/                   # bitcoinjs-lib adapter
    sui/                   # @mysten/sui adapter
  providers/
    alchemy/               # default
    public-rpc/            # fallback
  accounts/
    eoa.ts
    erc4337.ts             # permissionless.js + Alchemy bundler/paymaster
    erc7702.ts             # delegation-aware EOA
    safe.ts                # Safe{Core} SDK
    solana-keypair.ts
    btc-bip84.ts
    sui-ed25519.ts
    ledger.ts              # signer adapter
  services/
    ens.ts
    swap-uniswap.ts
    bridge-squid.ts
    lending-aave.ts          # Aave v3 supply/borrow/repay/withdraw/health
    price-chainlink.ts
    walletconnect.ts
    deploy-evm.ts
    tokens-erc20.ts
    tokens-erc721.ts
    tokens-erc1155.ts
    tokens-registry.ts       # built-in (chain,symbol)→address; user overrides; resolver
    stablecoins.ts           # USDC / USDT shortcut verbs over erc20 + spl
    sui-ptb.ts               # PTB builder for `chain sui ptb`
    siwe.ts                  # Sign In With Ethereum (EIP-4361): build/sign/verify
  keystore/                # encrypted at rest
  policy/                  # YAML loader + evaluator
  state/                   # SQLite schema + repos
  daemon/                  # JSON-RPC adapter (M7) + MCP adapter (M8)
```

### Data flow for a state-changing op
```
agent
  └─ chain swap execute --from USDC --to ETH --amount 100 --json
       └─ services/swap-uniswap → builds route via SmartOrderRouter
            └─ chains/evm → builds Tx
                 └─ providers/alchemy.simulate → cost + decoded effects
                      └─ policy.evaluate(tx, account) → allow|deny|require-2fa
                           └─ accounts/<type>.sign
                                └─ providers/alchemy.send
                                     └─ state.recordTx + audit.log
                                          └─ stdout: { ok, data: { hash, ... } }
```

---

## 4. Account Model

All accounts are addressable by a local **alias** (e.g. `--account agent-1`) that maps to `(chain, address, type, signer)`.

### EVM
- **EOA** — BIP-39 mnemonic, BIP-44 derivation `m/44'/60'/0'/0/x`. Default for new EVM accounts.
- **ERC-4337 SmartAccount** — built via `permissionless.js` with a chosen factory:
  - `LightAccount` (Alchemy)
  - `Kernel` (ZeroDev)
  - `SafeSmartAccount` (Safe-as-4337)
  - Bundler: Alchemy. Paymaster: Alchemy Gas Manager (sponsored or ERC-20). Owner key stored as standard EOA in the keystore.
- **ERC-7702 Authorized EOA** — an ordinary EOA that has signed an authorization to delegate code execution to a designated implementation contract (e.g. `SimpleDelegate`, `BatchExecutor`). Chainuse stores the authorization tuple and replays it per tx until revoked.
- **Gnosis Safe** — Safe{Core} Protocol Kit. Owners + threshold tracked locally; transactions go through `propose → confirm → execute` with off-chain signature collection or on-chain approveHash.

### Solana
- ed25519 keypair, BIP-44 `m/44'/501'/x'/0'`. Auto-derives Associated Token Accounts on first SPL touch.

### Bitcoin
- Default **BIP-84 native segwit** (`bc1q…`). Optional **BIP-86 taproot** (`bc1p…`). BIP-39 mnemonic may be shared with EVM.
- Coin selection: branch-and-bound, fee target from `mempool.space` API.

### Sui
- ed25519 default, `m/44'/784'/x'/0'/0'`. secp256k1 supported. Uses `@mysten/sui` programmable transaction blocks.

### Cross-account features
- `keys generate` and `keys import` accept `--mnemonic` to share seed across chains.
- All accounts addressable via `--account <alias>` or `--address <0x…|base58|bc1…|0x… (sui)>`.

---

## 5. Command Surface

> Illustrative, not exhaustive. Every command supports `--json` (default off-tty), `--human`, `--dry-run`, `--simulate`, `--gas-estimate`, `--account <alias>`, `--chain <id|name>`, `--idempotency-key <k>`, `--policy <file>`.

### Setup & keys
```
chain init                              # init keystore + config + policy template
chain keys generate --chain evm|sol|btc|sui [--mnemonic] [--alias name]
chain keys import   --from mnemonic|privkey|json [--alias name]
chain keys export   --alias name [--format mnemonic|privkey|json]
chain keys list
chain keys delete   --alias name
```

### Accounts (smart accounts)
```
chain account create --type 4337 --owner <eoa-alias> --factory light|kernel|safe
chain account create --type 7702 --owner <eoa-alias> --delegate <impl-address>
chain account create --type safe --owners <addr,addr,...> --threshold 2
chain account list [--chain ...]
chain account info  --alias name
```

### Read
```
chain balance       <address|alias> [--chain ...] [--token native|0x…|all]
chain assets        <address|alias> [--chain all]                  # via Alchemy
chain history       <address|alias> [--limit 50]                   # via Alchemy transfers
chain call          <contract> <method> [args...] [--abi <file>]   # eth_call / equivalent
chain storage-get   <contract> <slot>                              # eth_getStorageAt
```

### Write (two-phase)
```
chain tx prepare    --to <addr|ens> --value <v> [--data 0x…]
chain tx sign       --tx-id <prepared-id>
chain tx send       --tx-id <signed-id>
chain tx status     --hash <0x…> | --tx-id <id>

chain send          --to <addr|ens> --amount <v> --asset <native|ERC20:0x…|SPL:…>
                       [--one-shot]                                   # prepare+sign+send
```

### Tokens
```
chain erc20  transfer | approve | allowance | balance | info
chain erc721 transfer | mint    | owner     | tokenURI | balance
chain erc1155 transfer | balance | uri      | batch-transfer
chain spl   transfer | balance | mint

# Stablecoin shortcut verbs (sugar over erc20/spl, with built-in token registry)
chain usdc  transfer --to <addr|ens> --amount <v> [--chain ...]
chain usdc  balance  <address|alias> [--chain all]
chain usdt  transfer --to <addr|ens> --amount <v> [--chain ...]
chain usdt  balance  <address|alias> [--chain all]

# Token registry inspection
chain tokens list   [--chain ...] [--symbol USDC]
chain tokens info   <symbol|address> [--chain ...]
chain tokens add    --chain <id> --symbol <S> --address 0x… --decimals N   # user override
chain tokens remove --chain <id> --symbol <S>
```

> **Symbol resolution.** Anywhere a token is accepted (`--asset`, `--from`, `--to`, `--token`, `--collateral`, `aave …`, `swap …`, `bridge …`), you may pass either:
> - a raw address (`0x…`, base58 SPL mint, etc.), or
> - a known symbol (`USDC`, `USDT`, `WETH`, `WBTC`, `DAI`, `LINK`, `UNI`, `ETH`, `SOL`, `SUI`, `BTC`, `MATIC`, `ARB`, `OP`, `BASE`, `cbBTC`, `wstETH`, `weETH`, …).
>
> Symbols are scoped per chain: `USDC` on `eip155:1` resolves to `0xA0b8…eB48`; `USDC` on `eip155:8453` resolves to `0x8335…2913`; `USDC` on Solana resolves to `EPjF…t1v`. The chain comes from `--chain` or the account's default. Ambiguity is rejected with `E_AMBIGUOUS_SYMBOL`.

### ENS
```
chain ens resolve   <name>                      # name → address + records
chain ens reverse   <address>                   # address → primary name
chain ens set-primary <name> --account <alias>
chain ens set-record  <name> <key> <value>      # avatar, url, com.twitter, ...
```

### Sign In With Ethereum (EIP-4361)
```
chain siwe build    --domain <d> --uri <u> --account <alias>
                    [--statement "..."] [--chain-id <n>] [--nonce <s>]
                    [--issued-at <iso>] [--expiration <iso>] [--not-before <iso>]
                    [--request-id <s>] [--resources <uri,uri,...>]
                                                       # emits canonical EIP-4361 message
chain siwe sign     --message-file <f> | --message "<text>" --account <alias>
                                                       # → { message, signature, address }
chain siwe login    --domain <d> --uri <u> --account <alias> [--statement ...] [--nonce ...]
                                                       # one-shot: build + sign (uses fresh nonce if omitted)
chain siwe verify   --message-file <f> | --message "<text>" --signature 0x…
                    [--expected-domain <d>] [--expected-nonce <s>] [--expected-address 0x…|<ens>]
                                                       # checks signature, domain, nonce, time bounds, chain-id;
                                                       # supports EOA (ECDSA) AND smart-contract accounts via EIP-1271
```

> SIWE is a signing operation, not a transaction — but it still passes through the **policy engine** (`siwe.allowed_domains`, `siwe.deny_domains`) so an agent can be restricted to logging into specific dapps. WalletConnect `personal_sign` requests that match the SIWE format are routed through the same code path and policy hook.

### DeFi
```
chain swap   quote   --from <token> --to <token> --amount <v> [--exact in|out]
                        [--recipient <addr|ens>]
                        [--slippage <bps>] [--max-slippage <bps>]
                        [--min-out <v>] [--max-price-impact <bps>]
chain swap   execute --from ...     --to ...     --amount <v>
                        [--recipient <addr|ens>]               # default: sender
                        [--slippage <bps>]                      # tolerance, default 50
                        [--max-slippage <bps>]                  # hard cap, default 200; abort above
                        [--min-out <v>]                         # absolute floor on output amount
                        [--max-price-impact <bps>]              # default 300; abort above
                        [--deadline <sec>]
chain bridge quote   --from-chain <c> --to-chain <c> --from <t> --to <t> --amount <v>
chain bridge execute --from-chain ... --to-chain ... ...
chain bridge status  --route-id <id>             # via Squid status API
```

### Pricing
```
chain price <symbol|0xfeed>            # Chainlink latestRoundData
chain price feeds [--chain ...]        # list known feeds
```

### Lending (Aave v3)
```
chain aave markets       [--chain ...]                              # list reserves + APY
chain aave position      --account <alias> [--chain ...]            # supplies, borrows, health factor
chain aave supply        --asset <token> --amount <v>
chain aave withdraw      --asset <token> --amount <v|max>
chain aave borrow        --asset <token> --amount <v> --rate variable|stable
chain aave repay         --asset <token> --amount <v|max>
chain aave set-collateral --asset <token> --enabled true|false
chain aave e-mode        --category <id>
```

### Sui Programmable Transaction Blocks
```
chain sui ptb new                                                   # start a draft
chain sui ptb add-move-call --target <pkg::module::fn> --args ...
chain sui ptb add-transfer  --recipient <addr> --object <id|coin>
chain sui ptb add-split     --coin <id> --amounts <v,v,...>
chain sui ptb add-merge     --primary <id> --sources <id,id,...>
chain sui ptb show                                                  # render the draft
chain sui ptb prepare                                               # dry-run + cost
chain sui ptb sign | send                                           # two-phase
```

### Safe
```
chain safe create  --owners ... --threshold N
chain safe info    --address 0x…
chain safe propose --to ... --value ... --data ...
chain safe confirm --tx-hash <safeTxHash>
chain safe execute --tx-hash <safeTxHash>
chain safe queue   --address 0x…
```

### WalletConnect
```
chain wc pair      <wc:uri>                       # returns pending session JSON
chain wc approve   --session-id <id> --account <alias> --chains <list>
chain wc reject    --session-id <id>
chain wc sessions
chain wc listen    [--ndjson]                     # streams incoming requests
chain wc sign      --request-id <id>              # passes through policy
chain wc reject    --request-id <id>
```

### EVM contract deployment
```
chain deploy --bytecode <file> --abi <file> [--args ...] [--create2 --salt 0x…]
chain deploy --artifact <hardhat-or-foundry-json> [--args ...]
chain deployments list
chain deployments show --address 0x…
```

### Policy & audit
```
chain policy show
chain policy edit
chain policy test --tx-id <prepared-id>          # explain allow/deny + reasons
chain audit tail [-f]
```

### Daemon (optional, recommended for agents)
```
chain daemon start   [--port 8787] [--mcp]       # JSON-RPC + optional MCP server
chain daemon stop
chain daemon status
```

---

## 6. Provider Integration (Alchemy)

### RPC
- Per-chain endpoint: `https://{network}.g.alchemy.com/v2/{API_KEY}`.
- Concurrent multi-chain fanout for `assets` and `history` queries.
- Automatic retry with jitter; circuit breaker per network.

### Enhanced APIs (used directly)
| API | Used for |
| --- | --- |
| `alchemy_getTokenBalances` | `balance --token all`, `assets` |
| `alchemy_getTokenMetadata` | symbol/decimals enrichment |
| `alchemy_getAssetTransfers` | `history` |
| NFT API (`getNFTsForOwner`, `getContractMetadata`, floor) | `assets` for ERC-721/1155 |
| `alchemy_simulateExecution` / `alchemy_simulateAssetChanges` | every `prepare` produces decoded effects |
| **Gas Manager** | Sponsored UserOps for ERC-4337 |
| **Account Kit** | Smart-account factory addresses, bundler RPC |

### Pluggability
A `Provider` interface defines the surface (`getBalance`, `getTokenBalances`, `getTransfers`, `simulate`, `sendRawTransaction`, `sendUserOperation`, `getFeeData`, `getCode`, `call`). Adapters: `alchemy` (default), `public-rpc`, `infura`. Selection per chain in `config.yaml`.

### Provider boundary
Alchemy is the default provider but the wallet **must not be coupled to Alchemy**. The `Provider` interface above is the contract; everything Alchemy-specific lives behind it in `providers/alchemy/`. Public-RPC and Infura adapters cover the same surface. Code outside `providers/alchemy/` may not import from it. We do not pre-build for unannounced Alchemy products — new Alchemy capabilities, if and when they become useful, are added behind the existing `Provider` interface like any other adapter.

---

## 7. DeFi & Cross-chain

### Swap (Uniswap)
- Uniswap v3 + v4 via `@uniswap/sdk` + `@uniswap/smart-order-router`.
- Inputs: `--from`, `--to` (token symbol or address), `--amount`, `--exact in|out`, `--slippage` (bps), `--deadline` (sec), `--recipient` (defaults to sender; accepts address or ENS — useful for paying out to a different account, a Safe, or a 4337 account).
- **Slippage / impact protections** (all enforced before signing; any breach returns `E_SLIPPAGE_EXCEEDED` and refuses to sign):
  - `--slippage <bps>` — tolerance baked into `amountOutMinimum` / `amountInMaximum` (default 50 bps = 0.5%).
  - `--max-slippage <bps>` — hard cap (default 200 bps); the quote-time slippage tolerance is clamped and a value above the cap aborts.
  - `--min-out <v>` — absolute floor on output amount in destination-token units; takes precedence over the bps-based bound when stricter.
  - `--max-price-impact <bps>` — abort if the route's computed price impact exceeds this (default 300 bps). Distinct from slippage: impact is an inherent property of the route + size, slippage is mempool tolerance.
  - Policy hooks: `swap.max_slippage_bps`, `swap.max_price_impact_bps` enforce org-wide ceilings the user-supplied flags cannot exceed.
- Approvals via **Permit2** when supported, falling back to ERC-20 `approve`.
- Output of `swap quote`: route, expected out, **price impact (bps)**, **effective slippage tolerance (bps)**, **min-out enforced**, **recipient**, gas estimate, USD-denominated cost (via Chainlink).
- `swap execute` reuses the two-phase `prepare → sign → send`.

### Lending (Aave v3)
- Aave v3 Pool + UiPoolDataProvider on supported networks (Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, etc.).
- Verbs: `markets`, `position`, `supply`, `withdraw`, `borrow`, `repay`, `set-collateral`, `e-mode`.
- Inputs accept token symbol or address; amounts accept `max` for full position.
- `position` returns `{ supplies[], borrows[], netAPY, healthFactor, ltv, liquidationThreshold, availableBorrowsUSD }`.
- Approvals via Permit where the aToken/underlying supports it; otherwise standard `approve`.
- Pre-flight via `alchemy_simulateExecution`; outputs decoded effects + projected health factor after the action (the critical safety signal for borrow/withdraw).
- Policy hooks: `aave.min_health_factor_after_tx` (default 1.5) — denies any action that would drop the simulated post-tx HF below the threshold.

### Bridge (Squid Router)
- `@0xsquid/sdk` for cross-chain transfer and cross-chain swap.
- Inputs: `--from-chain`, `--to-chain`, `--from`, `--to`, `--amount`, `--recipient`, `--slippage`.
- `bridge execute` returns a `route-id` and a source-chain `tx-hash`. `bridge status` polls Squid's status API and surfaces Axelar GMP status (`source-tx-confirmed`, `gas-paid`, `executed`, `error`).

### Price (Chainlink)
- `price <symbol>` → look up feed in bundled registry `(chain, symbol) → feed address` → call `latestRoundData()` → return `{ price, decimals, updatedAt, feed }`.
- `price <0x…>` accepts a raw feed address.
- Used internally to USD-denominate gas costs and swap quotes.

---

## 8. WalletConnect

- WalletConnect v2 `@walletconnect/sign-client` embedded.
- Sessions persisted in SQLite (`wc_sessions`).
- Pairing flow:
  ```
  agent: chain wc pair wc:abc...
   → returns { session_id, dapp: { name, url, icons }, required_namespaces, optional_namespaces }
  agent: chain wc approve --session-id ... --account agent-1 --chains eip155:1,eip155:8453
   → returns { topic, accounts, chains }
  ```
- Request handling:
  - `chain wc listen --ndjson` streams one JSON object per line on stdout for every incoming `session_request`. The agent parses, decides, and either signs or rejects.
  - Each request runs through the **policy engine** before signing — same gate as direct CLI ops.
- Supported methods: `eth_sendTransaction`, `eth_signTransaction`, `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`, `wallet_addEthereumChain`.

---

## 9. Token Standards

### ERC-20
- Helpers: `transfer`, `approve` (with `--max` shorthand for `2^256-1`), `revoke` (approve 0), `allowance`, `balance`, `info` (name/symbol/decimals/totalSupply).

### ERC-721
- Helpers: `transfer` (uses `safeTransferFrom`), `mint` (when contract exposes a mint method via supplied ABI), `owner`, `tokenURI` (with IPFS gateway resolution), `balance`.

### ERC-1155
- Helpers: `transfer`, `batch-transfer`, `balance`, `uri`.

### Detection
- `supportsInterface(0x80ac58cd)` → ERC-721, `0xd9b67a26` → ERC-1155, otherwise probe ERC-20 selectors.

### Solana SPL
- `spl transfer`, `spl balance`, `spl mint` (when authority present); auto-creates Associated Token Accounts.

---

## 10. EVM Contract Deployment

- Inputs:
  - `--bytecode <file>` + `--abi <file>` + `--args …`, or
  - `--artifact <hardhat-or-foundry-output.json>` + `--args …`.
- Pre-flight:
  - Encode constructor args.
  - `alchemy_simulateExecution` against pending state.
  - Cost estimate (USD via Chainlink ETH/USD).
  - Optional `--create2 --salt 0x…` → compute and display the deterministic address before signing.
- Post-deploy:
  - Record into `deployments` table: `{address, chain, tx_hash, abi_hash, salt?, deployer, block, timestamp}`.
  - `deployments show` emits the ABI for use with `chain call`.

---

## 11. Security Model

### Key storage
- Mnemonics and private keys encrypted at rest in `~/.chainuse/keystore.db`.
- KDF: `scrypt` N=2¹⁷, r=8, p=1. Cipher: AES-256-GCM. Per-key random salt + nonce.
- Passphrase sources, in order: `--passphrase-cmd <cmd>` (executes for stdout), OS keychain (`keytar`), `CHAINUSE_PASSPHRASE` env var. Never prompts in agent mode.
- Hardware-wallet path (Ledger) for any account, selectable via `--signer ledger:<path>`.

### Policy engine
Declarative YAML, evaluated against the simulated transaction:

```yaml
version: 1
defaults:
  require_simulation: true
  max_gas_usd: 5.00
accounts:
  agent-1:
    chains: [eip155:1, eip155:8453, solana:mainnet]
    daily_value_usd: 250.00
    per_tx_value_usd: 50.00
    contracts:
      allow:
        - "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"   # USDC
        - "eip155:1/uniswap:*"
      deny:
        - "eip155:*/*:*"                                                # deny everything else
    methods:
      deny: ["selfdestruct", "delegatecall"]
    require_2fa_above_usd: 100.00
```

- Each `prepare` carries simulated effects (`asset changes`, `contracts touched`, `methods called`, `usd value`).
- The evaluator returns `allow | deny | require-confirmation`, with a list of matched rules.
- `require-confirmation` blocks `sign` until a confirmation token is supplied (e.g. via TOTP, signed challenge from a paired device, or a webhook callback).

### Audit log
- Append-only NDJSON at `~/.chainuse/audit.log`.
- One line per signing decision (allow or deny), one line per broadcast, one line per WC approval.

### Agent mode
- Activated by `CHAINUSE_AGENT=1` or `--agent`.
- Refuses to start without `--policy <file>` resolved.
- Disables all interactive prompts; all errors structured.

---

## 12. Configuration

```
~/.chainuse/
  config.yaml          # providers, default chain, accounts, daemon settings
  policy.yaml          # signing policy
  keystore.db          # encrypted keys (SQLite)
  state.db             # accounts, history, nonce cache, WC sessions, deployments
  audit.log            # append-only NDJSON
  registries/
    chainlink-feeds.json
    tokens.json                  # built-in (chain,symbol)→{address,decimals,name,logo,canonical}
  registries-user/
    tokens.json                  # user overrides + additions; takes precedence over built-in
```

### Built-in token registry

Bundled at `registries/tokens.json`, structured by chain. Minimum coverage on day one:

| Symbol | Notes |
| --- | --- |
| `USDC` | Native Circle USDC on every supported EVM chain (mainnet, Base, Arbitrum, Optimism, Polygon, Avalanche, zkSync, Linea, Scroll) and Solana mainnet (`EPjF…t1v`); `USDC.e` listed separately as bridged variant |
| `USDT` | Tether on every supported EVM chain and Solana (`Es9v…1WT`) |
| `DAI` | MakerDAO |
| `WETH` | Canonical wrapped ETH per chain |
| `WBTC`, `cbBTC` | Wrapped/Coinbase BTC variants |
| `wstETH`, `weETH`, `rETH` | Major LSTs |
| `LINK`, `UNI`, `AAVE`, `MATIC`, `ARB`, `OP` | Major governance/utility tokens |
| Natives | `ETH`, `SOL`, `SUI`, `BTC`, `MATIC` resolve to the native asset of the given chain (sentinel address `0xEeee…EEeE` on EVM) |

Resolution rules:
1. If input matches `0x…` (EVM) or a base58 SPL mint, treat as raw address.
2. Else look up `(chain, symbol)` in user registry; if found, use it.
3. Else look up `(chain, symbol)` in built-in registry.
4. If not found on the requested chain, fail with `E_UNKNOWN_TOKEN` (suggest `chain tokens add` or pass an address).
5. If `--chain` is omitted and the symbol exists on multiple configured chains, fail with `E_AMBIGUOUS_SYMBOL` (suggest `--chain`).

The registry stores `{address, decimals, name, symbol, logoURI?, canonical?: true}` so the wallet can format human-readable amounts without an extra `decimals()` call. `canonical: true` marks the issuer-blessed deployment (e.g. native Circle USDC vs. bridged `USDC.e`); the resolver prefers canonical when a symbol is ambiguous within one chain.

`config.yaml` example:
```yaml
version: 1
default_chain: eip155:1
providers:
  eip155:1:    { kind: alchemy, key_env: ALCHEMY_API_KEY }
  eip155:8453: { kind: alchemy, key_env: ALCHEMY_API_KEY }
  solana:mainnet: { kind: alchemy, key_env: ALCHEMY_API_KEY }
  bitcoin:mainnet: { kind: public-rpc, url: https://mempool.space/api }
  sui:mainnet: { kind: public-rpc, url: https://fullnode.mainnet.sui.io }
daemon:
  enabled: false
  port: 8787
  mcp: false
```

Env overrides: `ALCHEMY_API_KEY`, `CHAINUSE_PROFILE`, `CHAINUSE_PASSPHRASE`, `CHAINUSE_AGENT`, `CHAINUSE_HOME`.

---

## 13. Output Contract for Agents

### Envelope
```json
{ "ok": true,  "data":  { "...": "..." } }
{ "ok": false, "error": { "code": "E_POLICY_DENIED",
                          "message": "per_tx_value_usd exceeded",
                          "hint": "raise policy.accounts.agent-1.per_tx_value_usd or split tx",
                          "details": { "limit_usd": 50, "tx_usd": 73.21, "rule": "agent-1.per_tx" } } }
```

### Error codes (stable)
| Code | Meaning |
| --- | --- |
| `E_BAD_INPUT` | malformed flag/arg |
| `E_NOT_FOUND` | account/contract/feed/session unknown |
| `E_UNKNOWN_TOKEN` | symbol not in registry on the requested chain |
| `E_AMBIGUOUS_SYMBOL` | symbol resolves on multiple chains and `--chain` is missing |
| `E_INSUFFICIENT_FUNDS` | balance < amount + fee |
| `E_NONCE_CONFLICT` | mismatch with chain |
| `E_PROVIDER` | RPC/network/upstream error |
| `E_SIMULATION_REVERT` | simulate failed; includes revert reason |
| `E_SLIPPAGE_EXCEEDED` | swap quote breaches `--max-slippage`, `--min-out`, or `--max-price-impact` |
| `E_POLICY_DENIED` | policy refused |
| `E_POLICY_REQUIRES_2FA` | needs confirmation token |
| `E_SIGNER` | hardware/local signer error |
| `E_BROADCAST` | submitted but rejected by mempool |
| `E_TIMEOUT` | operation exceeded deadline |

### Exit codes
| Code | Class |
| --- | --- |
| 0 | ok |
| 1 | user error (bad input, not found) |
| 2 | policy denial |
| 3 | provider / network |
| 4 | signing error |
| 5 | simulation revert |
| 64 | internal bug — please report |

### Logging
- Structured logs to stderr at `info` level by default. `--log-level debug|trace` for more.
- Logs do not pollute stdout JSON.

---

## 14. Daemon Mode (Recommended for Agents)

`chain daemon start [--port 8787] [--mcp]` runs a long-lived process that:

- Holds the unlocked keystore in memory (memory-locked where supported).
- Exposes a JSON-RPC 2.0 surface mirroring the CLI verbs.
- Optionally exposes an **MCP server** (`--mcp`) so Claude / other LLM hosts can use Chainuse as a tool directly, with each verb registered as an MCP tool with a typed schema.
- Maintains an open WalletConnect socket so `wc listen` is push, not poll.
- Holds the Squid bridge status pollers.

Agents that already speak MCP get the wallet as a typed tool surface for free.

---

## 15. Milestones

> **Decided:** CLI ships first; MCP is deferred. Daemon (JSON-RPC) lands in M7, MCP adapter in M8. The `handlers/` split in M1 is what makes both later additions cheap.

| Milestone | Scope |
| --- | --- |
| **M1** | Core interfaces, **`handlers/` split**, EVM EOA, Alchemy provider, `balance`, `send`, `call`, two-phase tx, JSON envelope, basic policy |
| **M2** | ERC-20/721/1155, ENS, Chainlink price, EVM `deploy`, deployments registry |
| **M3** | Solana, BTC, Sui adapters with `keys`, `balance`, `send` parity; `chain sui ptb` PTB builder |
| **M4** | ERC-4337 (Light/Kernel/Safe via permissionless + Alchemy bundler/paymaster), ERC-7702, Safe multisig propose/confirm/execute |
| **M5** | WalletConnect v2 (pair, approve, listen, sign) with policy gate; **SIWE (EIP-4361)** build/sign/login/verify with EIP-1271 support |
| **M6** | Uniswap swap (v3+v4), Squid bridge, **Aave v3 lending** (incl. `min_health_factor_after_tx` policy), USD costing via Chainlink |
| **M7** | Policy hardening (2FA, daily caps), audit, hardware wallet, **daemon (JSON-RPC) over `handlers/`** |
| **M8** | **MCP adapter** over `handlers/` (typed tool schemas, resources, push notifications for WC + bridge status) |
| **M9 (future)** | **Nervos CKB** chain adapter (Cell model, Lumos / CCC SDK); CKB native + xUDT support |
| **M10 (future)** | **x402 provider** (HTTP 402 challenge issuer with payment verification) and **x402 consumer** (auto-pays 402 challenges using a policy-gated account) |

---

## 16. Resolved Decisions

1. **Daemon + MCP first-class?** **No.** Build CLI first. Daemon (JSON-RPC) lands in M7, MCP adapter in M8. M1 still introduces the `handlers/` split so adding them later is mechanical, not a rewrite.
2. **Testnets in default config?** **Yes.** Ship with Sepolia, Base Sepolia, Solana Devnet, Sui Testnet enabled but unprovisioned (no key) by default. Users `chain keys generate --chain ... --network testnet` to provision.
3. **Keystore policy.** Default file + passphrase; OS keychain is encouraged but optional. **Agent mode does not require keychain or hardware wallet** above any value threshold — value caps are enforced via the policy engine, not by mandatory hardware.
4. **BRC-20 / Runes / Ordinals on BTC.** **Read-only at most, and only if Alchemy exposes it.** If Alchemy has no BTC metaprotocol API, these are unsupported in v1. No sending of BRC-20 / Runes / Ordinals.
5. **Sui Move call ergonomics.** Dedicated `chain sui ptb` subcommand with an explicit PTB builder (see §5). `chain call` remains EVM-only.

---

## 17. Future Scope (Roadmap)

These are committed roadmap items, not speculative. They influence the architecture today even though implementation is deferred.

### Nervos CKB (M9)
- New `chains/ckb/` adapter. CKB uses a UTXO-like **Cell model** distinct from EVM/UTXO/Account models, so `core/Tx.ts` and `core/Asset.ts` must already accommodate non-account semantics — the existing BTC adapter validates this.
- SDK: **CCC** (`@ckb-ccc/core`) or Lumos for transaction construction; `@ckb-lumos/rpc` for node access.
- Initial verbs: `keys generate` (secp256k1, m/44'/309'/0'/0/x), `balance` (CKB native), `send`, `call` equivalent (script execution dry-run). xUDT (CKB's fungible token standard) read + transfer.
- Provider: public CKB RPC initially; Alchemy adapter if/when supported.

### x402 (M10)
[x402](https://x402.org/) is a payment protocol that uses HTTP `402 Payment Required` to negotiate on-chain micropayments inline with HTTP requests — a natural fit for AI agents paying for resources.

- **Consumer mode** (`chain x402 fetch <url> [--max-payment-usd N]`):
  - Performs the HTTP request; on `402`, parses the payment challenge (chain, asset, amount, recipient, nonce).
  - Routes the payment through the **policy engine** (`x402.max_per_request_usd`, `x402.daily_usd`, `x402.allowed_recipients`).
  - Pays via the chosen account (EOA / 4337 / Safe), retries the request with the proof header, returns the response body.
  - Library shape: `chain x402 client` exposes a JSON envelope per request; programmatic SDK bindings can wrap it.
- **Provider mode** (`chain x402 serve --port ...`):
  - Lightweight HTTP server that issues `402` challenges, verifies submitted payment proofs against the configured chain/asset/recipient, and returns a 200 + signed receipt.
  - Useful when an agent itself sells access to a tool/resource.
- Keep x402 as a separate `services/x402/` module with its own challenge schema; reuse the Tx pipeline and policy engine for actual settlement.

### Architectural impact today (CKB / x402)
- `core/Tx.ts`, `core/Asset.ts`, `core/Account.ts` must not assume the EVM account model — they already don't (BTC + Sui force this), but CKB's Cell model is the strictest test. M1 reviews of these interfaces should validate against a hypothetical CKB adapter.
- The policy engine schema reserves namespaces `aave.*`, `x402.*`, `ckb.*` so they don't need a breaking schema bump later.
- `services/` directory is the standard place for new protocol integrations — Aave, x402, future protocols all follow the same shape (handler-callable module, not coupled to CLI flags).

---

## 18. Dependency Policy (Supply-chain Defense)

A wallet is one of the highest-value supply-chain targets in software: a single malicious dependency update can ship key-exfiltration or transaction tampering to every install. Recent precedents — `event-stream`, `ua-parser-js`, the **`@solana/web3.js` v1.95.5–.7** key-stealing publish (Dec 2024), the **Ledger Connect Kit** drainer (Dec 2023), and the `xz-utils` backdoor — make permissive dependency hygiene unacceptable here. This section is a hard constraint on the project, enforced in CI and at release time.

### 18.1 Principles
1. **Minimize dependency surface.** Every transitive package is attack surface. Default answer is "vendor or write it"; adding a dep requires justification.
2. **No automatic upgrades, ever.** No Dependabot auto-merge, no `^`/`~` ranges in production lockfile, no `npm install` in CI without `--frozen-lockfile`.
3. **Cooldown before adoption.** No new package version is consumed until it has been public for **≥ 7 days** (longer for security-critical deps; see tiers).
4. **Verify provenance.** Every direct dep must publish either signed releases (Sigstore / npm provenance / GitHub attestations) or be pinned to a commit SHA from a vendored Git source.
5. **Defense in depth at runtime.** Even if a dep is malicious, runtime sandboxing limits blast radius (no network or filesystem access from packages that don't need it).
6. **Reproducible build, signed release.** Anyone can rebuild bit-for-bit from the lockfile; the published binary is signed; SBOM is published with each release.

### 18.2 Dependency tiers

| Tier | Examples | Rules |
| --- | --- | --- |
| **T0 — Cryptographic / signing** | `@noble/curves`, `@noble/hashes`, `@scure/bip32`, `@scure/bip39`, `viem`/`ethers` signing paths | Allowlist by **maintainer + commit SHA**. No `^` ranges. Updates require manual review by 2 maintainers, ≥ 30-day cooldown, diff review of changed lines. Vendored where the package is small and stable (preferred for `@noble/*`). |
| **T1 — Chain SDKs** | `@solana/web3.js`, `bitcoinjs-lib`, `@mysten/sui`, `permissionless`, `@safe-global/protocol-kit`, `@walletconnect/sign-client`, `@uniswap/sdk`, `@0xsquid/sdk`, `@aave/contract-helpers` | Pinned exact versions. ≥ 14-day cooldown. CI runs `npm audit signatures` / sigstore verify and `socket.dev` advisory check. Major-version bumps require a manual changelog review checklist (see §18.5). |
| **T2 — Tooling / build** | `bun`, `typescript`, `vitest`, linters | Pinned exact versions. ≥ 7-day cooldown. Build tools cannot be imported by runtime code (enforced by lint rule). |
| **T3 — Forbidden** | Anything under non-allowlisted scopes; packages with install scripts; packages with native (`node-gyp`) builds unless explicitly approved; deprecated packages | Hard-fail in CI. |

The full allowlist lives at `policy/dependencies.yaml` and is the source of truth.

### 18.3 Acquisition & integrity

- **Single lockfile** (`bun.lockb` + a generated `package-lock.json` for tooling that needs it) is committed and is the only source of installed versions. CI installs with `--frozen-lockfile`. Any drift fails the build.
- **No install scripts.** Set `ignore-scripts=true` (npm) and the equivalent for Bun. Postinstall scripts are the most common drainer vector (Ledger Connect Kit, multiple npm worm campaigns).
- **Subresource integrity for fetched bytes.** Anything fetched at build time (binaries, WASM, ABIs) is pinned by SHA-256 in `policy/integrity.yaml`. CI verifies before use.
- **Mirror sensitive deps.** T0 and T1 packages are mirrored into a private registry / Git submodule so a registry-side compromise (npm account takeover, registry hijack) cannot retroactively change what we install.
- **No transitive `postinstall`.** A CI step walks the resolved tree and fails if any package declares `scripts.preinstall|install|postinstall` other than an allowlisted shortlist.

### 18.4 Update workflow

```
                ┌──────────────────────────────────────────────┐
new advisory →  │ open update PR (one dep per PR)              │
or scheduled    │   ↓                                          │
sweep           │ wait for cooldown window per tier            │
                │   ↓                                          │
                │ CI: signature/provenance verify              │
                │     diff size & changed-files review         │
                │     install-script audit                     │
                │     test suite (incl. sign-and-broadcast on  │
                │     local devnet for T0/T1)                  │
                │   ↓                                          │
                │ 2-maintainer human review for T0; 1 for T1   │
                │   ↓                                          │
                │ merge → next release                         │
                └──────────────────────────────────────────────┘
```

- One dependency update per PR. No batched bumps. Reviewers must be able to read the diff.
- For T0 updates the diff is read line-by-line. Anything touching key derivation, signing, RNG, or network IO is rejected unless the change is independently corroborated upstream (issue tracker, multiple maintainers).
- The `chain` binary is **not** released between dep updates and a new audit cycle for T0 (i.e. no same-week ship of a `@noble/*` bump and a wallet release).

### 18.5 Major-version review checklist (T1)

A T1 major version (e.g. `viem 3 → 4`) requires explicit answers to all of:

1. New maintainers since last version? (check npm `who`, GitHub contributor history)
2. New transitive deps introduced? (diff `npm ls --all`)
3. Any new `postinstall`/native builds anywhere in the new tree?
4. New network endpoints, telemetry, or URLs hardcoded?
5. Any change to signing, RNG, or key-derivation code paths?
6. Sigstore / provenance attestation present and verifying?
7. Any open security advisories filed against the new version (Snyk, GHSA, socket.dev)?

A "no" on (1)–(5) and "yes" on (6)–(7) is required to merge.

### 18.6 Runtime guards

- **Permissions sandbox.** The CLI runs under Bun's `--allow-net` / `--allow-read` / `--allow-write` allowlists scoped to the configuration directory and the configured RPC hosts only. Packages cannot phone home to unknown hosts even if compromised.
- **Egress allowlist.** A small embedded HTTP client wraps all outbound requests and rejects any host not in the per-chain provider list, the WC relay list, the Squid API, or the Chainlink registry hosts. Logged and refused on violation.
- **No `eval` / `Function(...)`** — lint rule `no-implied-eval`, `no-new-func`. CI greps the resolved dep tree for `eval(`, `new Function(`, `vm.runIn*`, dynamic `require()` of computed strings, and flags any new occurrence (allowlist diff-based).
- **Frozen prototypes** for global builtins at startup (`Object.freeze(Object.prototype)` etc.) to blunt prototype-pollution payloads.
- **Keystore isolation.** All decryption and signing happens in a single module with no `require`/`import` from packages outside an explicit allowlist. Linted as a circular boundary.

### 18.7 Build & release integrity

- **Reproducible build.** `bun build --compile` from a clean container with the lockfile produces a binary whose SHA-256 is recorded in the GitHub release. A second maintainer rebuilds independently and signs off when hashes match.
- **Signed releases.** Binaries signed with **cosign / Sigstore**. The `chain self-update` command (if shipped) verifies the signature against a pinned set of release-signing keys before replacing the binary.
- **SBOM.** Each release ships a CycloneDX SBOM (`chain.sbom.json`) listing every transitive dep with version + integrity hash + license + provenance status.
- **Distribution channels are pinned.** npm package, Homebrew tap, and GitHub release. We do not publish to any other registry. The release workflow runs only from a protected branch with branch-protection + required reviews; npm publishes use a granular access token scoped to this one package, stored as an OIDC-issued short-lived token (no long-lived `NPM_TOKEN` secret).

### 18.8 CI enforcement (concrete checks, all blocking)

| Check | Tool / command | Failure mode |
| --- | --- | --- |
| Lockfile unchanged unless PR explicitly updates a dep | `bun install --frozen-lockfile` | hard fail |
| No new postinstall scripts in tree | custom script over resolved tree | hard fail |
| Provenance / signature present for changed deps | `npm audit signatures` + sigstore verify | hard fail for T0/T1 |
| Cooldown elapsed | custom check vs npm registry `time.<version>` | hard fail |
| Tier compliance (allowlist + version pin) | reads `policy/dependencies.yaml` | hard fail |
| Advisory clean | `osv-scanner`, `socket.dev` API | hard fail on critical/high |
| No `eval` / dynamic require additions | grep + diff against last release | hard fail |
| Reproducible build hash matches | rebuild in clean container, compare SHA-256 | hard fail |
| SBOM generated and attached | `cyclonedx-bun` or equivalent | hard fail if missing |

### 18.9 Incident response

If a dep we depend on is reported compromised:

1. Within 1 hour: pin to last known-good version; publish advisory in repo + release notes.
2. Revoke any credentials the build pipeline could have leaked (npm tokens, signing keys if exposure plausible).
3. Inspect telemetry / egress logs from the egress allowlist for any anomalous resolution attempts.
4. Cut a patch release with the rollback; rotate release-signing keys if compromise scope is unclear.
5. Postmortem published in repo within 7 days.

A `SECURITY.md` at the repo root documents the disclosure channel (signed email + PGP key), expected response times, and bounty scope (out of scope: anything mitigated by §18.6 sandbox alone).

---

## Appendix A — Capability → Section map

| Requirement | Section |
| --- | --- |
| Multi-chain (ETH/EVM, Solana, BTC, Sui) | §1, §3, §4 |
| Mnemonic & key management | §4, §5 (`keys *`), §11 |
| Tx signing & sending | §2, §5 (`tx *`, `send`), §11 |
| Balance reading | §5 (`balance`, `assets`), §6 |
| Smart contract state reading | §5 (`call`, `storage-get`) |
| ERC-4337 & ERC-7702 | §4, §5 (`account create`) |
| Gnosis Safe | §4, §5 (`safe *`) |
| WalletConnect | §8, §5 (`wc *`) |
| Sign In With Ethereum (EIP-4361) | §5 (`siwe *`), §11 (`siwe.allowed_domains` / `siwe.deny_domains`) |
| ERC-20/721/1155 | §9, §5 (`erc20|erc721|erc1155`) |
| USDC / USDT first-class | §5 (`usdc`, `usdt`), §12 (token registry) |
| Built-in token registry | §5 (`tokens *`), §12 (registry + resolver rules) |
| Asset & price queries | §6, §7 (`assets`, `price`) |
| ENS | §5 (`ens *`) |
| Uniswap swap | §7, §5 (`swap *`) |
| Squid cross-chain | §7, §5 (`bridge *`) |
| Aave lending | §7, §5 (`aave *`), §11 (`aave.min_health_factor_after_tx`) |
| Chainlink price | §7, §5 (`price *`) |
| EVM contract deployment | §10, §5 (`deploy`) |
| Alchemy backend (behind Provider interface) | §6 |
| Sui PTB builder | §5 (`sui ptb`) |
| Future: Nervos CKB | §17 |
| Future: x402 provider + consumer | §17 |
| AI-agent ergonomics | §2, §13, §14 |
| Supply-chain defense / dependency policy | §18 |
