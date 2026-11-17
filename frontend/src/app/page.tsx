"use client";

import { useState, useEffect, useMemo } from 'react';
import { ArrowDown, Copy, Check, Loader2, Cpu, Sparkles } from 'lucide-react';
import TokenSelector, { Token } from '@/components/TokenSelector';
import Toast from '@/components/Toast';
import SwapConfirmationModal from '@/components/SwapConfirmationModal';
import { TOKENS } from '@/config/tokens';
import { useAccount, useGasPrice } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useTokenBalance } from '@/hooks/shared/useTokenBalance';
import { useTokenMetadata } from '@/hooks/shared/useTokenMetadata';
import { fetchSubgraph, GET_POOLS, SUBGRAPH_ENDPOINT } from '@/lib/queries';
import { useSwapQuote } from '@/hooks/swap/useSwapQuote';
import { useSwap } from '@/hooks/swap/useSwap';
import { ethers } from 'ethers';
import { useSearchParams } from 'react-router-dom';

interface SubgraphPool {
  id: string;
  token0: { id: string; symbol: string; name: string; decimals: string; derivedUSDC: string };
  token1: { id: string; symbol: string; name: string; decimals: string; derivedUSDC: string };
  feeTier: string;
  tickSpacing: string;
  hooks: string;
  liquidity: string;
  sqrtPrice: string;
  totalValueLockedUSD: string;
}

