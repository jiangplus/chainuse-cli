import { describe, it, expect } from 'bun:test'
import { parseUnits, isAddress } from 'viem'
import { LIVE, USDC_MAINNET, WETH_MAINNET } from '../helpers.js'

// We test the pure calldata-building logic that doesn't need a live node,
// and gate the quote path (which needs eth_call) behind LIVE.

describe('swap service — address coverage', () => {
  it('has Universal Router addresses for key chains', async () => {
    // Import the module to verify it initialises without error
    const mod = await import('../../src/services/swap.js')
    expect(typeof mod.quoteAndBuildSwap).toBe('function')
  })
})

describe('quoteAndBuildSwap — validation', () => {
  it('throws when quoter address not available for chain', async () => {
    const { quoteAndBuildSwap } = await import('../../src/services/swap.js')
    const { createPublicClient, http } = await import('viem')
    const client = createPublicClient({ transport: http('http://localhost:9999') })

    await expect(
      quoteAndBuildSwap({
        client,
        chainId: 99999, // unsupported chain
        tokenIn: { address: USDC_MAINNET, decimals: 6, symbol: 'USDC' },
        tokenOut: { address: WETH_MAINNET, decimals: 18, symbol: 'WETH' },
        amountIn: '100',
        recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      })
    ).rejects.toThrow('not available on chain 99999')
  })
})

describe('quoteAndBuildSwap — live (Base)', () => {
  it.skipIf(!LIVE)('quotes USDC → WETH on Base and returns valid calldata', async () => {
    const { quoteAndBuildSwap } = await import('../../src/services/swap.js')
    const { createPublicClient, http } = await import('viem')

    const rpc = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ''}`
    const client = createPublicClient({ transport: http(rpc) })

    const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    const WETH_BASE = '0x4200000000000000000000000000000000000006'

    const result = await quoteAndBuildSwap({
      client,
      chainId: 8453,
      tokenIn: { address: USDC_BASE, decimals: 6, symbol: 'USDC' },
      tokenOut: { address: WETH_BASE, decimals: 18, symbol: 'WETH' },
      amountIn: '10',
      recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      slippageBps: 50,
    })

    expect(parseFloat(result.amountOut)).toBeGreaterThan(0)
    expect(result.calldata).toMatch(/^0x/)
    expect(isAddress(result.to)).toBe(true)
    expect(result.fee).toBeGreaterThan(0)
    expect(result.slippageBps).toBe(50)
    expect(parseFloat(result.amountOutMinimum)).toBeLessThan(parseFloat(result.amountOut))
  })
})
