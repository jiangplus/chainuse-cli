import { Command } from 'commander'
import chalk from 'chalk'
import { handleInit } from '../handlers/init.js'
import {
  handleKeysGenerate,
  handleKeysImport,
  handleKeysList,
} from '../handlers/keys.js'
import { handleBalance } from '../handlers/balance.js'
import { handleSend } from '../handlers/send.js'
import {
  handleTxPrepare,
  handleTxSign,
  handleTxSend,
  handleTxStatus,
} from '../handlers/tx.js'
import { handleCall, handleStorageGet } from '../handlers/call.js'
import { handlePolicyShow } from '../handlers/policy.js'
import {
  handleErc20Info,
  handleErc20Balance,
  handleErc20Allowance,
  handleErc20Transfer,
  handleErc20Approve,
  handleErc721Info,
  handleErc721Owner,
  handleErc721TokenURI,
  handleErc721Balance,
  handleErc721Transfer,
  handleErc1155Balance,
  handleErc1155URI,
  handleErc1155Transfer,
  handleErc1155BatchTransfer,
} from '../handlers/tokens.js'
import {
  handleEnsResolve,
  handleEnsReverse,
  handleEnsSetPrimary,
  handleEnsSetRecord,
} from '../handlers/ens.js'
import { handlePrice, handlePriceFeeds } from '../handlers/price.js'
import {
  handleDeploy,
  handleDeploymentsList,
  handleDeploymentShow,
} from '../handlers/deploy.js'
import {
  handleAccountCreate4337,
  handleAccountCreate7702,
  handleAccountList,
  handleAccountInfo,
  handleAccountSend,
} from '../handlers/account.js'
import {
  handleSafeCreate,
  handleSafeInfo,
  handleSafePropose,
  handleSafeConfirm,
  handleSafeExecute,
  handleSafeQueue,
} from '../handlers/safe.js'
import {
  printResult,
  success,
  info,
  warn,
  label,
  formatAddress,
  formatHash,
  formatStatus,
  formatTimestamp,
  bigintReplacer,
} from './format.js'
import { exitCodeFor } from '../core/errors.js'
import type { Account } from '../core/types.js'

