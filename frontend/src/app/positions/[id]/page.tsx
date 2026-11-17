import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw, ChevronDown, Flame, ArrowUpCircle, ArrowDownCircle, X, AlertTriangle, Wallet } from 'lucide-react';
import { useAccount, usePublicClient } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits, maxUint256 } from 'viem';

import TokenSelector, { Token } from '@/components/TokenSelector';
import Toast from '@/components/Toast';
import { usePositionDetails } from '@/hooks/liquidity/usePositions';
import { usePositionActions } from '@/hooks/liquidity/usePositionActions';
import { useApproval } from '@/hooks/shared/useApproval';
import { POSITION_MANAGER_ADDRESS } from '@/lib/constants';
import { LiquidityAmounts, getSqrtRatioAtTick } from '@/utils/liquidityMath/liquidityAmounts';
import { fetchSubgraph, GET_POSITION_OWNER, GET_POSITION_TRANSACTIONS } from '@/lib/queries';
import { BLOCK_EXPLORER_URL } from '@/lib/chains';

const getTokenLogo = (token: any) => {
  if (token.logo) return token.logo;
  if (token.symbol === 'ETH') return 'https://cryptologos.cc/logos/ethereum-eth-logo.png';
  if (token.symbol === 'USDC') return 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png';
  if (token.symbol === 'USDT') return 'https://cryptologos.cc/logos/tether-usdt-logo.png';
  if (token.symbol === 'WBTC') return 'https://cryptologos.cc/logos/wrapped-bitcoin-wbtc-logo.png';
  return 'https://raw.githubusercontent.com/uniswap/assets/master/blockchains/ethereum/info/logo.png';
};

