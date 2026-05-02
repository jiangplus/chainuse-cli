import { parseAbi, type PublicClient, type Address } from 'viem'

// ─── Built-in Token Registry ─────────────────────────────────────────────────
// chainId → symbol (uppercase) → address

const TOKEN_REGISTRY: Record<number, Record<string, Address>> = {
  // Ethereum Mainnet
  1: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    CRV: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    MKR: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    SNX: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    COMP: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    LDO: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    STETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    WSTETH: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    RPL: '0xD33526068D116cE69F19A9ee46F0bd304F21A51f',
    FXS: '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0',
    FRAX: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    BUSD: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
    LUSD: '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',
    GHO: '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f',
    PYUSD: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    TUSD: '0x0000000000085d4780B73119b644AE5ecd22b376',
    USDP: '0x8E870D67F660D95d5be530380D0eC0bd388289E1',
    EUL: '0xd9Fcd98c322942075A5C3860693e9f4f03AAE07b',
  },
  // Base Mainnet
  8453: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    WETH: '0x4200000000000000000000000000000000000006',
    CBETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    WSTETH: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    COMP: '0x9e1028F5F1D5eDE59748FFceE5532509976840E0',
    AERO: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    WELL: '0xA88594D404727625A9437C3f886C7643872296AE',
  },
  // Arbitrum One
  42161: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    'USDC.e': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    ARB: '0x912CE59144191C1204E64559FE8253a0e49E6548',
    LINK: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    GMX: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a',
    GHO: '0x7dfF72693f6A4149b17e7C6314655f6A9F7c8B33',
  },
  // Optimism
  10: {
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    'USDC.e': '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
    USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    WETH: '0x4200000000000000000000000000000000000006',
    WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
    OP: '0x4200000000000000000000000000000000000042',
    LINK: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
  },
  // Polygon
  137: {
    USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    'USDC.e': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    MATICX: '0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6',
  },
  // Sepolia testnet
  11155111: {
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    LINK: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
    AAVE: '0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a',
  },
}

const ERC20_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])

/**
 * Resolve a token string (symbol or address) to an address on a given chain.
 * Returns null if not found in the registry (caller should check if it's a raw address).
 */
export function resolveTokenAddress(tokenStr: string, chainId: number): Address | null {
  const chain = TOKEN_REGISTRY[chainId]
  if (!chain) return null
  // Case-insensitive symbol lookup
  const upper = tokenStr.toUpperCase()
  for (const [sym, addr] of Object.entries(chain)) {
    if (sym.toUpperCase() === upper) return addr
  }
  return null
}

/**
 * List all known tokens for a chain.
 */
export function listKnownTokens(chainId: number): Array<{ symbol: string; address: Address }> {
  const chain = TOKEN_REGISTRY[chainId]
  if (!chain) return []
  return Object.entries(chain).map(([symbol, address]) => ({ symbol, address }))
}

/**
 * Fetch ERC-20 decimals from the chain.
 */
export async function getTokenDecimals(client: PublicClient, token: Address): Promise<number> {
  const result = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  return result as number
}

/**
 * Fetch ERC-20 symbol from the chain.
 */
export async function getTokenSymbol(client: PublicClient, token: Address): Promise<string> {
  const result = await client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'symbol',
  })
  return result as string
}