export function buildCLI(): Command {
  const program = new Command()

  program
    .name('chain')
    .description('Chainuse — multi-chain CLI for key management, transactions, and smart contracts')
    .version('0.1.0')
    .option('--json', 'Output JSON envelope (default when not TTY)')
    .option('--human', 'Force human-readable output')

  // ─── chain init ──────────────────────────────────────────────────────────────
  program
    .command('init')
    .description('Initialize keystore, config.yaml, and policy.yaml')
    .option('--force', 'Overwrite existing config and policy files')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handleInit({ force: opts.force })
      printResult(
        result,
        (data) => {
          if (data.alreadyExisted) {
            warn('Chainuse was already initialized (--force applied)')
          } else {
            success('Chainuse initialized!')
          }
          label('Directory', data.dir)
          label('Config', data.configPath)
          label('Policy', data.policyPath)
          info('Set ALCHEMY_API_KEY and CHAINUSE_PASSPHRASE before using other commands')
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain keys ──────────────────────────────────────────────────────────────
  const keysCmd = program.command('keys').description('Manage cryptographic keys')

  keysCmd
    .command('generate')
    .description('Generate a new EOA from BIP-39 mnemonic')
    .requiredOption('--chain <chain>', 'Chain type (evm, solana, btc, sui)')
    .option('--alias <name>', 'Human-readable alias for this key')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
    .option('--network <network>', 'Network for BTC: mainnet or testnet (default: mainnet)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleKeysGenerate({
        chain: opts.chain,
        alias: opts.alias,
        passphrase: opts.passphrase,
        network: opts.network,
      })
      printResult(
        result,
        (data) => {
          success(`Key generated: ${data.alias}`)
          label('Alias', data.alias)
          label('Address', formatAddress(data.address))
          label('Chain', data.chain)
          label('Derivation path', data.derivationPath)
          if (data.mnemonic) {
            console.log()
            warn('SAVE YOUR MNEMONIC — it will NOT be shown again:')
            console.log(chalk.yellow.bold(`  ${data.mnemonic}`))
          }
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  keysCmd
    .command('import')
    .description('Import a key from mnemonic or private key')
    .requiredOption('--from <source>', 'Import source: mnemonic or privkey')
    .argument('<value>', 'The mnemonic phrase or private key hex')
    .option('--alias <name>', 'Human-readable alias')
    .option('--chain <chain>', 'Chain type (default: evm)')
    .option('--path <derivationPath>', 'BIP-44 derivation path')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
    .option('--network <network>', 'Network for BTC: mainnet or testnet (default: mainnet)')
    .action(async (value, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      if (opts.from !== 'mnemonic' && opts.from !== 'privkey') {
        console.error(chalk.red('--from must be "mnemonic" or "privkey"'))
        process.exit(1)
      }
      const result = await handleKeysImport({
        from: opts.from as 'mnemonic' | 'privkey',
        value,
        alias: opts.alias,
        chain: opts.chain,
        derivationPath: opts.path,
        passphrase: opts.passphrase,
        network: opts.network,
      })
      printResult(
        result,
        (data) => {
          success(`Key imported: ${data.alias}`)
          label('Alias', data.alias)
          label('Address', formatAddress(data.address))
          label('Chain', data.chain)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  keysCmd
    .command('list')
    .description('List all stored accounts')
    .action(async (_opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleKeysList()
      printResult(
        result,
        (data: Account[]) => {
          if (data.length === 0) {
            info('No accounts found. Run "chain keys generate --chain evm" to create one.')
            return
          }
          console.log(chalk.bold(`\n${'ALIAS'.padEnd(24)} ${'ADDRESS'.padEnd(44)} ${'CHAIN'.padEnd(8)} TYPE`))
          console.log('─'.repeat(90))
          for (const account of data) {
            console.log(
              `${chalk.cyan(account.alias.padEnd(24))} ${account.address.padEnd(44)} ${account.chain.padEnd(8)} ${account.type}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain balance ────────────────────────────────────────────────────────────
  program
    .command('balance')
    .description('Get native or ERC-20 balance')
    .argument('<address|alias>', 'Address or account alias')
    .option('--chain <id>', 'Chain ID or alias (e.g. eip155:1, mainnet, base)')
    .option('--token <addr>', 'Token: "native" or ERC-20 contract address (default: native)')
    .action(async (addressOrAlias, opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handleBalance({
        addressOrAlias,
        chain: opts.chain,
        token: opts.token,
      })
      printResult(
        result,
        (data) => {
          console.log()
          label('Address', formatAddress(data.address) + (data.alias ? ` (${data.alias})` : ''))
          label('Chain', data.chain)
          label('Asset', data.asset)
          label('Balance', `${chalk.bold(data.balance)} ${data.symbol}`)
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain send ──────────────────────────────────────────────────────────────
  program
    .command('send')
    .description('Send native tokens or assets (EVM, Solana, Bitcoin, Sui)')
    .requiredOption('--to <address>', 'Destination address')
    .requiredOption('--amount <value>', 'Amount to send (SOL, BTC, SUI, or ETH units)')
    .option('--asset <asset>', 'Asset: "native" or "ERC20:0x..." (default: native)')
    .option('--account <alias>', 'Sending account alias')
    .option('--chain <id>', 'Chain ID or alias (e.g. solana, bitcoin, sui, mainnet)')
    .option('--one-shot', 'Prepare, sign, and send in one step')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
    .option('--fee-rate <sats>', 'BTC fee rate in sats/vbyte (default: recommended halfHourFee)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handleSend({
        to: opts.to,
        amount: opts.amount,
        asset: opts.asset ?? 'native',
        account: opts.account,
        chain: opts.chain,
        oneShot: opts.oneShot,
        passphrase: opts.passphrase,
        feeRate: opts.feeRate ? parseInt(opts.feeRate, 10) : undefined,
      })
      printResult(
        result,
        (data) => {
          if (data.hash) {
            success(`Transaction sent!`)
            label('Hash', formatHash(data.hash))
          } else {
            info(data.message)
          }
          if (data.txId) label('Tx ID', data.txId)
          label('Status', formatStatus(data.status))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain tx ────────────────────────────────────────────────────────────────
  const txCmd = program.command('tx').description('Manage transactions')

  txCmd
    .command('prepare')
    .description('Build unsigned tx + gas estimate + simulation')
    .requiredOption('--to <address>', 'Destination address')
    .requiredOption('--value <amount>', 'ETH value to send (e.g. 0.01)')
    .option('--data <hex>', 'ABI-encoded calldata (0x...)')
    .option('--from <address>', 'Sender address (use --from or --account)')
    .option('--account <alias>', 'Account alias (resolves to address)')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleTxPrepare({
        to: opts.to,
        value: opts.value,
        data: opts.data,
        from: opts.from,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Transaction prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('To', formatAddress(data.to))
          label('Value', `${data.value.toString()} wei`)
          label('Gas estimate', data.gasEstimate?.toString() ?? 'n/a')
          label('Max fee/gas', data.maxFeePerGas?.toString() ?? 'n/a')
          label('Nonce', data.nonce?.toString() ?? 'n/a')
          label('Simulation', JSON.stringify(data.simulationResult))
          console.log()
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  txCmd
    .command('sign')
    .description('Sign a prepared transaction (policy-gated)')
    .requiredOption('--tx-id <id>', 'Transaction ID from tx prepare')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
    .option('--eth-price <usd>', 'ETH price in USD for policy evaluation (default: 3000)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const ethPrice = opts.ethPrice ? parseFloat(opts.ethPrice) : undefined
      const result = await handleTxSign({
        txId: opts.txId,
        passphrase: opts.passphrase,
        ethPriceUsd: ethPrice,
      })
      printResult(
        result,
        (data) => {
          success('Transaction signed')
          label('ID', data.id)
          label('Status', formatStatus(data.status))
          info(`Broadcast with: chain tx send --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  txCmd
    .command('send')
    .description('Broadcast a signed transaction')
    .requiredOption('--tx-id <id>', 'Transaction ID from tx sign')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleTxSend({ txId: opts.txId })
      printResult(
        result,
        (data) => {
          success('Transaction broadcast!')
          label('ID', data.id)
          label('Hash', formatHash(data.hash))
          label('Status', formatStatus(data.status))
          info(`Check status: chain tx status --hash ${data.hash}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  txCmd
    .command('status')
    .description('Check transaction status by hash')
    .requiredOption('--hash <address>', 'Transaction hash')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleTxStatus({ hash: opts.hash, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Hash', formatHash(data.hash))
          label('Status', formatStatus(data.status))
          if (data.blockNumber !== undefined) label('Block', data.blockNumber.toString())
          if (data.gasUsed) label('Gas used', data.gasUsed)
          if (data.effectiveGasPrice) label('Effective gas price', data.effectiveGasPrice)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain call ───────────────────────────────────────────────────────────────
  program
    .command('call')
    .description('Call a contract method (eth_call, read-only)')
    .argument('<contract>', 'Contract address')
    .argument('<method>', 'Method name or signature e.g. "balanceOf(address)"')
    .argument('[args...]', 'Method arguments')
    .option('--abi <file>', 'Path to ABI JSON file')
    .option('--from <address>', 'Caller address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (contract, method, args, opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handleCall({
        contract,
        method,
        args,
        abiFile: opts.abi,
        from: opts.from,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Contract', formatAddress(data.contract))
          label('Method', data.method)
          const val = typeof data.result === 'bigint'
            ? data.result.toString()
            : JSON.stringify(data.result, bigintReplacer)
          label('Result', val)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain storage-get ────────────────────────────────────────────────────────
  program
    .command('storage-get')
    .description('Read raw storage slot (eth_getStorageAt)')
    .argument('<contract>', 'Contract address')
    .argument('<slot>', 'Storage slot (decimal or 0x hex)')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (contract, slot, opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handleStorageGet({ contract, slot, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Contract', formatAddress(data.contract))
          label('Slot', data.slot)
          label('Value', data.value)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain policy ─────────────────────────────────────────────────────────────
  const policyCmd = program.command('policy').description('Manage signing policy')

  policyCmd
    .command('show')
    .description('Print the current policy configuration')
    .action(async (_opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handlePolicyShow()
      printResult(
        result,
        (data) => {
          console.log()
          console.log(chalk.bold('Policy Configuration:'))
          label('Version', data.version.toString())
          label('Require simulation', data.defaults.require_simulation.toString())
          label('Max gas (USD)', `$${data.defaults.max_gas_usd.toFixed(2)}`)
          label('Max value/tx (USD)', `$${data.defaults.max_value_per_tx_usd.toFixed(2)}`)
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain erc20 ─────────────────────────────────────────────────────────────
  const erc20Cmd = program.command('erc20').description('ERC-20 token operations')

  erc20Cmd
    .command('info')
    .description('Get ERC-20 token metadata')
    .requiredOption('--token <addr>', 'Token contract address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc20Info({ token: opts.token, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Name', data.name)
          label('Symbol', data.symbol)
          label('Decimals', data.decimals.toString())
          label('Total Supply', data.totalSupply.toString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc20Cmd
    .command('balance')
    .description('Get ERC-20 token balance')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--address <addr>', 'Account address to check')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc20Balance({ token: opts.token, address: opts.address, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Address', formatAddress(data.address))
          label('Token', formatAddress(data.token))
          label('Balance', `${chalk.bold(data.formatted)} ${data.symbol}`)
          label('Decimals', data.decimals.toString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc20Cmd
    .command('allowance')
    .description('Get ERC-20 allowance')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--owner <addr>', 'Token owner address')
    .requiredOption('--spender <addr>', 'Approved spender address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc20Allowance({
        token: opts.token,
        owner: opts.owner,
        spender: opts.spender,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('Owner', formatAddress(data.owner))
          label('Spender', formatAddress(data.spender))
          label('Allowance', chalk.bold(data.formatted))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc20Cmd
    .command('transfer')
    .description('Transfer ERC-20 tokens (prepares tx)')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--to <addr>', 'Recipient address')
    .requiredOption('--amount <value>', 'Amount in token units')
    .option('--account <alias>', 'Sender account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc20Transfer({
        token: opts.token,
        to: opts.to,
        amount: opts.amount,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('ERC-20 transfer prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('Token', formatAddress(data.to))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc20Cmd
    .command('approve')
    .description('Approve ERC-20 spender (prepares tx)')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--spender <addr>', 'Address to approve')
    .requiredOption('--amount <value>', 'Amount to approve (or "max")')
    .option('--account <alias>', 'Owner account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc20Approve({
        token: opts.token,
        spender: opts.spender,
        amount: opts.amount,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('ERC-20 approve prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('Token', formatAddress(data.to))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain erc721 ─────────────────────────────────────────────────────────────
  const erc721Cmd = program.command('erc721').description('ERC-721 NFT operations')

  erc721Cmd
    .command('info')
    .description('Get ERC-721 collection metadata')
    .requiredOption('--token <addr>', 'Token contract address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc721Info({ token: opts.token, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Name', data.name)
          label('Symbol', data.symbol)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc721Cmd
    .command('owner')
    .description('Get ERC-721 token owner')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--token-id <n>', 'Token ID')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc721Owner({
        token: opts.token,
        tokenId: opts.tokenId,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('Token ID', data.tokenId)
          label('Owner', formatAddress(data.owner))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc721Cmd
    .command('token-uri')
    .description('Get ERC-721 token URI')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--token-id <n>', 'Token ID')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc721TokenURI({
        token: opts.token,
        tokenId: opts.tokenId,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('Token ID', data.tokenId)
          label('URI', data.uri)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc721Cmd
    .command('balance')
    .description('Get ERC-721 token count for an address')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--address <addr>', 'Account address to check')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc721Balance({
        token: opts.token,
        address: opts.address,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('Address', formatAddress(data.address))
          label('Balance', data.balance.toString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc721Cmd
    .command('transfer')
    .description('Transfer ERC-721 token (prepares tx)')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--to <addr>', 'Recipient address')
    .requiredOption('--token-id <n>', 'Token ID')
    .option('--account <alias>', 'Sender account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc721Transfer({
        token: opts.token,
        to: opts.to,
        tokenId: opts.tokenId,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('ERC-721 transfer prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('Token', formatAddress(data.to))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain erc1155 ────────────────────────────────────────────────────────────
  const erc1155Cmd = program.command('erc1155').description('ERC-1155 multi-token operations')

  erc1155Cmd
    .command('balance')
    .description('Get ERC-1155 token balance')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--id <n>', 'Token ID')
    .requiredOption('--address <addr>', 'Account address to check')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc1155Balance({
        token: opts.token,
        id: opts.id,
        address: opts.address,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('ID', data.id)
          label('Address', formatAddress(data.address))
          label('Balance', data.balance.toString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc1155Cmd
    .command('uri')
    .description('Get ERC-1155 token URI')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--id <n>', 'Token ID')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc1155URI({
        token: opts.token,
        id: opts.id,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          label('Token', formatAddress(data.token))
          label('ID', data.id)
          label('URI', data.uri)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc1155Cmd
    .command('transfer')
    .description('Transfer ERC-1155 tokens (prepares tx)')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--to <addr>', 'Recipient address')
    .requiredOption('--id <n>', 'Token ID')
    .requiredOption('--amount <n>', 'Amount to transfer')
    .option('--account <alias>', 'Sender account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleErc1155Transfer({
        token: opts.token,
        to: opts.to,
        id: opts.id,
        amount: opts.amount,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('ERC-1155 transfer prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('Token', formatAddress(data.to))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  erc1155Cmd
    .command('batch-transfer')
    .description('Batch transfer ERC-1155 tokens (prepares tx)')
    .requiredOption('--token <addr>', 'Token contract address')
    .requiredOption('--to <addr>', 'Recipient address')
    .requiredOption('--ids <n,n,...>', 'Comma-separated token IDs')
    .requiredOption('--amounts <n,n,...>', 'Comma-separated amounts')
    .option('--account <alias>', 'Sender account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const ids = (opts.ids as string).split(',').map((s: string) => s.trim())
      const amounts = (opts.amounts as string).split(',').map((s: string) => s.trim())
      const result = await handleErc1155BatchTransfer({
        token: opts.token,
        to: opts.to,
        ids,
        amounts,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('ERC-1155 batch transfer prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          label('Token', formatAddress(data.to))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain ens ───────────────────────────────────────────────────────────────
  const ensCmd = program.command('ens').description('ENS name resolution and management')

  ensCmd
    .command('resolve')
    .description('Resolve ENS name to address')
    .argument('<name>', 'ENS name (e.g. vitalik.eth)')
    .option('--chain <id>', 'Chain ID or alias (mainnet only)')
    .action(async (name, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleEnsResolve({ name, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Name', data.name)
          label('Normalized', data.normalizedName)
          label('Address', data.address ? formatAddress(data.address) : chalk.dim('not found'))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  ensCmd
    .command('reverse')
    .description('Reverse resolve address to ENS name')
    .argument('<address>', 'Ethereum address')
    .option('--chain <id>', 'Chain ID or alias (mainnet only)')
    .action(async (address, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleEnsReverse({ address, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Address', formatAddress(data.address))
          label('Name', data.name ?? chalk.dim('no reverse record'))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  ensCmd
    .command('set-primary')
    .description('Set primary ENS name for account (prepares tx)')
    .argument('<name>', 'ENS name to set as primary')
    .requiredOption('--account <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias (mainnet only)')
    .action(async (name, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleEnsSetPrimary({ name, account: opts.account, chain: opts.chain })
      printResult(
        result,
        (data) => {
          success('ENS set-primary prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  ensCmd
    .command('set-record')
    .description('Set ENS text record (prepares tx)')
    .argument('<name>', 'ENS name')
    .argument('<key>', 'Record key (e.g. "url", "email")')
    .argument('<value>', 'Record value')
    .requiredOption('--account <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias (mainnet only)')
    .action(async (name, key, value, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleEnsSetRecord({ name, key, value, account: opts.account, chain: opts.chain })
      printResult(
        result,
        (data) => {
          success('ENS set-record prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain price ──────────────────────────────────────────────────────────────
  const priceCmd = program.command('price').description('Chainlink price feed queries')

  priceCmd
    .command('feeds')
    .description('List available Chainlink price feeds for a chain')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handlePriceFeeds({ chain: opts.chain })
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No registered feeds for this chain. Use a raw 0x address.')
            return
          }
          console.log(chalk.bold(`\n${'PAIR'.padEnd(16)} ${'FEED ADDRESS'.padEnd(44)} CHAIN`))
          console.log('─'.repeat(80))
          for (const f of data) {
            console.log(`${chalk.cyan(f.pair.padEnd(16))} ${f.feed.padEnd(44)} ${f.chain}`)
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // `chain price <feed>` — positional argument
  priceCmd
    .argument('<feed>', 'Price pair (ETH/USD) or feed address (0x...)')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (feed, opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handlePrice({ feed, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Pair', data.description)
          label('Price', chalk.bold(data.price))
          label('Decimals', data.decimals.toString())
          label('Updated at', new Date(data.updatedAt * 1000).toISOString())
          label('Chain', data.chain)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain deploy ─────────────────────────────────────────────────────────────
  program
    .command('deploy')
    .description('Deploy a smart contract (prepares tx)')
    .option('--bytecode <file>', 'Path to bytecode file (.bin or .hex)')
    .option('--abi <file>', 'Path to ABI JSON file')
    .option('--artifact <file>', 'Path to Hardhat/Foundry artifact JSON')
    .option('--args <v,v,...>', 'Comma-separated constructor arguments')
    .option('--salt <address>', 'Salt for CREATE2 deterministic deployment')
    .requiredOption('--account <alias>', 'Deployer account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const args = opts.args
        ? (opts.args as string).split(',').map((s: string) => s.trim())
        : undefined
      const result = await handleDeploy({
        bytecodeFile: opts.bytecode,
        abiFile: opts.abi,
        artifactFile: opts.artifact,
        args,
        salt: opts.salt,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Deploy transaction prepared')
          label('ID', data.id)
          label('From', formatAddress(data.from))
          if (data.contractAddress) {
            label('Contract Address', formatAddress(data.contractAddress))
            info('(CREATE2 — address is deterministic)')
          }
          label('Gas estimate', data.gasEstimate?.toString() ?? 'n/a')
          info(`Sign with: chain tx sign --tx-id ${data.id}`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain deployments ────────────────────────────────────────────────────────
  const deploymentsCmd = program.command('deployments').description('Manage deployment registry')

  deploymentsCmd
    .command('list')
    .description('List recorded deployments')
    .option('--chain <id>', 'Filter by chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleDeploymentsList({ chain: opts.chain })
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No deployments recorded yet.')
            return
          }
          console.log(chalk.bold(`\n${'ADDRESS'.padEnd(44)} ${'CHAIN'.padEnd(16)} DEPLOYER`))
          console.log('─'.repeat(100))
          for (const d of data) {
            console.log(
              `${chalk.cyan(d.address.padEnd(44))} ${d.chainId.padEnd(16)} ${d.deployer ?? chalk.dim('unknown')}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  deploymentsCmd
    .command('show')
    .description('Show deployment details')
    .requiredOption('--address <address>', 'Contract address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleDeploymentShow({ address: opts.address, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Address', formatAddress(data.address))
          label('Chain', data.chainId)
          if (data.txHash) label('Tx Hash', formatHash(data.txHash))
          if (data.salt) label('Salt', data.salt)
          if (data.deployer) label('Deployer', formatAddress(data.deployer))
          if (data.bytecodeHash) label('Bytecode hash', data.bytecodeHash)
          if (data.createdAt) label('Created at', new Date(data.createdAt).toISOString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain account ───────────────────────────────────────────────────────────
  const accountCmd = program.command('account').description('Manage smart accounts (ERC-4337, ERC-7702)')

  const accountCreateCmd = accountCmd.command('create').description('Create a new smart account')

  accountCreateCmd
    .requiredOption('--type <type>', 'Account type: 4337 or 7702')
    .requiredOption('--owner <alias>', 'EOA owner alias')
    .option('--factory <factory>', 'For 4337: factory type simple|safe (default: simple)')
    .option('--delegate <address>', 'For 7702: implementation contract address')
    .option('--alias <name>', 'Human-readable alias for the smart account')
    .option('--paymaster-policy <id>', 'Alchemy Gas Manager policy ID (for 4337)')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      if (opts.type === '4337') {
        const result = await handleAccountCreate4337({
          ownerAlias: opts.owner,
          factory: opts.factory ?? 'simple',
          alias: opts.alias,
          paymasterPolicy: opts.paymasterPolicy,
          chain: opts.chain,
        })
        printResult(
          result,
          (data) => {
            success(`ERC-4337 smart account created: ${data.alias}`)
            label('Alias', data.alias)
            label('Address', formatAddress(data.address))
            label('Type', data.type)
            label('Owner', data.owner)
            label('Factory', data.factory)
          },
          parentOpts
        )
        if (!result.ok) process.exit(exitCodeFor(result.error.code))
      } else if (opts.type === '7702') {
        if (!opts.delegate) {
          console.error(chalk.red('--delegate is required for --type 7702'))
          process.exit(1)
        }
        const result = await handleAccountCreate7702({
          ownerAlias: opts.owner,
          delegateAddress: opts.delegate,
          alias: opts.alias,
          chain: opts.chain,
        })
        printResult(
          result,
          (data) => {
            success(`ERC-7702 delegated account created: ${data.alias}`)
            label('Alias', data.alias)
            label('Address', formatAddress(data.address))
            label('Type', data.type)
            label('Owner', data.owner)
            label('Delegate', formatAddress(data.delegate))
          },
          parentOpts
        )
        if (!result.ok) process.exit(exitCodeFor(result.error.code))
      } else {
        console.error(chalk.red(`Unknown account type: ${opts.type}. Use 4337 or 7702`))
        process.exit(1)
      }
    })

  accountCmd
    .command('list')
    .description('List all smart accounts')
    .option('--chain <id>', 'Filter by chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAccountList({ chain: opts.chain })
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No smart accounts found. Run "chain account create" to create one.')
            return
          }
          console.log(chalk.bold(`\n${'ALIAS'.padEnd(28)} ${'ADDRESS'.padEnd(44)} ${'TYPE'.padEnd(6)} ${'CHAIN'.padEnd(16)} OWNER`))
          console.log('─'.repeat(115))
          for (const acct of data) {
            console.log(
              `${chalk.cyan(acct.alias.padEnd(28))} ${acct.address.padEnd(44)} ${acct.type.padEnd(6)} ${acct.chainId.padEnd(16)} ${acct.ownerAlias}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  accountCmd
    .command('info')
    .description('Show smart account details')
    .requiredOption('--alias <name>', 'Smart account alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAccountInfo({ alias: opts.alias })
      printResult(
        result,
        (data) => {
          label('Alias', data.alias)
          label('Type', data.type)
          label('Address', formatAddress(data.address))
          label('Chain', data.chainId)
          label('Owner', data.ownerAlias)
          if (data.factory) label('Factory', data.factory)
          if (data.delegate) label('Delegate', formatAddress(data.delegate))
          if (data.paymasterPolicy) label('Paymaster policy', data.paymasterPolicy)
          label('Created', formatTimestamp(data.createdAt))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  accountCmd
    .command('send')
    .description('Send from a smart account (4337: UserOperation, 7702: delegated tx)')
    .requiredOption('--account <alias>', 'Smart account alias')
    .requiredOption('--to <addr>', 'Destination address')
    .requiredOption('--amount <v>', 'Amount to send')
    .requiredOption('--asset <asset>', 'Asset: "native" or "ERC20:0x..."')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--paymaster-policy <id>', 'Alchemy Gas Manager policy ID')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAccountSend({
        alias: opts.account,
        to: opts.to,
        amount: opts.amount,
        asset: opts.asset,
        chain: opts.chain,
        paymasterPolicy: opts.paymasterPolicy,
      })
      printResult(
        result,
        (data) => {
          success('Send completed')
          label('Hash', formatHash(data.hash))
          label('Type', data.type)
          if (data.userOpHash) label('UserOp hash', data.userOpHash)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain safe ───────────────────────────────────────────────────────────────
  const safeCmd = program.command('safe').description('Gnosis Safe multisig operations')

  safeCmd
    .command('create')
    .description('Deploy a new Gnosis Safe')
    .requiredOption('--owners <addr,addr,...>', 'Comma-separated owner addresses')
    .requiredOption('--threshold <n>', 'Signature threshold', parseInt)
    .requiredOption('--account <alias>', 'Deployer account alias')
    .option('--salt <nonce>', 'Salt nonce for deterministic address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const owners = (opts.owners as string).split(',').map((s: string) => s.trim())
      const result = await handleSafeCreate({
        owners,
        threshold: opts.threshold,
        account: opts.account,
        saltNonce: opts.salt,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Safe created/predicted')
          label('Address', formatAddress(data.address))
          label('Threshold', `${data.threshold}/${data.owners.length}`)
          label('Owners', data.owners.join(', '))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  safeCmd
    .command('info')
    .description('Show Safe information')
    .requiredOption('--address <address>', 'Safe address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSafeInfo({ address: opts.address, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Address', formatAddress(data.address))
          label('Version', data.version)
          label('Threshold', `${data.threshold}/${data.owners.length}`)
          label('Owners', data.owners.join(', '))
          label('Nonce', data.nonce.toString())
          label('Balance', `${data.balance} wei`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  safeCmd
    .command('propose')
    .description('Propose and sign a Safe transaction')
    .requiredOption('--address <address>', 'Safe address')
    .requiredOption('--to <addr>', 'Transaction destination')
    .option('--value <v>', 'ETH value in wei (default: 0)')
    .option('--data <hex>', 'Calldata (default: 0x)')
    .requiredOption('--account <alias>', 'Signer account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSafePropose({
        safeAddress: opts.address,
        to: opts.to,
        value: opts.value,
        data: opts.data,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Safe transaction proposed')
          label('Safe TX Hash', formatHash(data.safeTxHash))
          info(`Confirm with: chain safe confirm --tx-hash ${data.safeTxHash} --account <alias>`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  safeCmd
    .command('confirm')
    .description('Add a signature to a proposed Safe transaction')
    .requiredOption('--tx-hash <safeTxHash>', 'Safe transaction hash')
    .requiredOption('--account <alias>', 'Signer account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSafeConfirm({
        safeTxHash: opts.txHash,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Signature added')
          label('Safe TX Hash', formatHash(data.safeTxHash))
          label('Signatures collected', data.signaturesCollected.toString())
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  safeCmd
    .command('execute')
    .description('Execute a Safe transaction (threshold must be met)')
    .requiredOption('--tx-hash <safeTxHash>', 'Safe transaction hash')
    .requiredOption('--account <alias>', 'Executor account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSafeExecute({
        safeTxHash: opts.txHash,
        account: opts.account,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Safe transaction executed!')
          label('Tx Hash', formatHash(data.txHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  safeCmd
    .command('queue')
    .description('List pending Safe transactions')
    .requiredOption('--address <address>', 'Safe address')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSafeQueue({ address: opts.address, chain: opts.chain })
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No pending Safe transactions.')
            return
          }
          console.log(chalk.bold(`\n${'SAFE TX HASH'.padEnd(68)} ${'TO'.padEnd(44)} ${'VALUE'.padEnd(20)} SIGS`))
          console.log('─'.repeat(145))
          for (const tx of data) {
            const sigs = `${tx.confirmations}/${tx.threshold}`
            console.log(
              `${chalk.magenta(tx.safeTxHash.padEnd(68))} ${tx.to.padEnd(44)} ${tx.value.padEnd(20)} ${sigs}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  return program
}