const getRelativeTime = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000);
  const difference = now - timestamp;
  if (difference < 60) return 'Just now';
  const minutes = Math.floor(difference / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function PositionDetailsPage() {
  const { id } = useParams();
  const { address: userAddress, isConnected } = useAccount();
  const { open } = useAppKit();
  const publicClient = usePublicClient();

  const { details, isLoading, error, refetch } = usePositionDetails(id);
  const {
    collectFees,
    decreaseLiquidity,
    burnPosition,
    increaseLiquidity,
    isPending,
    toast,
    dismissToast,
    showToast,
  } = usePositionActions();

  const { checkAllowance, approveTokenWithPermit2 } = useApproval();

  const [manageOpen, setManageOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'increase' | 'decrease' | 'burn' | null>(null);
  const [activeModal, setActiveModal] = useState<'increase' | 'decrease' | 'burn' | 'collect' | null>(null);
  
  const [decreasePercent, setDecreasePercent] = useState(50);
  const [decreaseInputFocused, setDecreaseInputFocused] = useState<'token0' | 'token1' | null>(null);
  const [amount0RemoveInput, setAmount0RemoveInput] = useState('');
  const [amount1RemoveInput, setAmount1RemoveInput] = useState('');
  const [amount0Input, setAmount0Input] = useState('');
  const [amount1Input, setAmount1Input] = useState('');

  const [increasePercent0, setIncreasePercent0] = useState<number | null>(null);
  const [increasePercent1, setIncreasePercent1] = useState<number | null>(null);

  // Sync token selector states when details load
  const [token0, setToken0] = useState<Token | null>(null);
  const [token1, setToken1] = useState<Token | null>(null);

  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!details || !id) return;

    let cancelled = false;

    const fetchHistory = async () => {
      setHistoryLoading(true);
      try {
        let origin = userAddress?.toLowerCase();
        try {
          const ownerData = await fetchSubgraph<{ position: { origin: string } | null }>(
            GET_POSITION_OWNER,
            { tokenId: id }
          );
          if (ownerData?.position?.origin) {
            origin = ownerData.position.origin.toLowerCase();
          }
        } catch (ownerErr) {
          console.warn('Failed to fetch position owner/origin from subgraph:', ownerErr);
        }

        if (cancelled) return;
        if (!origin) {
          setHistoryItems([]);
          setHistoryLoading(false);
          return;
        }

        const data = await fetchSubgraph<{ modifyLiquidities: any[] }>(
          GET_POSITION_TRANSACTIONS,
          {
            poolId: details.poolId.toLowerCase(),
            tickLower: details.tickLower,
            tickUpper: details.tickUpper,
            origin: origin
          }
        );

        if (cancelled) return;

        const items = (data.modifyLiquidities || [])
          .filter((ml: any) => BigInt(ml.amount) !== 0n)
          .map((ml: any) => {
          const amount = BigInt(ml.amount);
            
          let type = '';
          if (amount === 0n) {
            type = 'Collect Fees';
          } else if (amount > 0n) {
            type = 'Add Liquidity';
          } else {
            type = 'Remove Liquidity';
          }

          const amt0Val = Number(ml.amount0);
          const amt1Val = Number(ml.amount1);

          let amt0Str = '';
          let amt1Str = '';

          const formatAmt = (val: number) => {
            const absVal = Math.abs(val);
            if (absVal === 0) return '0.0000';
            return absVal.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
          };

          const isNeg0 = amt0Val < 0;
          const isNeg1 = amt1Val < 0;

          const prefix0 = amount === 0n ? '+' : (isNeg0 ? '-' : '+');
          const prefix1 = amount === 0n ? '+' : (isNeg1 ? '-' : '+');

          amt0Str = `${prefix0}${formatAmt(amt0Val)}`;
          amt1Str = `${prefix1}${formatAmt(amt1Val)}`;

          return {
            id: ml.id,
            hash: ml.transaction.id,
            timestamp: Number(ml.timestamp),
            type,
            token0Amount: amt0Str,
            token1Amount: amt1Str,
            amount: ml.amount
          };
        });

        setHistoryItems(items);
      } catch (err) {
        console.error('Failed to fetch position history:', err);
      } finally {
        setHistoryLoading(false);
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [details, id, userAddress]);

  // Fetch real on-chain balances for token0 and token1
  useEffect(() => {
    if (!details || !userAddress || !publicClient) {
      if (details) {
        setToken0(details.token0 as Token);
        setToken1(details.token1 as Token);
      }
      return;
    }

    let cancelled = false;

    const fetchBalances = async () => {
      try {
        const ERC20_BAL_ABI = [
          {
            type: 'function',
            name: 'balanceOf',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ] as const;

        const [bal0, bal1] = await Promise.all([
          details.token0.address === '0x0000000000000000000000000000000000000000'
            ? publicClient.getBalance({ address: userAddress })
            : publicClient.readContract({
                address: details.token0.address,
                abi: ERC20_BAL_ABI,
                functionName: 'balanceOf',
                args: [userAddress],
              }).catch(() => 0n),
          details.token1.address === '0x0000000000000000000000000000000000000000'
            ? publicClient.getBalance({ address: userAddress })
            : publicClient.readContract({
                address: details.token1.address,
                abi: ERC20_BAL_ABI,
                functionName: 'balanceOf',
                args: [userAddress],
              }).catch(() => 0n),
        ]);

        if (cancelled) return;

        // format using decimals without exponential notation
        const formatted0 = (Number(bal0) / 10 ** details.token0.decimals).toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: details.token0.decimals,
        });
        const formatted1 = (Number(bal1) / 10 ** details.token1.decimals).toLocaleString('en-US', {
          useGrouping: false,
          maximumFractionDigits: details.token1.decimals,
        });

        setToken0({
          ...(details.token0 as Token),
          balance: formatted0,
        });
        setToken1({
          ...(details.token1 as Token),
          balance: formatted1,
        });
      } catch (err) {
        console.error('Error fetching position token balances:', err);
        if (!cancelled) {
          setToken0(details.token0 as Token);
          setToken1(details.token1 as Token);
        }
      }
    };

    fetchBalances();
    return () => { cancelled = true; };
  }, [details, userAddress, publicClient]);

  // Calculate dynamic USD values
  const getUSDValues = () => {
    if (!details) return { amount0USD: 0, amount1USD: 0, totalUSD: 0, fees0USD: 0, fees1USD: 0, totalFeesUSD: 0 };
    
    let price0 = details.token0.derivedusdc ?? 0;
    let price1 = details.token1.derivedusdc ?? 0;

    // If derived USDC prices are unavailable, fall back to relative pricing
    if (price0 === 0 && price1 === 0) {
      const sym0 = details.token0.symbol;
      const sym1 = details.token1.symbol;
      price0 = 1;
      price1 = 1;
      if (sym0 === 'ETH' || sym0 === 'WETH') {
        price0 = details.currentPrice;
        price1 = 1;
      } else if (sym1 === 'ETH' || sym1 === 'WETH') {
        price0 = 1;
        price1 = details.currentPrice;
      }
    }

    const amount0USD = details.amount0Human * price0;
    const amount1USD = details.amount1Human * price1;
    const totalUSD = amount0USD + amount1USD;
    console.log({currentPrice: details.currentPrice, totalUSD, amount0USD, amount1USD, price0, price1})

    const fees0USD = details.fees0Human * price0;
    const fees1USD = details.fees1Human * price1;
    const totalFeesUSD = fees0USD + fees1USD;

    return {
      amount0USD,
      amount1USD,
      totalUSD,
      fees0USD,
      fees1USD,
      totalFeesUSD,
    };
  };

  const usd = getUSDValues();

  // Progress Bar styling
  const getProgressStyles = () => {
    if (!details) return { rangeLeft: '25%', rangeRight: '25%', cursorLeft: '50%' };
    const min = details.priceLower;
    const max = details.priceUpper;
    const curr = details.currentPrice;
    
    let pct = 50;
    if (max > min) {
      pct = ((curr - min) / (max - min)) * 100;
    }
    const clampedPct = Math.max(0, Math.min(100, pct));
    const cursorLeft = 25 + (clampedPct / 100) * 50;

    return {
      rangeLeft: '25%',
      rangeRight: '25%',
      cursorLeft: `${cursorLeft}%`,
    };
  };

  const progress = getProgressStyles();

  const handlePercent0Click = (pct: number) => {
    if (!token0 || !token0.balance || isNaN(Number(token0.balance)) || !details) return;
    setIncreasePercent0(pct);
    setIncreasePercent1(null);
    const balanceNum = Number(token0.balance);
    const targetVal = balanceNum * (pct / 100);
    const formattedVal = targetVal.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: details.token0.decimals,
    });
    handleAmount0Change(formattedVal, true);
  };

  const handlePercent1Click = (pct: number) => {
    if (!token1 || !token1.balance || isNaN(Number(token1.balance)) || !details) return;
    setIncreasePercent1(pct);
    setIncreasePercent0(null);
    const balanceNum = Number(token1.balance);
    const targetVal = balanceNum * (pct / 100);
    const formattedVal = targetVal.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: details.token1.decimals,
    });
    handleAmount1Change(formattedVal, true);
  };

  // Handle Increase input changes
  const handleAmount0Change = (valStr: string, isPct = false) => {
    setAmount0Input(valStr);
    if (!isPct) setIncreasePercent0(null);
    if (!valStr || isNaN(Number(valStr)) || !details) {
      setAmount1Input('');
      return;
    }
    try {
      const val0 = parseUnits(valStr, details.token0.decimals);
      const sqrtPriceX96 = details.currentSqrtPriceX96;
      const sqrtPriceLowerX96 = getSqrtRatioAtTick(details.tickLower);
      const sqrtPriceUpperX96 = getSqrtRatioAtTick(details.tickUpper);
      
      if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        setAmount1Input('0');
      } else if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        setAmount1Input('');
      } else {
        const L = LiquidityAmounts.getLiquidityForAmount0(sqrtPriceX96, sqrtPriceUpperX96, val0);
        const val1 = LiquidityAmounts.getAmount1ForLiquidity(sqrtPriceLowerX96, sqrtPriceX96, L);
        setAmount1Input((Number(val1) / 10 ** details.token1.decimals).toFixed(6));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAmount1Change = (valStr: string, isPct = false) => {
    setAmount1Input(valStr);
    if (!isPct) setIncreasePercent1(null);
    if (!valStr || isNaN(Number(valStr)) || !details) {
      setAmount0Input('');
      return;
    }
    try {
      const val1 = parseUnits(valStr, details.token1.decimals);
      const sqrtPriceX96 = details.currentSqrtPriceX96;
      const sqrtPriceLowerX96 = getSqrtRatioAtTick(details.tickLower);
      const sqrtPriceUpperX96 = getSqrtRatioAtTick(details.tickUpper);
      
      if (sqrtPriceX96 >= sqrtPriceUpperX96) {
        setAmount0Input('0');
      } else if (sqrtPriceX96 <= sqrtPriceLowerX96) {
        setAmount0Input('');
      } else {
        const L = LiquidityAmounts.getLiquidityForAmount1(sqrtPriceLowerX96, sqrtPriceX96, val1);
        const val0 = LiquidityAmounts.getAmount0ForLiquidity(sqrtPriceX96, sqrtPriceUpperX96, L);
        setAmount0Input((Number(val0) / 10 ** details.token0.decimals).toFixed(6));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Submit operations
  const handleCollectFees = async () => {
    if (!details) return;
    await collectFees(details.tokenId, details.poolKey);
    setActiveModal(null);
    refetch();
  };

  const handleDecreaseLiquidity = async () => {
    if (!details) return;
    // Scale percentage to basis points (e.g. 24.82% -> 248200) to support floating-point BigInt calculations safely
    const pctBasisPoints = BigInt(Math.round(Number(decreasePercent) * 10000));
    const liquidityToRemove = (details.liquidity * pctBasisPoints) / 1000000n;
    const amount0ToRemove = (details.amount0 * pctBasisPoints) / 1000000n;
    const amount1ToRemove = (details.amount1 * pctBasisPoints) / 1000000n;

    // 2% slippage
    const amount0Min = (amount0ToRemove * 98n) / 100n;
    const amount1Min = (amount1ToRemove * 98n) / 100n;

    await decreaseLiquidity(details.tokenId, details.poolKey, liquidityToRemove, amount0Min, amount1Min);
    setActiveModal(null);
    refetch();
  };

  const handleBurnPosition = async () => {
    if (!details) return;
    // 2% slippage on full burn
    const amount0Min = (details.amount0 * 98n) / 100n;
    const amount1Min = (details.amount1 * 98n) / 100n;

    await burnPosition(details.tokenId, details.poolKey, amount0Min, amount1Min);
    setActiveModal(null);
    refetch();
  };

  const handleIncreaseLiquiditySubmit = async () => {
    if (!details || !userAddress) return;
    try {
      const val0 = amount0Input ? parseUnits(amount0Input, details.token0.decimals) : 0n;
      const val1 = amount1Input ? parseUnits(amount1Input, details.token1.decimals) : 0n;

      if (val0 === 0n && val1 === 0n) {
        showToast('error', 'Zero Amount', 'Please input some amount of tokens to add.');
        return;
      }

      // Check approvals
      if (details.token0.address !== '0x0000000000000000000000000000000000000000' && val0 > 0n) {
        showToast('pending', 'Checking Allowance', `Checking allowance for ${details.token0.symbol}...`);
        const { p2ToSpenderAmount, p2ToSpenderExpiration } = await checkAllowance(
          details.token0.address,
          userAddress,
          POSITION_MANAGER_ADDRESS as `0x${string}`
        );
        const now = Math.floor(Date.now() / 1000);
        if (p2ToSpenderExpiration <= now || p2ToSpenderAmount < val0) {
          showToast('pending', 'Approving Token', `Approving ${details.token0.symbol} for Position Manager...`);
          await approveTokenWithPermit2(
            details.token0.address,
            maxUint256,
            POSITION_MANAGER_ADDRESS as `0x${string}`
          );
        }
      }

      if (details.token1.address !== '0x0000000000000000000000000000000000000000' && val1 > 0n) {
        showToast('pending', 'Checking Allowance', `Checking allowance for ${details.token1.symbol}...`);
        const { p2ToSpenderAmount, p2ToSpenderExpiration } = await checkAllowance(
          details.token1.address,
          userAddress,
          POSITION_MANAGER_ADDRESS as `0x${string}`
        );
        const now = Math.floor(Date.now() / 1000);
        if (p2ToSpenderExpiration <= now || p2ToSpenderAmount < val1) {
          showToast('pending', 'Approving Token', `Approving ${details.token1.symbol} for Position Manager...`);
          await approveTokenWithPermit2(
            details.token1.address,
            maxUint256,
            POSITION_MANAGER_ADDRESS as `0x${string}`
          );
        }
      }

      const L = LiquidityAmounts.getLiquidityForAmounts(
        details.currentSqrtPriceX96,
        getSqrtRatioAtTick(details.tickLower),
        getSqrtRatioAtTick(details.tickUpper),
        val0,
        val1
      );

      const amount0Max = val0 + (val0 * 2n) / 100n;
      const amount1Max = val1 + (val1 * 2n) / 100n;

      await increaseLiquidity(details.tokenId, details.poolKey, L, amount0Max, amount1Max);
      setActiveModal(null);
      refetch();
    } catch (e: any) {
      console.error(e);
      showToast('error', 'Increase Failed', e?.message ?? 'Failed to increase liquidity');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="w-10 h-10 text-primary animate-spin" />
        <p className="text-xs text-white/40 uppercase tracking-wider">Loading on-chain position state...</p>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center max-w-md mx-auto px-6">
        <div className="p-4 bg-rose-500/10 rounded-2xl text-rose-400">
          <AlertTriangle size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-2">Position Load Failed</h2>
          <p className="text-xs text-white/50 leading-relaxed">
            {error ?? "We couldn't find this position on-chain. Please verify the ID and try again."}
          </p>
        </div>
        <div className="flex gap-3">
          <Link to="/profile" className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs font-semibold uppercase tracking-wider rounded-xl transition-all">
            Back to Profile
          </Link>
          <button onClick={refetch} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-black text-xs font-bold uppercase tracking-wider rounded-xl transition-all gold-glow active:scale-95 cursor-pointer">
            Retry Fetch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-40 max-w-6xl mx-auto relative w-full px-4">
      {/* Toast Alert */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-[99999]">
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            txHash={toast.txHash}
            onClose={dismissToast}
          />
        </div>
      )}

      <Link to="/profile" className="flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-6 group w-fit">
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-semibold uppercase tracking-wider">Back to Profile</span>
      </Link>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex -space-x-3 shrink-0">
            <div className="w-12 h-12 rounded-full border-2 border-black bg-black overflow-hidden relative z-[5] shadow-md">
              <img alt="token0" className="w-full h-full object-contain" src={getTokenLogo(details.token0)} />
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-black bg-black overflow-hidden relative z-[4] shadow-md">
              <img alt="token1" className="w-full h-full object-contain" src={getTokenLogo(details.token1)} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{details.token0.symbol} / {details.token1.symbol}</h1>
              <span className="text-xs bg-primary/10 border border-primary/25 text-primary px-3 py-0.5 rounded-full font-mono font-bold">{details.feePct}</span>
            </div>
            <div className="flex items-center gap-2.5 mt-1.5">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${details.status === 'In Range' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
                {details.status}
              </span>
              <span className="text-xs text-white/50 font-mono">Position #{details.tokenId}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 relative w-full sm:w-auto">
          {!isConnected ? (
            <button
              onClick={() => open()}
              className="w-full sm:w-auto px-6 py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer bg-primary hover:brightness-110 text-black gold-glow shadow-lg"
            >
              Connect Wallet
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setActiveModal('collect');
                }}
                disabled={isPending}
                className="flex-1 sm:flex-initial px-5 py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] border cursor-pointer bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10"
              >
                Collect Fees
              </button>

              <button
                onClick={() => {
                  setManageOpen(!manageOpen);
                }}
                className={`flex-1 sm:flex-initial px-5 py-3 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg ${manageOpen ? 'bg-white/20 text-white border border-white/30' : 'bg-primary hover:brightness-110 text-black gold-glow'}`}
              >
                Manage
                <ChevronDown size={14} className={`transition-transform duration-300 ${manageOpen ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded Manage Actions */}
      {manageOpen && (
        <div className="flex flex-wrap gap-3 mb-8 p-1.5 bg-[#0a0a0c]/80 border border-white/[0.08] rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <button
            onClick={() => {
              setSelectedAction('increase');
              setActiveModal('increase');
              setManageOpen(false);
            }}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl border transition-all bg-white/[0.02] border-white/10 hover:bg-primary/10 hover:border-primary/30 group cursor-pointer"
          >
            <ArrowUpCircle size={16} className="text-white/30 group-hover:text-primary transition-colors" />
            <span className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors">Increase Position</span>
          </button>

          <button
            onClick={() => {
              setSelectedAction('decrease');
              setActiveModal('decrease');
              setManageOpen(false);
            }}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl border transition-all bg-white/[0.02] border-white/10 hover:bg-primary/10 hover:border-primary/30 group cursor-pointer"
          >
            <ArrowDownCircle size={16} className="text-white/30 group-hover:text-primary transition-colors" />
            <span className="text-xs font-semibold text-white/70 group-hover:text-white transition-colors">Decrease Position</span>
          </button>

          <button
            onClick={() => {
              setSelectedAction('burn');
              setActiveModal('burn');
              setManageOpen(false);
            }}
            className="flex-1 min-w-[140px] flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl border transition-all bg-rose-500/[0.03] border-rose-500/15 hover:bg-rose-500/10 hover:border-rose-500/30 group cursor-pointer"
          >
            <Flame size={16} className="text-rose-400/50 group-hover:text-rose-400 transition-colors" />
            <span className="text-xs font-semibold text-rose-400/80 group-hover:text-rose-300 transition-colors">Burn Position</span>
          </button>
        </div>
      )}

      {/* Compact Stat Cards (Smaller Sleek Boxes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Liquidity Card */}
        <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-5 sm:p-6 rounded-2xl relative overflow-hidden group shadow-xl backdrop-blur-md">
          <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-primary/5 blur-[60px] rounded-full pointer-events-none transition-colors group-hover:bg-primary/10"></div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Total Liquidity Value</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-white mb-4">
            ${usd.totalUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>

          <div className="space-y-2 relative z-10 text-sm">
            <div className="flex justify-between items-center py-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <img src={getTokenLogo(details.token0)} alt="token0" className="w-5 h-5 rounded-full" />
                <span className="font-semibold text-white">{details.token0.symbol}</span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-white font-mono">{details.amount0Human.toFixed(4)} {details.token0.symbol}</p>
                <p className="text-xs text-white/40 font-mono">
                  ${usd.amount0USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <img src={getTokenLogo(details.token1)} alt="token1" className="w-5 h-5 rounded-full" />
                <span className="font-semibold text-white">{details.token1.symbol}</span>
              </div>
              <div className="text-right">
                <p className="font-semibold text-white font-mono">{details.amount1Human.toFixed(4)} {details.token1.symbol}</p>
                <p className="text-xs text-white/40 font-mono">
                  ${usd.amount1USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Unclaimed Fees Card */}
        <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-5 sm:p-6 rounded-2xl relative overflow-hidden group shadow-xl backdrop-blur-md">
          <div className="absolute top-0 right-0 w-[120px] h-[120px] bg-emerald-500/5 blur-[60px] rounded-full pointer-events-none transition-colors group-hover:bg-emerald-500/10"></div>
          <div className="flex justify-between items-start mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Unclaimed Fees</p>
            <button onClick={refetch} className="text-white/30 hover:text-white transition-colors cursor-pointer p-1 rounded-md hover:bg-white/5">
              <RefreshCw size={14} className={isPending ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-emerald-400 mb-4">
            ${usd.totalFeesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
          </p>

          <div className="space-y-2 relative z-10 text-sm">
            <div className="flex justify-between items-center py-2 border-t border-white/[0.06]">
              <span className="font-semibold text-white/70">{details.token0.symbol}</span>
              <span className="font-semibold text-white font-mono">{details.fees0Human.toFixed(6)} {details.token0.symbol}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-t border-white/[0.06]">
              <span className="font-semibold text-white/70">{details.token1.symbol}</span>
              <span className="font-semibold text-white font-mono">{details.fees1Human.toFixed(6)} {details.token1.symbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Range Section */}
      <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-8 rounded-3xl shadow-xl backdrop-blur-md mb-8">
        <p className="text-sm font-bold uppercase tracking-wider text-white/50 mb-6 text-center">Price Range Corridor</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="text-center p-5 bg-black/40 border border-white/[0.08] rounded-2xl">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Min Price</p>
            <p className="text-2xl font-bold font-mono text-white leading-tight">
              {details.priceLower === 0 ? '0' : details.priceLower.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </p>
            <p className="text-xs text-white/40 font-mono mt-1.5">{details.token1.symbol} per {details.token0.symbol}</p>
          </div>

          <div className="text-center p-6 bg-primary/5 border border-primary/25 rounded-2xl relative shadow-[0_0_30px_rgba(244,63,94,0.1)]">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-black text-xs font-bold px-3 py-0.5 uppercase tracking-wider rounded-full shadow-sm">Current Market</div>
            <p className="text-xs uppercase tracking-wider text-primary/70 mb-2 font-semibold">Current Price</p>
            <p className="text-2xl font-bold font-mono text-primary leading-tight">{details.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p>
            <p className="text-xs text-primary/60 font-mono mt-1.5">{details.token1.symbol} per {details.token0.symbol}</p>
          </div>

          <div className="text-center p-5 bg-black/40 border border-white/[0.08] rounded-2xl">
            <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Max Price</p>
            <p className="text-2xl font-bold font-mono text-white leading-tight">
              {details.priceUpper > 1e12 ? '∞' : details.priceUpper.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </p>
            <p className="text-xs text-white/40 font-mono mt-1.5">{details.token1.symbol} per {details.token0.symbol}</p>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-8 relative h-2.5 bg-white/5 rounded-full overflow-hidden">
          <div className="absolute h-full bg-primary/20 border-x border-primary" style={{ left: progress.rangeLeft, right: progress.rangeRight }}></div>
          <div className="absolute top-0 h-full w-2 bg-primary gold-glow" style={{ left: progress.cursorLeft }}></div>
        </div>
        <div className="flex justify-between mt-3 text-xs font-mono text-white/40">
          <span>0</span>
          <span>&infin;</span>
        </div>
      </div>

      {/* Transaction History Section */}
      <div className="mb-8">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="flex items-center gap-3 group outline-none cursor-pointer"
        >
          <div className={`p-2 rounded-xl transition-colors ${historyOpen ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/40 group-hover:bg-white/10 group-hover:text-white'}`}>
            <ChevronDown size={16} className={`transition-transform duration-300 ${historyOpen ? 'rotate-180' : ''}`} />
          </div>
          <span className={`text-sm font-bold uppercase tracking-wider transition-colors ${historyOpen ? 'text-white' : 'text-white/40 group-hover:text-white'}`}>
            View Position Transactions
          </span>
        </button>

        {historyOpen && (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="bg-black/50 rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-[#0a0a0a] text-xs font-semibold uppercase tracking-wider text-white/40">
                    <th className="py-3.5 px-6">Type</th>
                    <th className="py-3.5 px-6 text-right">Amount ({details.token0.symbol})</th>
                    <th className="py-3.5 px-6 text-right">Amount ({details.token1.symbol})</th>
                    <th className="py-3.5 px-6 text-right">Time</th>
                    <th className="py-3.5 px-6 text-center">Status</th>
                    <th className="py-3.5 px-6 text-right">Tx Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] text-xs font-mono text-white/70">
                  {historyLoading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-primary/70 font-sans text-xs">
                        <RefreshCw className="w-4 h-4 animate-spin inline mr-2" />
                        Loading transaction history...
                      </td>
                    </tr>
                  ) : historyItems.length > 0 ? (
                    historyItems.map((item) => (
                      <tr key={item.id} className="hover:bg-white/[0.035] transition-colors">
                        <td className="py-3.5 px-6 text-white font-sans font-medium">{item.type}</td>
                        <td className={`py-3.5 px-6 text-right font-mono font-medium ${item.token0Amount.startsWith('-') ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                          {item.token0Amount}
                        </td>
                        <td className={`py-3.5 px-6 text-right font-mono font-medium ${item.token1Amount.startsWith('-') ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                          {item.token1Amount}
                        </td>
                        <td className="py-3.5 px-6 text-right text-white/40 font-mono">{getRelativeTime(item.timestamp)}</td>
                        <td className="py-3.5 px-6 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">Success</span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <a 
                            href={`${BLOCK_EXPLORER_URL}/tx/${item.hash}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1 text-primary hover:underline font-mono"
                          >
                            {`${item.hash.slice(0, 4)}...${item.hash.slice(-4)}`}
                            <ExternalLink size={10} />
                          </a>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-white/30 font-sans text-xs uppercase tracking-wider">
                        No transactions found for this position.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Collect Fees Modal */}
      {activeModal === 'collect' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActiveModal(null)}
          />

          <div className="relative w-full max-w-lg bg-[#0d0d10] border border-white/15 p-6 sm:p-8 shadow-2xl rounded-3xl flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Collect Fees</h2>
              <p className="text-xs text-white/40 mt-1">
                Claim your earned trading fees from this position.
              </p>
            </div>

            <div className="w-full space-y-4">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4 text-center">Unclaimed Earnings</p>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex items-center gap-3">
                      <img src={getTokenLogo(details.token0)} className="w-6 h-6 rounded-full" />
                      <div>
                        <p className="text-xs font-semibold text-white">{details.fees0Human.toFixed(6)} {details.token0.symbol}</p>
                        <p className="text-xs text-white/40 font-mono">{details.token0.name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-white/60">
                      ${usd.fees0USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex justify-between items-center px-2">
                    <div className="flex items-center gap-3">
                      <img src={getTokenLogo(details.token1)} className="w-6 h-6 rounded-full" />
                      <div>
                        <p className="text-xs font-semibold text-white">{details.fees1Human.toFixed(6)} {details.token1.symbol}</p>
                        <p className="text-xs text-white/40 font-mono">{details.token1.name}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-white/60">
                      ${usd.fees1USD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-col items-center">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/40 mb-1">Total Receivable</span>
                  <span className="text-2xl sm:text-3xl font-bold text-primary tracking-tight font-mono">
                    ${usd.totalFeesUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-white/60 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCollectFees}
                disabled={isPending}
                className="py-3 px-5 rounded-xl bg-primary hover:bg-primary/90 text-black text-xs font-bold uppercase tracking-wider gold-glow active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                Collect All Fees
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Increase Position Modal */}
      {activeModal === 'increase' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActiveModal(null)}
          />

          <div className="relative w-full max-w-lg bg-[#0d0d10] border border-white/15 p-6 sm:p-8 shadow-2xl rounded-3xl flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Increase Position</h2>
              <p className="text-xs text-white/40 mt-1">
                Add more liquidity to your existing price range.
              </p>
            </div>

            <div className="w-full space-y-3">
              {/* Token Input 0 */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/40">Deposit Amount</span>
                  <span className="text-xs text-white/40 font-mono">Bal: {token0?.balance ?? '0'} {details.token0.symbol}</span>
                </div>
                <div className="flex justify-between items-center mb-2.5">
                  <input
                    type="text"
                    placeholder="0.0"
                    value={amount0Input}
                    onChange={(e) => handleAmount0Change(e.target.value)}
                    className="bg-transparent text-xl font-bold font-mono text-white outline-none w-1/2"
                  />
                  <TokenSelector
                    selectedToken={token0}
                    onSelect={() => {}}
                    tokens={token0 ? [token0] : []}
                    disabled={true}
                  />
                </div>
                <div className="flex gap-1.5">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePercent0Click(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono tracking-wider transition-all cursor-pointer border ${
                        increasePercent0 === p
                          ? 'bg-primary text-black border-primary font-bold'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Token Input 1 */}
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-white/40">Deposit Amount</span>
                  <span className="text-xs text-white/40 font-mono">Bal: {token1?.balance ?? '0'} {details.token1.symbol}</span>
                </div>
                <div className="flex justify-between items-center mb-2.5">
                  <input
                    type="text"
                    placeholder="0.0"
                    value={amount1Input}
                    onChange={(e) => handleAmount1Change(e.target.value)}
                    className="bg-transparent text-xl font-bold font-mono text-white outline-none w-1/2"
                  />
                  <TokenSelector
                    selectedToken={token1}
                    onSelect={() => {}}
                    tokens={token1 ? [token1] : []}
                    disabled={true}
                  />
                </div>
                <div className="flex gap-1.5">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePercent1Click(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono tracking-wider transition-all cursor-pointer border ${
                        increasePercent1 === p
                          ? 'bg-primary text-black border-primary font-bold'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 px-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs uppercase tracking-wider text-white/40">Selected Range</span>
                  <span className="text-xs font-semibold text-emerald-400">In Range</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs uppercase tracking-wider text-white/30 mb-1">Min Price</p>
                    <p className="text-sm font-bold font-mono text-white">
                      {details.priceLower.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                  </div>
                  <div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 text-center">
                    <p className="text-xs uppercase tracking-wider text-white/30 mb-1">Max Price</p>
                    <p className="text-sm font-bold font-mono text-white">
                      {details.priceUpper > 1e12 ? '∞' : details.priceUpper.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-white/60 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleIncreaseLiquiditySubmit}
                disabled={isPending}
                className="py-3 px-5 rounded-xl bg-primary hover:bg-primary/90 text-black text-xs font-bold uppercase tracking-wider gold-glow active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                Add Liquidity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decrease Position Modal */}
      {activeModal === 'decrease' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActiveModal(null)}
          />

          <div className="relative w-full max-w-lg bg-[#0d0d10] border border-white/15 p-6 sm:p-8 shadow-2xl rounded-3xl flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Remove Liquidity</h2>
              <p className="text-xs text-white/40 mt-1">
                Withdraw a portion of your pool assets.
              </p>
            </div>

            <div className="w-full space-y-5">
              <div className="text-center">
                <span className="text-3xl font-bold font-mono text-white tracking-tight">{Number(decreasePercent).toFixed(2)}%</span>
                <div className="flex justify-center gap-2 mt-4">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => setDecreasePercent(p)}
                      className={`px-4 py-2 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${decreasePercent === p
                        ? 'bg-primary text-black border-primary'
                        : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                    >
                      {p === 100 ? 'MAX' : `${p}%`}
                    </button>
                  ))}
                </div>
                <div className="px-6 mt-6">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={decreasePercent}
                    onChange={(e) => setDecreasePercent(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none outline-none accent-primary cursor-pointer"
                  />
                </div>
              </div>

              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1">Assets to Receive</p>
                
                {/* Token 0 Input */}
                <div className="flex justify-between items-center bg-[#16161a] border border-white/10 px-3.5 py-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <img src={getTokenLogo(details.token0)} className="w-5 h-5 rounded-full" />
                    <span className="text-xs font-semibold text-white">{details.token0.symbol}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="0.0"
                    value={
                      decreaseInputFocused === 'token0'
                        ? amount0RemoveInput
                        : (details.amount0Human * (decreasePercent / 100)).toLocaleString('en-US', {
                            useGrouping: false,
                            maximumFractionDigits: Math.min(details.token0.decimals, 6)
                          })
                    }
                    onFocus={() => {
                      setDecreaseInputFocused('token0');
                      setAmount0RemoveInput(
                        (details.amount0Human * (decreasePercent / 100)).toLocaleString('en-US', {
                          useGrouping: false,
                          maximumFractionDigits: Math.min(details.token0.decimals, 6)
                        })
                      );
                    }}
                    onBlur={() => setDecreaseInputFocused(null)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmount0RemoveInput(val);
                      if (!val || isNaN(Number(val))) {
                        setDecreasePercent(0);
                        return;
                      }
                      if (details.amount0Human > 0) {
                        const pct = Math.max(0, Math.min(100, (Number(val) / details.amount0Human) * 100));
                        setDecreasePercent(pct);
                      }
                    }}
                    className="bg-transparent text-right font-mono text-xs font-bold text-white outline-none w-1/2"
                  />
                </div>

                {/* Token 1 Input */}
                <div className="flex justify-between items-center bg-[#16161a] border border-white/10 px-3.5 py-2.5 rounded-xl">
                  <div className="flex items-center gap-2">
                    <img src={getTokenLogo(details.token1)} className="w-5 h-5 rounded-full" />
                    <span className="text-xs font-semibold text-white">{details.token1.symbol}</span>
                  </div>
                  <input
                    type="text"
                    placeholder="0.0"
                    value={
                      decreaseInputFocused === 'token1'
                        ? amount1RemoveInput
                        : (details.amount1Human * (decreasePercent / 100)).toLocaleString('en-US', {
                            useGrouping: false,
                            maximumFractionDigits: Math.min(details.token1.decimals, 6)
                          })
                    }
                    onFocus={() => {
                      setDecreaseInputFocused('token1');
                      setAmount1RemoveInput(
                        (details.amount1Human * (decreasePercent / 100)).toLocaleString('en-US', {
                          useGrouping: false,
                          maximumFractionDigits: Math.min(details.token1.decimals, 6)
                        })
                      );
                    }}
                    onBlur={() => setDecreaseInputFocused(null)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAmount1RemoveInput(val);
                      if (!val || isNaN(Number(val))) {
                        setDecreasePercent(0);
                        return;
                      }
                      if (details.amount1Human > 0) {
                        const pct = Math.max(0, Math.min(100, (Number(val) / details.amount1Human) * 100));
                        setDecreasePercent(pct);
                      }
                    }}
                    className="bg-transparent text-right font-mono text-xs font-bold text-white outline-none w-1/2"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-white/60 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDecreaseLiquidity}
                disabled={isPending}
                className="py-3 px-5 rounded-xl bg-primary hover:bg-primary/90 text-black text-xs font-bold uppercase tracking-wider gold-glow active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                Remove Liquidity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Burn Modal */}
      {activeModal === 'burn' && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setActiveModal(null)}
          />

          <div className="relative w-full max-w-lg bg-[#0d0d10] border border-rose-500/30 p-6 sm:p-8 shadow-[0_0_50px_rgba(239,68,68,0.15)] rounded-3xl flex flex-col animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Burn Position</h2>
              <p className="text-xs text-rose-400/80 mt-1">
                This action is final and irreversible.
              </p>
            </div>

            <div className="w-full space-y-4">
              <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[100px] h-[100px] bg-rose-500/5 blur-[50px] pointer-events-none"></div>
                <div className="flex justify-between items-center mb-3 relative z-10">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Tokens to Claim</span>
                  <Wallet size={12} className="text-white/30" />
                </div>

                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <img src={getTokenLogo(details.token0)} className="w-5 h-5 rounded-full" />
                      <span className="text-xs font-semibold text-white">{(details.amount0Human + details.fees0Human).toFixed(6)} {details.token0.symbol}</span>
                    </div>
                    <span className="text-xs font-mono text-white/40">
                      ${(usd.amount0USD + usd.fees0USD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <img src={getTokenLogo(details.token1)} className="w-5 h-5 rounded-full" />
                      <span className="text-xs font-semibold text-white">{(details.amount1Human + details.fees1Human).toFixed(6)} {details.token1.symbol}</span>
                    </div>
                    <span className="text-xs font-mono text-white/40">
                      ${(usd.amount1USD + usd.fees1USD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-between items-end">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Total Value</span>
                  <span className="text-xl font-bold font-mono text-white tracking-tight">
                    ${(usd.totalUSD + usd.totalFeesUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <AlertTriangle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300 leading-relaxed">
                  Withdraws all liquidity and terminates fee generation permanently.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="py-3 px-5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold uppercase tracking-wider text-white/60 hover:bg-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBurnPosition}
                disabled={isPending}
                className="py-3 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold uppercase tracking-wider shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isPending && <RefreshCw size={14} className="animate-spin" />}
                Confirm Burn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
