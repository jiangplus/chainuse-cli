import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { handlePrice, handlePriceFeeds } from '../../src/handlers/price.js'
import { createTempHome, removeTempHome, setupTempHome, LIVE, resetDbs } from '../helpers.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTempHome()
  setupTempHome(tmpDir)
  process.env.CHAINUSE_HOME = tmpDir
  resetDbs()
})

afterEach(() => {
  removeTempHome(tmpDir)
  delete process.env.CHAINUSE_HOME
})

describe('handlePriceFeeds', () => {
  it('returns a non-empty list of known feeds', async () => {
    const result = await handlePriceFeeds({})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data.length).toBeGreaterThan(0)
    // Each feed has required fields
    const feed = result.data[0]
    expect(feed).toHaveProperty('pair')
    expect(feed).toHaveProperty('feed')
  })

  it('includes ETH/USD on mainnet', async () => {
    const result = await handlePriceFeeds({ chain: 'eip155:1' })
    if (!result.ok) return
    const ethUsd = result.data.find((f) => f.pair === 'ETH/USD')
    expect(ethUsd).toBeTruthy()
  })
})

describe('handlePrice — validation', () => {
  it('returns an error for an unknown feed symbol', async () => {
    const result = await handlePrice({ feed: 'UNKNOWN/FEED' })
    expect(result.ok).toBe(false)
  })
})

describe('handlePrice — live', () => {
  it.skipIf(!LIVE)('reads ETH/USD price from Chainlink', async () => {
    const result = await handlePrice({ feed: 'ETH/USD' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const price = parseFloat(result.data.price)
    expect(price).toBeGreaterThan(100)   // ETH > $100
    expect(price).toBeLessThan(1_000_000) // ETH < $1M (sanity)
  })

  it.skipIf(!LIVE)('reads BTC/USD price', async () => {
    const result = await handlePrice({ feed: 'BTC/USD' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(parseFloat(result.data.price)).toBeGreaterThan(1000)
  })
})
