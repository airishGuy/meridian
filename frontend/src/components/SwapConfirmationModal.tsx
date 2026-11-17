import React, { useState, useEffect } from 'react';
import { X, ArrowDown, Loader2 } from 'lucide-react';
import type { Token } from './TokenSelector';
import TokenImage from './TokenImage';
import { parseUnits } from 'viem';
import { useApproval } from '@/hooks/shared/useApproval';
import { UNIVERSALROUTER_ADDRESS } from '@/lib/constants';

interface SwapConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromToken: Token;
  toToken: Token;
  amountIn: string;
  amountOut: string;
  gasFeeUsd: string;
  slippagePct: number;
  rateText: string;
  onConfirm: () => Promise<void>;
  isSwapping: boolean;
  userAddress?: `0x${string}`;
}

export default function SwapConfirmationModal({
  isOpen,
  onClose,
  fromToken,
  toToken,
  amountIn,
  amountOut,
  gasFeeUsd,
  slippagePct,
  rateText,
  onConfirm,
  isSwapping,
  userAddress,
}: SwapConfirmationModalProps) {
  const { checkAllowance, approveTokenWithPermit2 } = useApproval();
  const [needsApproval, setNeedsApproval] = useState(false);
  const [checkingAllowance, setCheckingAllowance] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isNative = fromToken.address === '0x0000000000000000000000000000000000000000';

  useEffect(() => {
    const checkTokenAllowance = async () => {
      if (!userAddress || isNative || !isOpen || !amountIn) return;
      try {
        setCheckingAllowance(true);
        const rawAmountIn = parseUnits(amountIn, fromToken.decimals);
        const { p2ToSpenderAmount, p2ToSpenderExpiration } = await checkAllowance(
          fromToken.address,
          userAddress,
          UNIVERSALROUTER_ADDRESS as `0x${string}`
        );
        const now = Math.floor(Date.now() / 1000);
        const isExpired = p2ToSpenderExpiration <= now;
        setNeedsApproval(p2ToSpenderAmount < rawAmountIn || isExpired);
      } catch (e) {
        console.error('Allowance check failed:', e);
      } finally {
        setCheckingAllowance(false);
      }
    };

    checkTokenAllowance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fromToken, amountIn, userAddress]);

  const handleApprove = async () => {
    if (!userAddress) return;
    try {
      setIsApproving(true);
      const rawAmountIn = parseUnits(amountIn, fromToken.decimals);
      await approveTokenWithPermit2(
        fromToken.address,
        rawAmountIn,
        UNIVERSALROUTER_ADDRESS as `0x${string}`
      );
      setNeedsApproval(false);
    } catch (e) {
      console.error('Approval failed:', e);
    } finally {
      setIsApproving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-[500px] rounded-3xl border border-white/15 bg-[#0d0d10] p-6 sm:p-7 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Review Swap</h3>
            <p className="text-xs text-white/40 mt-0.5">Please confirm transaction details below</p>
          </div>
          <button 
            onClick={onClose}
            className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Swap Route Visualizer */}
        <div className="space-y-2 mb-5">
          {/* Pay Block */}
          <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs uppercase tracking-wider text-white/40 font-medium">You Pay</span>
              <span className="text-xl font-bold font-mono text-white truncate">{amountIn}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <div className="w-6 h-6 shrink-0 rounded-full overflow-hidden">
                <TokenImage tokenAddress={fromToken.address} symbol={fromToken.symbol} className="w-full h-full" alt={fromToken.symbol} />
              </div>
              <span className="text-xs font-semibold text-white">{fromToken.symbol}</span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center -my-3.5 relative z-10">
            <div className="w-8 h-8 bg-[#16161a] border border-white/15 rounded-full flex items-center justify-center text-primary shadow-lg">
              <ArrowDown size={14} strokeWidth={2.5} />
            </div>
          </div>

          {/* Receive Block */}
          <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs uppercase tracking-wider text-white/40 font-medium">You Receive</span>
              <span className="text-xl font-bold font-mono text-white truncate">{amountOut}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <div className="w-6 h-6 shrink-0 rounded-full overflow-hidden">
                <TokenImage tokenAddress={toToken.address} symbol={toToken.symbol} className="w-full h-full" alt={toToken.symbol} />
              </div>
              <span className="text-xs font-semibold text-white">{toToken.symbol}</span>
            </div>
          </div>
        </div>

        {/* Details Table */}
        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-2 mb-5 text-xs text-white/50">
          {rateText && (
            <div className="flex justify-between items-center">
              <span>Exchange Rate</span>
              <span className="text-white font-mono">{rateText}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span>Slippage Tolerance</span>
            <span className="text-white font-mono">{slippagePct}%</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Estimated Network Fee</span>
            <span className="text-white font-mono">{gasFeeUsd}</span>
          </div>
        </div>

        {/* Step-by-Step Approval & Swap Flow */}
        <div className="space-y-3">
          {!isNative && needsApproval && (
            <div className="space-y-3">
              {/* Step 1: Approve */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl border border-primary/25 bg-primary/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    1
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-white">Approve {fromToken.symbol}</span>
                    <span className="text-xs text-white/40">Allow Universal Router to swap your tokens</span>
                  </div>
                </div>
                {checkingAllowance ? (
                  <Loader2 size={16} className="text-white/40 animate-spin" />
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-black text-xs font-bold rounded-xl gold-glow transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isApproving ? <Loader2 size={14} className="animate-spin" /> : 'Approve'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action Button */}
          {(!isNative && needsApproval) ? (
            <button
              disabled
              className="w-full py-3.5 px-6 bg-white/5 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-white/30 cursor-not-allowed"
            >
              Please Approve First
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={isSwapping}
              className="w-full py-3.5 px-6 bg-primary hover:bg-primary/90 text-black text-xs font-bold uppercase tracking-wider gold-glow rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSwapping ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Swapping...
                </>
              ) : (
                <span>Confirm Swap {fromToken.symbol} → {toToken.symbol}</span>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