export default function SwapPage() {
  const { address, isConnected } = useAccount();
  const { data: gasPrice } = useGasPrice();
  const { open } = useAppKit();

  const [slippage, setSlippage] = useState('0.5');
  const [isAutoSlippage, setIsAutoSlippage] = useState(true);
  const [searchParams] = useSearchParams();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const [fromToken, setFromToken] = useState<Token | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const from = params.get('from');
      if (from) {
        const found = TOKENS.find(t => t.address.toLowerCase() === from.toLowerCase());
        if (found) return found;
        return { address: from as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' };
      }
    }
    return TOKENS[0];
  });

  const [toToken, setToToken] = useState<Token | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const to = params.get('to');
      if (to) {
        const found = TOKENS.find(t => t.address.toLowerCase() === to.toLowerCase());
        if (found) return found;
        return { address: to as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' };
      }
    }
    return TOKENS[1];
  });

  const fromTokenAddress = fromToken?.address || '';
  const toTokenAddress = toToken?.address || '';

  const { metadata: fromMetadata } = useTokenMetadata(
    fromToken && !TOKENS.find(t => t.address.toLowerCase() === fromToken.address.toLowerCase()) ? fromTokenAddress : undefined
  );
  const { metadata: toMetadata } = useTokenMetadata(
    toToken && !TOKENS.find(t => t.address.toLowerCase() === toToken.address.toLowerCase()) ? toTokenAddress : undefined
  );

  useEffect(() => {
    if (fromMetadata && fromToken && !TOKENS.find(t => t.address.toLowerCase() === fromToken.address.toLowerCase())) {
      if (fromToken.name !== fromMetadata.name || fromToken.symbol !== fromMetadata.symbol || fromToken.decimals !== fromMetadata.decimals) {
        setFromToken(prev => prev ? { ...prev, name: fromMetadata.name, symbol: fromMetadata.symbol, decimals: fromMetadata.decimals } : prev);
      }
    }
  }, [fromMetadata, fromToken]);

  useEffect(() => {
    if (toMetadata && toToken && !TOKENS.find(t => t.address.toLowerCase() === toToken.address.toLowerCase())) {
      if (toToken.name !== toMetadata.name || toToken.symbol !== toMetadata.symbol || toToken.decimals !== toMetadata.decimals) {
        setToToken(prev => prev ? { ...prev, name: toMetadata.name, symbol: toMetadata.symbol, decimals: toMetadata.decimals } : prev);
      }
    }
  }, [toMetadata, toToken]);

  useEffect(() => {
    if (fromParam) {
      const found = TOKENS.find(t => t.address.toLowerCase() === fromParam.toLowerCase());
      if (found) {
        setFromToken(found);
      } else if (fromParam === 'NATIVE') {
        setFromToken(TOKENS.find(t => t.address === '0x0000000000000000000000000000000000000000') || null);
      } else {
        setFromToken({ address: fromParam as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' });
      }
    }
    if (toParam) {
      const found = TOKENS.find(t => t.address.toLowerCase() === toParam.toLowerCase());
      if (found) {
        setToToken(found);
      } else if (toParam === 'NATIVE') {
        setToToken(TOKENS.find(t => t.address === '0x0000000000000000000000000000000000000000') || null);
      } else {
        setToToken({ address: toParam as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' });
      }
    }
  }, [fromParam, toParam]);

  // Pool lookup state
  const [allPools, setAllPools] = useState<SubgraphPool[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isExactInput, setIsExactInput] = useState(true);

  const { formattedBalance: fromBalance } = useTokenBalance({ token: fromToken ?? undefined, address });
  const { formattedBalance: toBalance } = useTokenBalance({ token: toToken ?? undefined, address });

  // Fetch all pools once on mount
  useEffect(() => {
    const fetchPools = async () => {
      try {
        setPoolsLoading(true);
        const res = await fetchSubgraph<{ pools: SubgraphPool[] }>(GET_POOLS);
        setAllPools(res.pools || []);
      } catch (e) {
        console.error('Failed to fetch pools:', e);
      } finally {
        setPoolsLoading(false);
      }
    };
    fetchPools();
  }, []);

  // Compute pool ID from pool key
  const computePoolId = (pool: SubgraphPool) => {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [
        pool.token0.id,
        pool.token1.id,
        parseInt(pool.feeTier),
        parseInt(pool.tickSpacing),
        pool.hooks,
      ]
    );
    return ethers.keccak256(encoded);
  };

  // Filter pools to those containing both selected tokens
  const matchingPools = useMemo(() => {
    if (!fromToken || !toToken) return [];
    const fromAddr = fromToken.address.toLowerCase();
    const toAddr = toToken.address.toLowerCase();

    return allPools
      .filter((pool) => {
        const t0 = pool.token0.id.toLowerCase();
        const t1 = pool.token1.id.toLowerCase();
        return (
          (t0 === fromAddr && t1 === toAddr) ||
          (t0 === toAddr && t1 === fromAddr)
        );
      })
      .map((pool) => ({
        ...pool,
        computedId: computePoolId(pool),
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromToken, toToken, allPools]);

  // Auto-select first matching pool (or clear selection)
  useEffect(() => {
    if (matchingPools.length > 0) {
      // Keep current selection if still valid
      const stillValid = matchingPools.some((p) => p.computedId === selectedPoolId);
      if (!stillValid) {
        setSelectedPoolId(matchingPools[0].computedId);
      }
    } else {
      setSelectedPoolId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingPools]);

  const selectedPool = useMemo(() => {
    return matchingPools.find(p => p.computedId === selectedPoolId) || null;
  }, [matchingPools, selectedPoolId]);

  const effectiveFromToken = fromToken || { address: (fromParam || '0x0000000000000000000000000000000000000000') as `0x${string}`, name: 'Unknown', symbol: '???', decimals: 18, logo: '' };
  const effectiveToToken = toToken || { address: (toParam || '0x0000000000000000000000000000000000000000') as `0x${string}`, name: 'Unknown', symbol: '???', decimals: 18, logo: '' };

  // Swap Quote Hook integration
  const {
    inputAmount,
    outputAmount,
    gas,
    isLoading: quoteLoading,
    error: quoteError,
    onInputChange,
    onOutputChange,
    setInputAmount,
    setOutputAmount,
    retriggerQuote,
  } = useSwapQuote({
    token0: effectiveFromToken,
    token1: effectiveToToken,
    poolFee: selectedPool ? parseInt(selectedPool.feeTier) : 3000,
    tickSpacing: selectedPool ? parseInt(selectedPool.tickSpacing) : 60,
    hooksAddress: selectedPool ? selectedPool.hooks : '0x0000000000000000000000000000000000000000',
    sqrtPriceX96: selectedPool ? selectedPool.sqrtPrice : '0',
  });

  // Re-quote when token decimals resolve/change (e.g. unknown token metadata loaded).
  useEffect(() => {
    retriggerQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFromToken.decimals, effectiveToToken.decimals]);

  // Swap transaction hook
  const {
    executeSwap,
    toast: swapToast,
    dismissToast: dismissSwapToast,
    isSwapping,
    txnGas,
    clearTxnGas
  } = useSwap();

  // Load initial quote of '1' once selected pool is resolved
  useEffect(() => {
    if (selectedPoolId && !inputAmount) {
      onInputChange('1');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPoolId]);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedHookAddress, setCopiedHookAddress] = useState(false);

  const truncateId = (id: string) => `${id.slice(0, 10)}…${id.slice(-6)}`;

  const handleCopyPoolId = (e: React.MouseEvent, fullId: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullId);
    setCopiedId(fullId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCopyHookAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedHookAddress(true);
    setTimeout(() => setCopiedHookAddress(false), 1500);
  };

  const handleSwapClick = () => {
    if (!inputAmount || Number(inputAmount) <= 0) return;
    if (!outputAmount || Number(outputAmount) <= 0 || quoteError) return;
    setShowConfirmModal(true);
  };

  const handleFlipTokens = () => {
    const prevFrom = fromToken;
    const prevTo = toToken;
    const prevInput = inputAmount;
    const prevOutput = outputAmount;
    setFromToken(prevTo);
    setToToken(prevFrom);
    // Swap amounts and keep direction: exact input stays exact input
    setInputAmount(prevOutput);
    setOutputAmount(prevInput);
    setIsExactInput(true);
  };

  const handleConfirmSwap = async () => {
    if (!selectedPool) return;
    if (!fromToken || !toToken) return;

    const parsedSlippage = parseFloat(slippage);
    const finalSlippage = parsedSlippage > 0 ? parsedSlippage : 0.5;
    await executeSwap({
      fromToken,
      toToken,
      poolFee: parseInt(selectedPool.feeTier),
      tickSpacing: parseInt(selectedPool.tickSpacing),
      hooksAddress: selectedPool.hooks,
      amountIn: inputAmount,
      amountOut: outputAmount,
      slippagePct: finalSlippage,
      isExactInput,
    });
    setShowConfirmModal(false);
    clearTxnGas();


  };

  const formatGasFee = (gasBigint: bigint | null) => {
    if (!gasBigint) return '$0.00';
    const currentGasPrice = gasPrice ?? 20000000000n; // default to 20 gwei in wei

    const totalWei = gasBigint * currentGasPrice;
    const nativeAmount = Number(totalWei) / 1e18;
    console.log("current gasfee:", nativeAmount.toFixed(4))
    // Native token is USDC on Arc, so 1 Native Token = $1.00 USD
    return `$${nativeAmount.toFixed(4)}`;
  };

  const rateText = useMemo(() => {
    if (!inputAmount || !outputAmount || Number(inputAmount) === 0) return '';
    const rate = Number(outputAmount) / Number(inputAmount);
    return `1 ${effectiveFromToken.symbol} = ${rate.toFixed(4)} ${effectiveToToken.symbol}`;
  }, [inputAmount, outputAmount, effectiveFromToken, effectiveToToken]);

  const reverseRateText = useMemo(() => {
    if (!inputAmount || !outputAmount || Number(outputAmount) === 0) return '';
    const rate = Number(inputAmount) / Number(outputAmount);
    return `1 ${effectiveToToken.symbol} = ${rate.toFixed(4)} ${effectiveFromToken.symbol}`;
  }, [inputAmount, outputAmount, effectiveFromToken, effectiveToToken]);



  return (
    <div className="flex-grow flex items-center justify-center py-6 sm:py-12 relative w-full">
      {/* Background Ambient Glows */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[350px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-[480px] mx-auto relative z-10">
        {/* Warning if no pool found */}
        {!poolsLoading && matchingPools.length === 0 && (
          <div className="mb-4 px-4 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-xs uppercase tracking-wider font-semibold text-amber-300">
              No active liquidity pool found for this pair
            </span>
          </div>
        )}

        {/* Main Swap Card */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#0c0c0e]/95 backdrop-blur-2xl shadow-2xl overflow-hidden p-3 sm:p-4">
          {/* Card Header */}
          <div className="flex items-center justify-between px-3 pt-2 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white tracking-tight">Swap</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-white/50">
                Uniswap v4
              </span>
            </div>
            {poolsLoading && (
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-primary" />
                <span className="text-xs text-white/40 font-medium">Finding best route...</span>
              </div>
            )}
            {rateText && !poolsLoading && (
              <span className="text-xs text-white/50 font-mono">{rateText}</span>
            )}
          </div>

          <div className="space-y-1 relative">
            {/* From Token Box */}
            <div className="bg-[#121216] hover:bg-[#15151a] focus-within:bg-[#15151a] focus-within:border-white/15 transition-all duration-200 rounded-2xl p-4 border border-white/[0.06]">
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/40">You Pay</span>
                <button
                  type="button"
                  onClick={() => { if (fromBalance) onInputChange(fromBalance.replace(/,/g, '')); setIsExactInput(true); }}
                  className="text-xs text-white/50 hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>Balance:</span>
                  <span className="font-mono text-white/90 font-medium">{fromBalance}</span>
                  <span className="token-symbol text-white/60">{effectiveFromToken.symbol}</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={inputAmount}
                      onChange={(e) => { setIsExactInput(true); onInputChange(e.target.value); }}
                      className={`bg-transparent border-none p-0 text-3xl sm:text-4xl leading-tight focus:ring-0 focus:outline-none w-full placeholder:text-white/15 font-bold tracking-tight ${
                        isExactInput ? 'text-white' : 'text-white/40'
                      }`}
                      placeholder="0"
                    />
                    {quoteLoading && !isExactInput && (
                      <Loader2 size={18} className="animate-spin text-primary shrink-0" />
                    )}
                  </div>
                </div>
                <TokenSelector
                  selectedToken={fromToken}
                  onSelect={setFromToken}
                  tokens={TOKENS}
                  excludeToken={toToken}
                  className="shrink-0"
                />
              </div>
            </div>

            {/* Flip Button */}
            <div className="flex justify-center -my-2.5 relative z-20">
              <button
                type="button"
                onClick={handleFlipTokens}
                className="w-10 h-10 rounded-full bg-[#18181f] border border-white/10 flex items-center justify-center text-white/60 hover:text-primary hover:border-primary/40 hover:bg-primary/10 shadow-xl transition-all duration-200 active:scale-90 cursor-pointer"
                title="Swap Direction"
              >
                <ArrowDown size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* To Token Box */}
            <div className="bg-[#121216] hover:bg-[#15151a] focus-within:bg-[#15151a] focus-within:border-white/15 transition-all duration-200 rounded-2xl p-4 border border-white/[0.06]">
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/40">You Receive</span>
                <span className="text-xs text-white/50 flex items-center gap-1.5">
                  <span>Balance:</span>
                  <span className="font-mono text-white/90 font-medium">{toBalance}</span>
                  <span className="token-symbol text-white/60">{effectiveToToken.symbol}</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={outputAmount}
                      onChange={(e) => { setIsExactInput(false); onOutputChange(e.target.value); }}
                      className={`bg-transparent border-none p-0 text-3xl sm:text-4xl leading-tight focus:ring-0 focus:outline-none w-full placeholder:text-white/15 font-bold tracking-tight ${
                        !isExactInput ? 'text-white' : 'text-white/40'
                      }`}
                      placeholder="0"
                    />
                    {quoteLoading && isExactInput && (
                      <Loader2 size={18} className="animate-spin text-primary shrink-0" />
                    )}
                  </div>
                </div>
                <TokenSelector
                  selectedToken={toToken}
                  onSelect={setToToken}
                  tokens={TOKENS}
                  excludeToken={fromToken}
                  className="shrink-0"
                />
              </div>
            </div>
          </div>

          {/* Quote Error Message */}
          {quoteError && (
            <div className="mt-3 px-4 py-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium text-center rounded-2xl">
              {quoteError}
            </div>
          )}

          {/* Swap CTA Button */}
          <div className="mt-3">
            {!isConnected ? (
              <button
                type="button"
                onClick={() => open()}
                className="w-full py-4 rounded-2xl bg-primary text-black text-base tracking-wide font-bold transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-lg"
              >
                Connect Wallet
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSwapClick}
                disabled={quoteLoading || !!quoteError || !inputAmount || Number(inputAmount) <= 0 || !outputAmount || Number(outputAmount) <= 0}
                className="w-full py-4 rounded-2xl bg-primary text-black text-base tracking-wide font-bold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-lg"
              >
                {quoteLoading ? 'Fetching Best Quote…' : 'Swap'}
              </button>
            )}
          </div>

          {/* Order Details & Slippage Settings */}
          {(rateText || isConnected) && (
            <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2 px-1">
              {/* Slippage Row */}
              <div className="flex items-center justify-between text-xs py-1">
                <span className="uppercase tracking-wider font-semibold text-white/40">Max Slippage</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center p-0.5 bg-white/[0.04] border border-white/[0.06] rounded-xl">
                    {['0.1', '0.5', '1.0'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => { setSlippage(preset); setIsAutoSlippage(preset === '0.5'); }}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          slippage === preset && isAutoSlippage === (preset === '0.5')
                            ? 'bg-primary text-black shadow-sm font-bold'
                            : 'text-white/40 hover:text-white'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                  <div className={`flex items-center bg-white/[0.04] border rounded-xl px-2.5 py-1 transition-all ${
                    !isAutoSlippage && !['0.1','0.5','1.0'].includes(slippage) ? 'border-primary/50 text-white' : 'border-white/[0.06] text-white/60'
                  }`}>
                    <input
                      type="text"
                      value={slippage}
                      onChange={(e) => { setSlippage(e.target.value); setIsAutoSlippage(false); }}
                      className="bg-transparent border-none p-0 text-xs text-white focus:ring-0 focus:outline-none w-7 text-right font-mono"
                    />
                    <span className="text-xs text-white/30 ml-0.5">%</span>
                  </div>
                </div>
              </div>

              {/* Rate Detail */}
              {reverseRateText && (
                <div className="flex items-center justify-between text-xs py-1 border-t border-white/[0.04]">
                  <span className="uppercase tracking-wider font-semibold text-white/40">Exchange Rate</span>
                  <span className="text-xs text-white/70 font-mono font-medium">{reverseRateText}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Swap Confirmation Modal */}
        <SwapConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          fromToken={effectiveFromToken}
          toToken={effectiveToToken}
          amountIn={inputAmount}
          amountOut={outputAmount}
          gasFeeUsd={txnGas || "-"}
          slippagePct={parseFloat(slippage) > 0 ? parseFloat(slippage) : 0.5}
          rateText={rateText}
          onConfirm={handleConfirmSwap}
          isSwapping={isSwapping}
          userAddress={address}
        />

        {/* Toast Notification Layer */}
        {swapToast.show && (
          <div className="fixed top-15 right-8 z-[100] flex flex-col gap-4 pointer-events-none">
            <Toast
              type={swapToast.type}
              title={swapToast.title}
              message={swapToast.message}
              txHash={swapToast.txHash}
              onClose={dismissSwapToast}
            />
          </div>
        )}
      </div>
    </div>
  );
}
