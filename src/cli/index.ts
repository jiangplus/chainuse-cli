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
  handleSwapQuote,
  handleSwapExecute,
  handleBridgeQuote,
  handleBridgeStatus,
} from '../handlers/swap.js'
import {
  handleAaveAccount,
  handleAaveReserve,
  handleAaveSupply,
  handleAaveWithdraw,
  handleAaveBorrow,
  handleAaveRepay,
} from '../handlers/aave.js'
import {
  handleWcPair,
  handleWcApprove,
  handleWcReject,
  handleWcSessions,
  handleWcDisconnect,
  handleWcPending,
  handleWcSign,
} from '../handlers/wc.js'
import {
  handleSiweBuild,
  handleSiweSign,
  handleSiweVerify,
  handleSiweLogin,
} from '../handlers/siwe.js'
import {
  handleLedgerAddress,
  handleLedgerList,
  handleLedgerSign,
} from '../handlers/ledger.js'
import { startDaemon } from '../services/daemon.js'
import { startMcpStdio, startMcpHttp } from '../services/mcp.js'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { getPolicyPath } from '../config/index.js'
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
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleTxSign({
        txId: opts.txId,
        passphrase: opts.passphrase,
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

  // ─── chain swap ────────────────────────────────────────────────────────────

  const swapCmd = program.command('swap').description('Uniswap V4 token swaps')

  swapCmd
    .command('quote')
    .description('Get a Uniswap V4 swap quote')
    .requiredOption('--from <token>', 'Input token symbol or address (e.g. USDC or 0x...)')
    .requiredOption('--to <token>', 'Output token symbol or address')
    .requiredOption('--amount <amount>', 'Input amount (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias (used as default recipient)')
    .option('--recipient <address>', 'Custom recipient address')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--slippage-bps <bps>', 'Slippage tolerance in basis points (default: 50 = 0.5%)', (v) => Number(v))
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSwapQuote({
        from: opts.from,
        to: opts.to,
        amount: opts.amount,
        ownerAlias: opts.owner,
        recipient: opts.recipient,
        chain: opts.chain,
        slippageBps: opts.slippageBps,
      })
      printResult(
        result,
        (data) => {
          success(`Swap quote: ${data.amountIn} ${opts.from} → ${data.amountOut} ${opts.to}`)
          label('Route', data.route)
          label('Amount In', data.amountIn)
          label('Amount Out', data.amountOut)
          label('Min Out', data.amountOutMinimum)
          label('Fee Tier', `${data.fee / 10000}%`)
          label('Slippage', `${data.slippageBps / 100}%`)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  swapCmd
    .command('execute')
    .description('Execute a Uniswap V4 swap')
    .requiredOption('--from <token>', 'Input token symbol or address')
    .requiredOption('--to <token>', 'Output token symbol or address')
    .requiredOption('--amount <amount>', 'Input amount (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--recipient <address>', 'Custom recipient address')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--slippage-bps <bps>', 'Slippage tolerance in basis points (default: 50)', (v) => Number(v))
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSwapExecute({
        from: opts.from,
        to: opts.to,
        amount: opts.amount,
        ownerAlias: opts.owner,
        recipient: opts.recipient,
        chain: opts.chain,
        slippageBps: opts.slippageBps,
      })
      printResult(
        result,
        (data) => {
          success('Swap executed')
          label('Tx Hash', formatHash(data.hash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain bridge ──────────────────────────────────────────────────────────

  const bridgeCmd = program.command('bridge').description('Cross-chain bridging via Squid Router')

  bridgeCmd
    .command('quote')
    .description('Get a cross-chain bridge quote')
    .requiredOption('--from-chain <id>', 'Source chain ID or alias')
    .requiredOption('--to-chain <id>', 'Destination chain ID or alias')
    .requiredOption('--from-token <token>', 'Source token symbol or address')
    .requiredOption('--to-token <token>', 'Destination token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to bridge (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--to-address <address>', 'Custom destination address')
    .option('--slippage-bps <bps>', 'Slippage tolerance in basis points (default: 50)', (v) => Number(v))
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleBridgeQuote({
        fromChain: opts.fromChain,
        toChain: opts.toChain,
        fromToken: opts.fromToken,
        toToken: opts.toToken,
        amount: opts.amount,
        ownerAlias: opts.owner,
        toAddress: opts.toAddress,
        slippageBps: opts.slippageBps,
      })
      printResult(
        result,
        (data) => {
          success(`Bridge quote: ${data.fromAmount} ${data.fromToken} → ${data.toAmount} ${data.toToken}`)
          label('From', `${data.fromChain} → ${data.toChain}`)
          label('Amount Out', data.toAmount)
          label('Min Amount Out', data.toAmountMinimum)
          label('Estimated Time', `${data.estimatedTimeSeconds}s`)
          if (data.feeCosts.length > 0) {
            label('Fees', data.feeCosts.map((f) => `${f.amount} ${f.token} (${f.name})`).join(', '))
          }
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  bridgeCmd
    .command('status')
    .description('Check cross-chain bridge transaction status')
    .requiredOption('--tx-hash <hash>', 'Source chain transaction hash')
    .requiredOption('--from-chain <id>', 'Source chain ID or alias')
    .requiredOption('--to-chain <id>', 'Destination chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleBridgeStatus({
        txHash: opts.txHash,
        fromChain: opts.fromChain,
        toChain: opts.toChain,
      })
      printResult(
        result,
        (data) => {
          label('Status', formatStatus(data.status))
          if (data.toChainTxHash) label('Destination Tx', formatHash(data.toChainTxHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain aave ────────────────────────────────────────────────────────────

  const aaveCmd = program.command('aave').description('Aave V3 lending and borrowing')

  aaveCmd
    .command('account')
    .description('Show Aave V3 account health and positions')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveAccount({ ownerAlias: opts.owner, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Total Collateral (USD)', data.totalCollateralUsd)
          label('Total Debt (USD)', data.totalDebtUsd)
          label('Available Borrows (USD)', data.availableBorrowsUsd)
          label('Liquidation Threshold', data.currentLiquidationThreshold)
          label('LTV', data.ltv)
          label('Health Factor', data.healthFactor)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  aaveCmd
    .command('reserve')
    .description('Show Aave V3 reserve position for a specific asset')
    .requiredOption('--asset <token>', 'Token symbol or address')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveReserve({ asset: opts.asset, ownerAlias: opts.owner, chain: opts.chain })
      printResult(
        result,
        (data) => {
          label('Asset', data.asset)
          label('Supplied (aToken)', data.currentATokenBalance)
          label('Variable Debt', data.currentVariableDebt)
          label('Stable Debt', data.currentStableDebt)
          label('Supply APY', data.liquidityRate)
          label('Used as Collateral', data.usageAsCollateralEnabled ? 'Yes' : 'No')
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  aaveCmd
    .command('supply')
    .description('Supply assets to Aave V3')
    .requiredOption('--asset <token>', 'Token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to supply (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveSupply({ asset: opts.asset, amount: opts.amount, ownerAlias: opts.owner, chain: opts.chain })
      printResult(
        result,
        (data) => {
          success('Aave V3 supply completed')
          label('Approve Tx', formatHash(data.approveTxHash))
          label('Supply Tx', formatHash(data.supplyTxHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  aaveCmd
    .command('withdraw')
    .description('Withdraw supplied assets from Aave V3')
    .requiredOption('--asset <token>', 'Token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to withdraw (use "max" for full withdrawal)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--to <address>', 'Recipient address (default: owner)')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveWithdraw({ asset: opts.asset, amount: opts.amount, ownerAlias: opts.owner, to: opts.to, chain: opts.chain })
      printResult(
        result,
        (data) => {
          success('Aave V3 withdrawal completed')
          label('Tx Hash', formatHash(data.txHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  aaveCmd
    .command('borrow')
    .description('Borrow assets from Aave V3')
    .requiredOption('--asset <token>', 'Token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to borrow (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--rate-mode <1|2>', 'Interest rate mode: 1=stable, 2=variable (default: 2)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveBorrow({
        asset: opts.asset,
        amount: opts.amount,
        ownerAlias: opts.owner,
        chain: opts.chain,
        interestRateMode: opts.rateMode as '1' | '2' | undefined,
      })
      printResult(
        result,
        (data) => {
          success('Aave V3 borrow completed')
          label('Tx Hash', formatHash(data.txHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  aaveCmd
    .command('repay')
    .description('Repay borrowed assets to Aave V3')
    .requiredOption('--asset <token>', 'Token symbol or address')
    .requiredOption('--amount <amount>', 'Amount to repay (human-readable)')
    .requiredOption('--owner <alias>', 'Account alias')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--rate-mode <1|2>', 'Interest rate mode: 1=stable, 2=variable (default: 2)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleAaveRepay({
        asset: opts.asset,
        amount: opts.amount,
        ownerAlias: opts.owner,
        chain: opts.chain,
        interestRateMode: opts.rateMode as '1' | '2' | undefined,
      })
      printResult(
        result,
        (data) => {
          success('Aave V3 repay completed')
          label('Approve Tx', formatHash(data.approveTxHash))
          label('Repay Tx', formatHash(data.repayTxHash))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain wc ──────────────────────────────────────────────────────────────

  const wcCmd = program.command('wc').description('WalletConnect v2 session management')

  wcCmd
    .command('pair')
    .description('Pair with a dApp using a WalletConnect URI')
    .requiredOption('--uri <uri>', 'WalletConnect pairing URI (wc:...)')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcPair({ uri: opts.uri })
      printResult(
        result,
        (data) => {
          success(`Paired with: ${data.peerName}`)
          label('Pairing Topic', data.pairingTopic)
          if (data.peerUrl) label('dApp URL', data.peerUrl)
          label('Required Chains', data.requiredChains.join(', '))
          label('Required Methods', data.requiredMethods.join(', '))
          if (data.optionalChains?.length) label('Optional Chains', data.optionalChains.join(', '))
          info('\nRun "chain wc approve --pairing-topic <topic> --owner <alias>" to approve')
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('approve')
    .description('Approve a WalletConnect session proposal')
    .requiredOption('--pairing-topic <topic>', 'Pairing topic from wc pair')
    .requiredOption('--owner <alias>', 'Account alias to connect')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcApprove({
        pairingTopic: opts.pairingTopic,
        ownerAlias: opts.owner,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success(`Session approved with: ${data.peerName}`)
          label('Session Topic', data.sessionTopic)
          label('Accounts', data.accounts.join(', '))
          label('Chains', data.chains.join(', '))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('reject')
    .description('Reject a WalletConnect session proposal')
    .requiredOption('--pairing-topic <topic>', 'Pairing topic from wc pair')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcReject({ pairingTopic: opts.pairingTopic })
      printResult(
        result,
        () => { success('Session proposal rejected') },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('sessions')
    .description('List active WalletConnect sessions')
    .action(async (_opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcSessions()
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No active WalletConnect sessions. Run "chain wc pair" to connect.')
            return
          }
          console.log(chalk.bold(`\n${'TOPIC'.padEnd(68)} ${'PEER'.padEnd(32)} CHAINS`))
          console.log('─'.repeat(130))
          for (const s of data) {
            console.log(
              `${chalk.magenta(s.topic.substring(0, 66).padEnd(68))} ${s.peerName.padEnd(32)} ${s.chains.join(',')}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('disconnect')
    .description('Disconnect a WalletConnect session')
    .requiredOption('--topic <topic>', 'Session topic')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcDisconnect({ topic: opts.topic })
      printResult(
        result,
        () => { success('Session disconnected') },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('pending')
    .description('List pending incoming WalletConnect signature requests')
    .action(async (_opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcPending()
      printResult(
        result,
        (data) => {
          if (data.length === 0) {
            info('No pending WalletConnect requests.')
            return
          }
          console.log(chalk.bold(`\n${'ID'.padEnd(20)} ${'METHOD'.padEnd(30)} TOPIC`))
          console.log('─'.repeat(100))
          for (const p of data) {
            console.log(
              `${p.id.padEnd(20)} ${p.method.padEnd(30)} ${p.topic.substring(0, 40)}`
            )
          }
          console.log()
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  wcCmd
    .command('sign')
    .description('Sign a pending WalletConnect request')
    .requiredOption('--request-id <id>', 'Request ID from wc pending')
    .requiredOption('--owner <alias>', 'Account alias to sign with')
    .option('--chain <id>', 'Chain ID or alias')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleWcSign({
        requestId: opts.requestId,
        ownerAlias: opts.owner,
        chain: opts.chain,
      })
      printResult(
        result,
        (data) => {
          success('Request signed and responded to dApp')
          label('Result', data.result)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain siwe ────────────────────────────────────────────────────────────

  const siweCmd = program.command('siwe').description('Sign In With Ethereum (EIP-4361)')

  siweCmd
    .command('build')
    .description('Build a SIWE message (EIP-4361) without signing')
    .requiredOption('--domain <domain>', 'Service domain (e.g. app.example.com)')
    .requiredOption('--owner <alias>', 'Account alias')
    .requiredOption('--uri <uri>', 'URI of the service (e.g. https://app.example.com/login)')
    .option('--statement <text>', 'Human-readable statement')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--nonce <nonce>', 'Custom nonce (default: random)')
    .option('--expiration-time <iso>', 'Expiration time (ISO 8601)')
    .option('--resource <uri...>', 'Resources to include')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSiweBuild({
        domain: opts.domain,
        ownerAlias: opts.owner,
        uri: opts.uri,
        statement: opts.statement,
        chain: opts.chain,
        nonce: opts.nonce,
        expirationTime: opts.expirationTime,
        resources: opts.resource,
      })
      printResult(
        result,
        (data) => {
          console.log(chalk.bold('\nSIWE Message:'))
          console.log(chalk.cyan(data.message))
          console.log()
          label('Nonce', data.nonce)
          label('Issued At', data.issuedAt)
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  siweCmd
    .command('sign')
    .description('Sign a SIWE message')
    .requiredOption('--message <text>', 'SIWE message text')
    .requiredOption('--owner <alias>', 'Account alias to sign with')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSiweSign({ message: opts.message, ownerAlias: opts.owner })
      printResult(
        result,
        (data) => {
          success('SIWE message signed')
          label('Signature', formatHash(data.signature))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  siweCmd
    .command('verify')
    .description('Verify a SIWE message and signature')
    .requiredOption('--message <text>', 'SIWE message text')
    .requiredOption('--signature <hex>', 'Signature hex')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSiweVerify({ message: opts.message, signature: opts.signature })
      printResult(
        result,
        (data) => {
          if (data.valid) {
            success('Signature is valid')
            if (data.address) label('Address', formatAddress(data.address))
            if (data.domain) label('Domain', data.domain)
            if (data.chainId) label('Chain ID', String(data.chainId))
          } else {
            warn(`Signature is invalid: ${data.error ?? 'unknown'}`)
          }
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  siweCmd
    .command('login')
    .description('Build and sign a SIWE message in one step')
    .requiredOption('--domain <domain>', 'Service domain')
    .requiredOption('--owner <alias>', 'Account alias')
    .requiredOption('--uri <uri>', 'Service URI')
    .option('--statement <text>', 'Human-readable statement')
    .option('--chain <id>', 'Chain ID or alias')
    .option('--nonce <nonce>', 'Custom nonce (default: random)')
    .option('--expiration-time <iso>', 'Expiration time (ISO 8601)')
    .option('--resource <uri...>', 'Resources to include')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {}
      const result = await handleSiweLogin({
        domain: opts.domain,
        ownerAlias: opts.owner,
        uri: opts.uri,
        statement: opts.statement,
        chain: opts.chain,
        nonce: opts.nonce,
        expirationTime: opts.expirationTime,
        resources: opts.resource,
      })
      printResult(
        result,
        (data) => {
          success('SIWE login completed')
          label('Nonce', data.nonce)
          label('Issued At', data.issuedAt)
          label('Signature', formatHash(data.signature))
          console.log(chalk.bold('\nMessage:'))
          console.log(chalk.dim(data.message))
        },
        parentOpts
      )
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain ledger ─────────────────────────────────────────────────────────

  const ledgerCmd = program.command('ledger').description('Ledger hardware wallet commands')

  ledgerCmd
    .command('address')
    .description('Show the EVM address at a derivation path')
    .option('--path <path>', "Derivation path (default: m/44'/60'/0'/0/0)")
    .action(async (opts) => {
      const result = await handleLedgerAddress({ path: opts.path })
      printResult(result, (data) => {
        success('Ledger address')
        label('Path', data.path)
        label('Address', formatAddress(data.address))
      }, {})
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  ledgerCmd
    .command('list')
    .description('List EVM addresses from Ledger')
    .option('--count <n>', 'Number of addresses (default: 5)', (v) => parseInt(v), 5)
    .option('--base <path>', "Base derivation path (default: m/44'/60'/0'/0)")
    .action(async (opts) => {
      const result = await handleLedgerList({ count: opts.count, base: opts.base })
      printResult(result, (data) => {
        success(`${data.length} addresses`)
        for (const entry of data) {
          label(`[${entry.index}] ${entry.path}`, formatAddress(entry.address))
        }
      }, {})
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  ledgerCmd
    .command('sign')
    .description('Sign a personal message with Ledger')
    .requiredOption('--message <text>', 'Message to sign')
    .option('--path <path>', "Derivation path (default: m/44'/60'/0'/0/0)")
    .action(async (opts) => {
      const result = await handleLedgerSign({ message: opts.message, path: opts.path })
      printResult(result, (data) => {
        success('Signed')
        label('Signature', formatHash(data.signature))
      }, {})
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  // ─── chain policy ─────────────────────────────────────────────────────────

  const policyCmd = program.command('policy').description('Policy engine commands')

  policyCmd
    .command('show')
    .description('Show current policy configuration')
    .action(async (_opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const result = await handlePolicyShow()
      printResult(result, (data) => {
        success('Policy loaded')
        console.log(chalk.dim(data.raw))
      }, parentOpts)
      if (!result.ok) process.exit(exitCodeFor(result.error.code))
    })

  policyCmd
    .command('edit')
    .description('Open policy.yaml in $EDITOR')
    .action(async () => {
      const { spawnSync } = await import('node:child_process')
      const { resolve, isAbsolute } = await import('node:path')
      const { statSync } = await import('node:fs')
      const policyPath = getPolicyPath()
      const rawEditor = process.env.EDITOR ?? 'vi'
      // Allowlist known safe editors; also accept absolute paths that resolve to a regular file.
      const ALLOWED_EDITORS = new Set(['vi', 'vim', 'nvim', 'nano', 'emacs', 'micro', 'code', 'subl', 'gedit', 'kate'])
      const editorBasename = rawEditor.split('/').pop() ?? rawEditor
      const isKnown = ALLOWED_EDITORS.has(editorBasename)
      const isAbsFile = isAbsolute(rawEditor) && (() => { try { return statSync(rawEditor).isFile() } catch { return false } })()
      if (!isKnown && !isAbsFile) {
        printResult({ ok: false, error: { code: 'INVALID_EDITOR', message: `EDITOR="${rawEditor}" is not in the allowed list. Set EDITOR to one of: ${[...ALLOWED_EDITORS].join(', ')}` } })
        process.exit(1)
      }
      spawnSync(rawEditor, [policyPath], { stdio: 'inherit' })
    })

  policyCmd
    .command('check')
    .description('Dry-run policy evaluation against a hypothetical transaction')
    .requiredOption('--account <alias>', 'Account alias')
    .requiredOption('--chain <id>', 'Chain ID (e.g. 1, 8453)')
    .requiredOption('--to <address>', 'Target contract address')
    .option('--value-eth <amount>', 'ETH value (default: 0)', '0')
    .action(async (opts) => {
      const { loadPolicy, evaluatePolicy } = await import('../policy/index.js')
      const { loadConfig, resolveChainFromConfig } = await import('../config/index.js')
      const { fetchEthPriceUsd } = await import('../handlers/tx.js')
      try {
        const policy = loadPolicy()
        const config = loadConfig()
        const chainId = resolveChainFromConfig(config, opts.chain)
        const ethPrice = await fetchEthPriceUsd(config, chainId)
        const envelope = {
          id: 'dry-run',
          status: 'prepared' as const,
          chainId,
          from: '0x0000000000000000000000000000000000000000',
          to: opts.to,
          value: BigInt(Math.round(parseFloat(opts.valueEth ?? '0') * 1e18)),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        const decision = await evaluatePolicy(policy, envelope, ethPrice, opts.account)
        if (decision.decision === 'allow') {
          success('Policy: ALLOW')
        } else {
          warn('Policy: DENY')
        }
        for (const r of decision.reasons) label('Reason', r)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        warn(msg)
        process.exit(1)
      }
    })

  // ─── chain audit ──────────────────────────────────────────────────────────

  program
    .command('audit')
    .description('Show audit log entries')
    .option('--account <alias>', 'Filter by account alias')
    .option('--tail <n>', 'Show last N entries', (v) => parseInt(v), 20)
    .option('--json', 'Output JSON')
    .action(async (opts, cmd) => {
      const parentOpts = cmd.parent?.opts() ?? {}
      const { getAuditLogPath } = await import('../config/index.js')
      const logPath = getAuditLogPath()
      if (!existsSync(logPath)) {
        info('No audit log entries yet')
        return
      }
      const lines = readFileSync(logPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try { return JSON.parse(l) } catch { return null }
        })
        .filter(Boolean)
      const filtered = opts.account
        ? lines.filter((e: { account: string }) => e.account === opts.account)
        : lines
      const tail = filtered.slice(-opts.tail)
      if (parentOpts.json || opts.json) {
        console.log(JSON.stringify({ ok: true, data: tail }, null, 2))
        return
      }
      success(`${tail.length} audit entries`)
      for (const e of tail) {
        const ent = e as { ts: string; op: string; account: string; chain: string; to?: string; value_usd?: string; hash?: string; decision: string }
        const dec = ent.decision === 'allow' ? chalk.green('ALLOW') : chalk.red('DENY')
        console.log(`${chalk.dim(ent.ts)} [${dec}] ${chalk.bold(ent.op)} account=${ent.account} chain=${ent.chain}${ent.to ? ` to=${ent.to}` : ''}${ent.value_usd ? ` ~$${parseFloat(ent.value_usd).toFixed(2)}` : ''}${ent.hash ? ` tx=${ent.hash.slice(0, 12)}…` : ''}`)
      }
    })

  // ─── chain daemon ─────────────────────────────────────────────────────────

  program
    .command('daemon')
    .description('Start JSON-RPC 2.0 daemon (HTTP) for AI agent access')
    .option('--port <n>', 'Port to listen on (default: 3131)', (v) => parseInt(v), 3131)
    .option('--host <host>', 'Host to bind (default: 127.0.0.1)', '127.0.0.1')
    .action(async (opts) => {
      await startDaemon({ port: opts.port, host: opts.host })
    })

  // ─── chain mcp ────────────────────────────────────────────────────────────

  const mcpCmd = program
    .command('mcp')
    .description('Start the MCP (Model Context Protocol) server for AI agent integration')

  mcpCmd
    .command('stdio')
    .description('Run MCP server over stdin/stdout (for Claude Desktop, Cursor, etc.)')
    .action(async () => {
      await startMcpStdio()
    })

  mcpCmd
    .command('http')
    .description('Run MCP server over Streamable HTTP (for remote AI agents)')
    .option('--port <n>', 'Port (default: 3132)', (v) => parseInt(v), 3132)
    .option('--host <host>', 'Host (default: 127.0.0.1)', '127.0.0.1')
    .action(async (opts) => {
      await startMcpHttp({ port: opts.port, host: opts.host })
    })

  mcpCmd
    .command('tools')
    .description('List all registered MCP tools')
    .action(async () => {
      const { createMcpServer } = await import('../services/mcp.js')
      const server = await createMcpServer()
      // Access registered tools via the internal registry
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tools = (server as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools
      const names = Object.keys(tools).sort()
      success(`${names.length} MCP tools registered`)
      for (const name of names) {
        label(name, tools[name]?.description?.split('.')[0] ?? '')
      }
    })

  return program
}
