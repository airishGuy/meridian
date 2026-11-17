import { defineChain } from '@reown/appkit/networks';

export const LITEFORGE_EXPLORER_URL = 'https://explorer.testnet.liteforge.zeeve.net';
export const LITEFORGE_EXPLORER_API_URL = 'https://explorer.testnet.liteforge.zeeve.net/api';
export const LITEFORGE_FAUCET_URL = 'https://faucet.testnet.liteforge.zeeve.net/';
export const LITEFORGE_HUB_URL = 'https://testnet.litvm.com';

export const BLOCK_EXPLORER_URL = LITEFORGE_EXPLORER_URL;

export const litvmLiteforge = defineChain({
  id: 4441,
  caipNetworkId: 'eip155:4441',
  chainNamespace: 'eip155',
  name: 'LitVM LiteForge',
  nativeCurrency: {
    decimals: 18,
    name: 'zkLTC',
    symbol: 'zkLTC',
  },
  rpcUrls: {
    default: {
      http: [
        'https://rpc.testnet.liteforge.zeeve.net/',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'LiteForge Explorer',
      url: LITEFORGE_EXPLORER_URL,
      apiUrl: LITEFORGE_EXPLORER_API_URL,
    },
  },
});

export const SUPPORTED_CHAINS = [litvmLiteforge] as const;

export const DEFAULT_CHAIN = litvmLiteforge;

export function getChainById(chainId?: number) {
  if (chainId === litvmLiteforge.id) return litvmLiteforge;
  return DEFAULT_CHAIN;
}

export function getExplorerUrl(chainId?: number): string {
  return LITEFORGE_EXPLORER_URL;
}
