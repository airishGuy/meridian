export interface TokenConfig {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  chainId?: number;
}

export const TOKENS_BY_CHAIN: Record<number, TokenConfig[]> = {
  // LitVM LiteForge (4441)
  4441: [
    {
      "address": "0x0188e0ce0804D5f431AB70ee94024b68a46bBA71",
      "name": "tUSDT",
      "symbol": "tUSDT",
      "decimals": 6,
      "logo": "/usdt.png",
      "chainId": 4441,
    },

    {
      "address": "0x16559F0919F2E41c7ef51512f8324DE2d24EFa20",
      "name": "tLTC",
      "symbol": "tLTC",
      "decimals": 18,
      "logo": "/ltc.png",
      "chainId": 4441,
    },

    {
      "address": "0xF56b200f4007FF00B92dfd2C87183a20bdf7EE75",
      "name": "STPT",
      "symbol": "STPT",
      "decimals": 18,
      "logo": "/STPT.png",
      "chainId": 4441,
    },

    {
      "address": "0xf2FD1F1171C902a69B30b0cd75e2d0e7C499eEfe",
      "name": "GENOME",
      "symbol": "GENOME",
      "decimals": 18,
      "logo": "/genome.png",
      "chainId": 4441,
    },
    

    {
      "address": "0x5a6285C084B4b31eFC4562481D03b398d1715C47",
      "name": "MistCoin",
      "symbol": "MC",
      "decimals": 18,
      "logo": "/MistCoin.png",
      "chainId": 4441,
    },
    
    {
      "address": "0x666301A904602452b6172f9F5070832767B12DF1",
      "name": "ZyneCoin",
      "symbol": "ZYN",
      "decimals": 18,
      "logo": "/zynecoin.png",
      "chainId": 4441,
    }
 
    
  ],
  // Elysium Testnet (99801)
  99801: [
    // {
    //   address: "0x0026de59CF2cD3a581897366DCA1aFa33C6CE312",
    //   name: "rHYPE",
    //   symbol: "rHYPE",
    //   decimals: 18,
    //   logo: "/assets/0x0026de59CF2cD3a581897366DCA1aFa33C6CE312/logo.png",
    //   chainId: 99801,
    // },
    // {
    //   address: "0x7dD76b622AF7eE379326374513E17934246C3c98",
    //   name: "rUSDC",
    //   symbol: "rUSDC",
    //   decimals: 6,
    //   logo: "/assets/0x7dD76b622AF7eE379326374513E17934246C3c98/logo.png",
    //   chainId: 99801,
    // },
  ],
};

export function getTokens(chainId?: number): TokenConfig[] {
  if (chainId && TOKENS_BY_CHAIN[chainId]) {
    return TOKENS_BY_CHAIN[chainId];
  }
  return TOKENS_BY_CHAIN[4441] || TOKENS_BY_CHAIN[677] || TOKENS_BY_CHAIN[99801] || [];
}

// Flat list of all supported tokens across chains for search / backwards-compatibility
export const TOKENS: TokenConfig[] = Object.values(TOKENS_BY_CHAIN).flat();
