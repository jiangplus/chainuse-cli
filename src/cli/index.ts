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
    .requiredOption('--chain <chain>', 'Chain type (evm)')
    .option('--alias <name>', 'Human-readable alias for this key')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleKeysGenerate({
        chain: opts.chain,
        alias: opts.alias,
        passphrase: opts.passphrase,
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
    .description('Send native ETH or ERC-20 tokens (two-phase or one-shot)')
    .requiredOption('--to <address>', 'Destination address')
    .requiredOption('--amount <value>', 'Amount to send (in ETH or token units)')
    .option('--asset <asset>', 'Asset: "native" or "ERC20:0x..." (default: native)')
    .option('--account <alias>', 'Sending account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--one-shot', 'Prepare, sign, and send in one step')
    .option('--passphrase <pass>', 'Encryption passphrase (or set CHAINUSE_PASSPHRASE)')
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
    .requiredOption('--hash <0x...>', 'Transaction hash')
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

  return program
}
