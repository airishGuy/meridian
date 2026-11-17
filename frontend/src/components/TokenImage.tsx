import { useState, useEffect } from 'react';
import { TOKENS } from '@/config/tokens';
import { fetchTokenImage, getCachedTokenImage } from '@/lib/tokenMetadata';

interface TokenImageProps {
  tokenAddress: string;
  symbol?: string;
  className?: string;
  alt?: string;
}

export default function TokenImage({ tokenAddress, symbol, className = '', alt = 'token' }: TokenImageProps) {
  const findConfigToken = () => {
    if (tokenAddress && tokenAddress !== '0x') {
      const byAddr = TOKENS.find(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
      if (byAddr) return byAddr;
    }
    if (symbol) {
      return TOKENS.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
    }
    return null;
  };

  const [imageSrc, setImageSrc] = useState<string | null>(() => {
    const configToken = findConfigToken();
    if (configToken?.logo) return configToken.logo;

    const cached = getCachedTokenImage(tokenAddress);
    if (cached !== undefined) return cached;

    return null;
  });

  const [isLoading, setIsLoading] = useState(() => {
    const configToken = findConfigToken();
    return !configToken?.logo;
  });

  useEffect(() => {
    const configToken = findConfigToken();
    if (configToken?.logo) {
      setImageSrc(configToken.logo);
      setIsLoading(false);
      return;
    }

    const cached = getCachedTokenImage(tokenAddress);
    if (cached !== undefined) {
      setImageSrc(cached);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchTokenImage(tokenAddress as `0x${string}`).then((url: string | null) => {
      if (!cancelled) {
        setImageSrc(url);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [tokenAddress, symbol]);

  const fallbackContent = (
    <div className={`w-full h-full bg-white/10 flex items-center justify-center ${className}`}>
      <span className="text-xs text-white/40 font-bold token-symbol">
        {symbol ? symbol.slice(0, 3) : '?'}
      </span>
    </div>
  );

  if (isLoading) {
    return (
      <div className={`w-full h-full bg-white/5 animate-pulse ${className}`} />
    );
  }

  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt={alt}
        className={className}
      />
    );
  }

  return fallbackContent;
}
