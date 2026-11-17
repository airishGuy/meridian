import { isAddress } from 'viem';
import { TOKENS } from '@/config/tokens';

export interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

const metadataCache = new Map<string, TokenMetadata | null>();
const imageCache = new Map<string, string | null>();

export function getCachedTokenMetadata(tokenAddress: string): TokenMetadata | null | undefined {
  if (!tokenAddress) return undefined;
  const key = tokenAddress.toLowerCase();
  if (metadataCache.has(key)) {
    return metadataCache.get(key);
  }
  return undefined;
}

export function getCachedTokenImage(tokenAddress: string): string | null | undefined {
  if (!tokenAddress) return undefined;
  const key = tokenAddress.toLowerCase();
  if (imageCache.has(key)) {
    return imageCache.get(key);
  }
  return undefined;
}

export async function fetchTokenMetadata(tokenAddress: `0x${string}` | string): Promise<TokenMetadata | null> {
  if (!tokenAddress) return null;
  const key = tokenAddress.toLowerCase();

  if (metadataCache.has(key)) {
    return metadataCache.get(key) ?? null;
  }

  // Check static TOKENS list first if not a placeholder address
  if (key !== '0x') {
    const configToken = TOKENS.find(t => t.address.toLowerCase() === key);
    if (configToken) {
      const meta: TokenMetadata = {
        name: configToken.name,
        symbol: configToken.symbol,
        decimals: configToken.decimals,
      };
      metadataCache.set(key, meta);
      return meta;
    }
  }

  // If not a valid EVM address (e.g. "0x"), don't attempt to fetch
  if (!isAddress(tokenAddress)) {
    metadataCache.set(key, null);
    return null;
  }

  metadataCache.set(key, null);
  return null;
}

export async function fetchTokenImage(tokenAddress: `0x${string}` | string): Promise<string | null> {
  if (!tokenAddress) return null;
  const key = tokenAddress.toLowerCase();

  if (imageCache.has(key)) {
    return imageCache.get(key) ?? null;
  }

  // Check static TOKENS list first if not a placeholder address
  if (key !== '0x') {
    const configToken = TOKENS.find(t => t.address.toLowerCase() === key);
    if (configToken?.logo) {
      imageCache.set(key, configToken.logo);
      return configToken.logo;
    }
  }

  imageCache.set(key, null);
  return null;
}
