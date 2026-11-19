import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Info, Minus, Plus, Infinity, AlertCircle } from 'lucide-react';
import TokenSelector, { Token } from '@/components/TokenSelector';
import TokenImage from '@/components/TokenImage';
import { TOKENS } from '@/config/tokens';
import { useTokenMetadata } from '@/hooks/shared/useTokenMetadata';
import { useModifyLiquidity } from '@/hooks/liquidity/useModifyLiquidity';
import { sqrtRatioX96ToPrice } from '@/utils/liquidityMath/fullMath';
import { LiquidityAmounts, getSqrtRatioAtTick } from '@/utils/liquidityMath/liquidityAmounts';
import { fetchSubgraph, GET_POOL_BY_ID } from '@/lib/queries';
import { parseUnits, formatUnits, isAddress } from 'viem';
import Toast from '@/components/Toast';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useTokenBalance } from '@/hooks/shared/useTokenBalance';
import { formatPrice } from '@/utils';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export default function CreatePositionPage() {
  const { params } = useParams();
  const { MIN_TICK, MAX_TICK, getMinTick, getMaxTick, priceToTick, mintPosition, toast, dismissToast, isConfirming } = useModifyLiquidity();

  const [tokenA, setTokenA] = useState<Token>(TOKENS[0]);
  const [tokenB, setTokenB] = useState<Token>(TOKENS[1]);
  const [feeTier, setFeeTier] = useState('0.3%');
  const [tickSpacing, setTickSpacing] = useState('0');
  const [hooks, setHooks] = useState(ZERO_ADDRESS);
  const [hookAddressInput, setHookAddressInput] = useState('');
  const [poolId, setPoolId] = useState('');
  const [sqrtPrice, setSqrtPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  const [isFromPool, setIsFromPool] = useState(false);
  const [rangeType, setRangeType] = useState<'full' | 'custom'>('custom');
  const [strategy, setStrategy] = useState<'stable' | 'wide' | null>(null);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);
  const [minPriceInput, setMinPriceInput] = useState('0');
  const [maxPriceInput, setMaxPriceInput] = useState('0');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Use these whenever min/max price change programmatically (buttons, strategy presets,
  // URL params) so the numeric state and the text field stay in sync.
  const updateMinPrice = (value: number) => {
    setMinPrice(value);
    setMinPriceInput(formatPrice(value.toString()));
  };
  const updateMaxPrice = (value: number) => {
    setMaxPrice(value);
    setMaxPriceInput(formatPrice(value.toString()));
  };

  // Allows free typing (including a trailing "." or a leading "-") while keeping
  // the numeric minPrice/maxPrice in sync for offset % and tick calculations.
  const handleMinPriceInputChange = (raw: string) => {
    const cleaned = raw.replace(/,/g, '');
    if (cleaned === '' || /^-?\d*\.?\d*$/.test(cleaned)) {
      setMinPriceInput(cleaned);
      const parsed = parseFloat(cleaned);
      setMinPrice(isNaN(parsed) ? 0 : parsed);
    }
  };
  const handleMaxPriceInputChange = (raw: string) => {
    const cleaned = raw.replace(/,/g, '');
    if (cleaned === '' || /^-?\d*\.?\d*$/.test(cleaned)) {
      setMaxPriceInput(cleaned);
      const parsed = parseFloat(cleaned);
      setMaxPrice(isNaN(parsed) ? 0 : parsed);
    }
  };
  const isTokenA0 = (tokenA.address || '').toLowerCase() < (tokenB.address || '').toLowerCase();
  const t0 = isTokenA0 ? tokenA : tokenB;
  const t1 = isTokenA0 ? tokenB : tokenA;

  const { metadata: metaA } = useTokenMetadata(
    !TOKENS.find(t => t.address.toLowerCase() === tokenA.address.toLowerCase()) ? tokenA.address : undefined
  );
  const { metadata: metaB } = useTokenMetadata(
    !TOKENS.find(t => t.address.toLowerCase() === tokenB.address.toLowerCase()) ? tokenB.address : undefined
  );

  useEffect(() => {
    if (metaA && tokenA && !TOKENS.find(t => t.address.toLowerCase() === tokenA.address.toLowerCase())) {
      if (tokenA.name !== metaA.name || tokenA.symbol !== metaA.symbol || tokenA.decimals !== metaA.decimals) {
        setTokenA(prev => prev ? { ...prev, name: metaA.name, symbol: metaA.symbol, decimals: metaA.decimals } : prev);
      }
    }
  }, [metaA, tokenA]);

  useEffect(() => {
    if (metaB && tokenB && !TOKENS.find(t => t.address.toLowerCase() === tokenB.address.toLowerCase())) {
      if (tokenB.name !== metaB.name || tokenB.symbol !== metaB.symbol || tokenB.decimals !== metaB.decimals) {
        setTokenB(prev => prev ? { ...prev, name: metaB.name, symbol: metaB.symbol, decimals: metaB.decimals } : prev);
      }
    }
  }, [metaB, tokenB]);

  const { address, isConnected } = useAccount();
  const { open } = useAppKit();
  const { formattedBalance: balance0 } = useTokenBalance({ token: t0, address });
  const { formattedBalance: balance1 } = useTokenBalance({ token: t1, address });

  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');

  const calculateAmountsFromAmount0 = useCallback((amount0Str: string) => {
    if (!amount0Str || isNaN(Number(amount0Str)) || Number(amount0Str) <= 0) {
      setInputAmount(amount0Str);
      setOutputAmount('');
      return;
    }

    setInputAmount(amount0Str);

    try {
      ///////////////////////////////////////////////
      const parsedAmount0 = parseUnits(amount0Str, t0.decimals);
      const tickSpacingNum = Number(tickSpacing) || 60;
      let tLower: number;
      let tUpper: number;

      if (rangeType === 'full') {
        tLower = getMinTick(tickSpacingNum);
        tUpper = getMaxTick(tickSpacingNum);
      } else {
        tLower = priceToTick(minPrice, t0.decimals, t1.decimals, tickSpacingNum);
        tUpper = priceToTick(maxPrice, t0.decimals, t1.decimals, tickSpacingNum);
        if (tLower >= tUpper) {
          tUpper = tLower + tickSpacingNum;
        }
      }

      const sqrtPriceAX96 = getSqrtRatioAtTick(tLower);
      const sqrtPriceBX96 = getSqrtRatioAtTick(tUpper);
      console.log({parsedAmount0, tickSpacingNum, tLower, tUpper, sqrtPriceAX96, sqrtPriceBX96, sqrtPrice})
      
      let sqrtPriceX96 = BigInt(sqrtPrice || '0');
      if (sqrtPriceX96 === 0n) {
        const currentTick = priceToTick(currentPrice, t0.decimals, t1.decimals, tickSpacingNum);
        sqrtPriceX96 = getSqrtRatioAtTick(currentTick);
      }

      let liquidity = 0n;
      let calculatedAmount1 = 0n;

      if (sqrtPriceX96 <= sqrtPriceAX96) {
        console.log("00")
        liquidity = LiquidityAmounts.getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, parsedAmount0);
        calculatedAmount1 = 0n;
      } else if (sqrtPriceX96 < sqrtPriceBX96) {
        console.log("11")
        liquidity = LiquidityAmounts.getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, parsedAmount0);
        calculatedAmount1 = LiquidityAmounts.getAmount1ForLiquidity(sqrtPriceAX96, sqrtPriceX96, liquidity);
      } else {
        liquidity = 0n;
        calculatedAmount1 = 0n;
      }
      console.log("calculated liquidity: ", liquidity)

      const formattedAmount1 = formatUnits(calculatedAmount1, t1.decimals);
      setOutputAmount(Number(formattedAmount1) === 0 ? '0' : Number(formattedAmount1).toFixed(6).replace(/\.?0+$/, ''));
    } catch (e) {
      console.error("Error calculating liquidity amounts:", e);
    }
  }, [t0, t1, minPrice, maxPrice, rangeType, tickSpacing, sqrtPrice, currentPrice, priceToTick, MIN_TICK, MAX_TICK]);

  useEffect(() => {
    calculateAmountsFromAmount0(inputAmount);
  }, [minPrice, maxPrice, rangeType, tickSpacing, sqrtPrice, currentPrice, calculateAmountsFromAmount0]);

  const handleHookAddressChange = (val: string) => {
    const trimmed = val.trim();
    setHookAddressInput(trimmed);

    if (trimmed === '') {
      setHooks(ZERO_ADDRESS);
      return;
    }

    if (isAddress(trimmed)) {
      setHooks(trimmed);
    }
    // If it's invalid/incomplete, we don't update `hooks` yet -
    // it keeps its last valid value until a full valid address is entered.
  };

  const isHookInputInvalid = hookAddressInput.trim() !== '' && !isAddress(hookAddressInput.trim());

  useEffect(() => {
    if (params) {
      const searchParams = new URLSearchParams(params);
      const c0 = searchParams.get('currency0');
      const c1 = searchParams.get('currency1');
      const fee = searchParams.get('fee');
      const ts = searchParams.get('tickSpacing');
      const hk = searchParams.get('hooks');
      const pid = searchParams.get('poolId');
      const sp = searchParams.get('sqrtPrice');


      let foundParams = false;

      if (c0) {
        const nativeAddr = '0x0000000000000000000000000000000000000000';
        const t0 = TOKENS.find(t => (t.address || '').toLowerCase() === c0.toLowerCase() || (c0 === 'NATIVE' && t.address === nativeAddr));
        if (t0) {
          setTokenA(t0);
        } else if (c0 === 'NATIVE') {
          setTokenA({ address: nativeAddr as `0x${string}`, name: 'Native', symbol: 'NATIVE', decimals: 18, logo: '' });
        } else {
          setTokenA({ address: c0 as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' });
        }
        foundParams = true;
      }
      if (c1) {
        const nativeAddr = '0x0000000000000000000000000000000000000000';
        const t1 = TOKENS.find(t => (t.address || '').toLowerCase() === c1.toLowerCase() || (c1 === 'NATIVE' && t.address === nativeAddr));
        if (t1) {
          setTokenB(t1);
        } else if (c1 === 'NATIVE') {
          setTokenB({ address: nativeAddr as `0x${string}`, name: 'Native', symbol: 'NATIVE', decimals: 18, logo: '' });
        } else {
          setTokenB({ address: c1 as `0x${string}`, name: 'Loading...', symbol: '...', decimals: 18, logo: '' });
        }
        foundParams = true;
      }
      if (fee) {
        setFeeTier(fee);
        foundParams = true;
      }
      if (ts) setTickSpacing(ts);
      if (hk) {
        setHooks(hk);
        setHookAddressInput(hk === ZERO_ADDRESS ? '' : hk);
      }
      if (pid) {
        setPoolId(pid);

        if (sp) {
          setSqrtPrice(sp);
          let dec0 = tokenA.decimals;
          let dec1 = tokenB.decimals;
          if (c0 && c1) {
            const parsedT0 = TOKENS.find(t => (t.address || '').toLowerCase() === c0.toLowerCase() || (c0 === 'NATIVE' && t.address === '0x0000000000000000000000000000000000000000'));
            const parsedT1 = TOKENS.find(t => (t.address || '').toLowerCase() === c1.toLowerCase() || (c1 === 'NATIVE' && t.address === '0x0000000000000000000000000000000000000000'));
            if (parsedT0 && parsedT1) {
              const isT0Smaller = (parsedT0.address || '').toLowerCase() < (parsedT1.address || '').toLowerCase();
              dec0 = isT0Smaller ? parsedT0.decimals : parsedT1.decimals;
              dec1 = isT0Smaller ? parsedT1.decimals : parsedT0.decimals;
            }
          }
          //
          const [price0, price1] = sqrtRatioX96ToPrice(sp, dec0, dec1);
          if (!isNaN(price0) && price0 > 0) {
            setCurrentPrice(price0);

            // Calculate and set minPrice and maxPrice right here
            if (minPrice === 0 && maxPrice === 0) {
              const minPercent = 10;
              const maxPercent = 10;
              const calcMin = Number((price0 * (1 - minPercent / 100)).toPrecision(6));
              const calcMax = Number((price0 * (1 + maxPercent / 100)).toPrecision(6));
              updateMinPrice(calcMin);
              updateMaxPrice(calcMax);
            }
          }
        } else {
          // Fetch live price from subgraph fallback
          fetchSubgraph<{ pool: { token0Price: string; token1Price: string; sqrtPrice: string } | null }>(GET_POOL_BY_ID, { id: pid })
            .then(data => {
              if (data.pool) {
                setSqrtPrice(data.pool.sqrtPrice);

                let dec0 = tokenA.decimals;
                let dec1 = tokenB.decimals;
                if (c0 && c1) {
                  const parsedT0 = TOKENS.find(t => (t.address || '').toLowerCase() === c0.toLowerCase() || (c0 === 'NATIVE' && t.address === '0x0000000000000000000000000000000000000000'));
                  const parsedT1 = TOKENS.find(t => (t.address || '').toLowerCase() === c1.toLowerCase() || (c1 === 'NATIVE' && t.address === '0x0000000000000000000000000000000000000000'));
                  if (parsedT0 && parsedT1) {
                    const isT0Smaller = (parsedT0.address || '').toLowerCase() < (parsedT1.address || '').toLowerCase();
                    dec0 = isT0Smaller ? parsedT0.decimals : parsedT1.decimals;
                    dec1 = isT0Smaller ? parsedT1.decimals : parsedT0.decimals;
                  }
                }
                const [price0] = sqrtRatioX96ToPrice(data.pool.sqrtPrice, dec0, dec1);
                if (!isNaN(price0) && price0 > 0) {
                  setCurrentPrice(price0);

                  // Calculate and set minPrice and maxPrice right here
                  if (minPrice === 0 && maxPrice === 0) {
                    const minPercent = 10;
                    const maxPercent = 10;
                    const calcMin = Number((price0 * (1 - minPercent / 100)).toPrecision(6));
                    const calcMax = Number((price0 * (1 + maxPercent / 100)).toPrecision(6));
                    updateMinPrice(calcMin);
                    updateMaxPrice(calcMax);
                  }
                }
              }
            })
            .catch(err => console.error('Failed to fetch pool price:', err));
        }
      }

      if (foundParams) setIsFromPool(true);
    }
  }, [params]);

  const feeTiers = [
    { label: '0.01%', sub: 'STABLE', spacing: '1' },
    { label: '0.05%', sub: 'BEST', spacing: '10' },
    { label: '0.3%', sub: 'DEFI', spacing: '60' },
    { label: '1.00%', sub: 'EXOTIC', spacing: '200' },
  ];

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="pb-40 max-w-3xl mx-auto relative group/page w-full">
      {/* Toast notifications */}
      {toast.show && (
        <div className="fixed top-15 right-8 z-[100] flex flex-col gap-4 pointer-events-none">
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            txHash={toast.txHash}
            onClose={dismissToast}
          />
        </div>
      )}

      {/* Abstract Background Mesh */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-primary/5 blur-[150px] rounded-full pointer-events-none group-hover/page:bg-primary/10 transition-colors duration-1000"></div>
      <div className="absolute bottom-40 left-0 w-[300px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>

      {/* Header */}
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none">Mint Position</h1>
        <p className="text-base text-white/50">Provide liquidity across customized price corridors to earn trading fees on LitVM LiteForge</p>
      </div>

      {/* Vertical Block Flow */}
      <div className="space-y-6">

          {isFromPool ? (
            <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-5">
              <div className="flex justify-between items-center border-b border-white/[0.06] pb-4">
                <h3 className="text-base font-bold text-white tracking-tight">Pool Identity</h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono font-semibold">
                  {Number(feeTier) / 10000}% Fee
                </span>
              </div>

               {/* Tokens row */}
               <div className="flex flex-col sm:flex-row gap-4">
                 {/* Token 0 */}
                 <div className="flex-1 bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-row items-center gap-3.5">
                   <div className="w-10 h-10 rounded-full border border-white/10 shrink-0 overflow-hidden shadow-sm">
                     <TokenImage tokenAddress={t0.address} symbol={t0.symbol} className="w-full h-full object-contain" alt={t0.symbol} />
                   </div>
                   <div className="flex flex-col gap-0.5 min-w-0">
                     <div className="flex items-center gap-2">
                       <p className="text-base font-bold tracking-tight text-white">{t0.symbol}</p>
                       <span className="text-xs text-white/40 uppercase font-mono">Token0</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <p className="text-xs font-mono text-white/50 break-all">{t0.address}</p>
                       <button onClick={() => copyToClipboard(t0.address || '', 'token0')} className={`p-1 shrink-0 cursor-pointer transition-colors ${copiedId === 'token0' ? 'text-primary' : 'text-white/20 hover:text-primary'}`}>
                         {copiedId === 'token0' ? <Check size={12} /> : <Copy size={12} />}
                       </button>
                     </div>
                   </div>
                 </div>
                 {/* Token 1 */}
                 <div className="flex-1 bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-row items-center gap-3.5">
                   <div className="w-10 h-10 rounded-full border border-white/10 shrink-0 overflow-hidden shadow-sm">
                     <TokenImage tokenAddress={t1.address} symbol={t1.symbol} className="w-full h-full object-contain" alt={t1.symbol} />
                   </div>
                   <div className="flex flex-col gap-0.5 min-w-0">
                     <div className="flex items-center gap-2">
                       <p className="text-base font-bold tracking-tight text-white">{t1.symbol}</p>
                       <span className="text-xs text-white/40 uppercase font-mono">Token1</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <p className="text-xs font-mono text-white/50 break-all">{t1.address}</p>
                       <button onClick={() => copyToClipboard(t1.address || '', 'token1')} className={`p-1 shrink-0 cursor-pointer transition-colors ${copiedId === 'token1' ? 'text-primary' : 'text-white/20 hover:text-primary'}`}>
                         {copiedId === 'token1' ? <Check size={12} /> : <Copy size={12} />}
                       </button>
                     </div>
                   </div>
                 </div>
               </div>

              {/* Tick Spacing + Hooks Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-black/40 border border-white/[0.08] px-4 py-3 rounded-xl flex items-center justify-between">
                  <span className="text-white/40">Tick Spacing</span>
                  <span className="font-mono font-bold text-white">{tickSpacing}</span>
                </div>
                <div className="bg-black/40 border border-white/[0.08] px-4 py-3 rounded-xl flex items-center justify-between">
                  <span className="text-white/40">Hook Attached</span>
                  <span className="font-mono text-white/70">
                    {hooks === '0x0000000000000000000000000000000000000000' || hooks === '0' ? 'No' : 'Yes'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-5">
              {/* Step 1: Select Pair */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-white/[0.06] pb-3">
                  <h3 className="text-base font-bold text-white tracking-tight">Step 1: Select Pair</h3>
                  <Info size={14} className="text-white/30" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-col gap-3">
                    <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">First Asset</span>
                    <TokenSelector disabled={isFromPool} selectedToken={tokenA} onSelect={setTokenA} tokens={TOKENS} className="w-full" />
                  </div>
                  <div className="bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-col gap-3">
                    <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Second Asset</span>
                    <TokenSelector disabled={isFromPool} selectedToken={tokenB} onSelect={setTokenB} tokens={TOKENS} className="w-full" />
                  </div>
                </div>
              </div>

              {/* Step 2: Fee Tier */}
              <div className="space-y-4 pt-2">
                <div className="flex justify-between items-center border-b border-white/[0.06] pb-3">
                  <h3 className="text-base font-bold text-white tracking-tight">Step 2: Select Fee Tier</h3>
                  <Info size={14} className="text-white/30" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {feeTiers.map((tier) => (
                    <button
                      key={tier.label}
                      disabled={isFromPool && feeTier !== tier.label}
                      onClick={() => setFeeTier(tier.label)}
                      className={`flex flex-col text-left transition-all relative overflow-hidden group rounded-2xl border p-4 ${feeTier === tier.label
                        ? 'bg-primary/10 border-primary text-white shadow-md'
                        : isFromPool
                          ? 'bg-black/30 border-white/[0.05] opacity-40 cursor-not-allowed'
                          : 'bg-black/40 border-white/[0.08] hover:bg-white/[0.03] hover:border-white/20'
                        }`}
                    >
                      <div className="flex items-center justify-between w-full mb-2">
                        <span className="text-xs uppercase font-mono text-white/50">{tier.sub}</span>
                        {feeTier === tier.label && <Check size={14} className="text-primary" />}
                      </div>
                      <span className={`text-xl font-bold tracking-tight block font-mono ${feeTier === tier.label ? 'text-primary' : 'text-white'}`}>{tier.label}</span>
                      <span className="text-xs font-mono text-white/40 mt-2 pt-2 border-t border-white/[0.06] w-full">Spacing: {tier.spacing}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Price Range Section (Technical Corridor) */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-6">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-4">
              <h3 className="text-base font-bold text-white tracking-tight">Select Price Range</h3>
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/[0.08]">
                {['CUSTOM', 'FULL RANGE'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setRangeType(type === 'FULL RANGE' ? 'full' : 'custom')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${(type === 'FULL RANGE' && rangeType === 'full') || (type === 'CUSTOM' && rangeType === 'custom')
                      ? 'bg-primary text-black font-bold shadow-md'
                      : 'text-white/40 hover:text-white'
                      }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {rangeType === 'custom' && (
              <div className="flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <button
                  onClick={() => {
                    setStrategy('stable');
                    if (currentPrice > 0) {
                      const strategyPercent = 5; // Stable: -5% / +5%
                      updateMinPrice(Number((currentPrice * (1 - strategyPercent / 100)).toPrecision(6)));
                      updateMaxPrice(Number((currentPrice * (1 + strategyPercent / 100)).toPrecision(6)));
                    }
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs uppercase tracking-wider border transition-all flex flex-col items-center gap-1 cursor-pointer ${strategy === 'stable'
                    ? 'bg-primary/10 border-primary text-primary font-bold'
                    : 'bg-black/40 border-white/[0.08] text-white/40 hover:text-white/70'
                    }`}
                >
                  <span>STABLE</span>
                  <span className="text-xs opacity-60">-5% / +5%</span>
                </button>
                <button
                  onClick={() => {
                    setStrategy('wide');
                    if (currentPrice > 0) {
                      const minPercent = 50;  // Wide min: -50%
                      const maxPercent = 100; // Wide max: +100%
                      updateMinPrice(Number((currentPrice * (1 - minPercent / 100)).toPrecision(6)));
                      updateMaxPrice(Number((currentPrice * (1 + maxPercent / 100)).toPrecision(6)));
                    }
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs uppercase tracking-wider border transition-all flex flex-col items-center gap-1 cursor-pointer ${strategy === 'wide'
                    ? 'bg-primary/10 border-primary text-primary font-bold'
                    : 'bg-black/40 border-white/[0.08] text-white/40 hover:text-white/70'
                    }`}
                >
                  <span>WIDE</span>
                  <span className="text-xs opacity-60">-50% / +100%</span>
                </button>
              </div>
            )}

            <div className="bg-black/50 border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col md:grid md:grid-cols-[1fr_auto_1fr] relative">
              {/* MIN PRICE */}
              <div className={`p-6 sm:p-7 flex flex-col items-center justify-center gap-3 transition-all ${rangeType === 'full' ? 'opacity-20' : 'opacity-100'}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60"></div>
                  MIN PRICE
                </span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      const step = Math.max(0.000001, (currentPrice || minPrice || 1) * 0.05);
                      updateMinPrice(Math.max(0, Number((minPrice - step).toPrecision(6))));
                    }}
                    disabled={rangeType === 'full'}
                    className="text-white/30 hover:text-primary transition-colors disabled:opacity-0 p-2.5 rounded-xl border border-white/[0.08] hover:border-primary/30 cursor-pointer"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex flex-col items-center">
                    {rangeType === 'full' ? (
                      <span className="text-3xl font-bold text-white tracking-tight font-mono">0</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        className="bg-transparent border-none text-2xl sm:text-3xl font-bold text-center w-full focus:ring-0 text-white outline-none font-mono tracking-tight p-0"
                        value={minPriceInput}
                        onChange={(e) => handleMinPriceInputChange(e.target.value)}
                      />
                    )}
                    <span className="text-xs font-mono text-primary/70 uppercase tracking-wider mt-1">{currentPrice > 0 ? `${(((minPrice - currentPrice) / currentPrice) * 100).toFixed(1)}% OFFSET` : ''}</span>
                  </div>
                  <button
                    onClick={() => {
                      const step = Math.max(0.000001, (currentPrice || minPrice || 1) * 0.05);
                      updateMinPrice(Number((minPrice + step).toPrecision(6)));
                    }}
                    disabled={rangeType === 'full'}
                    className="text-white/30 hover:text-primary transition-colors disabled:opacity-0 p-2.5 rounded-xl border border-white/[0.08] hover:border-primary/30 cursor-pointer"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* CENTRAL ANCHOR */}
              <div className="bg-white/[0.02] border-y md:border-y-0 md:border-x border-white/[0.08] flex flex-col items-center justify-center px-6 py-4 md:py-0">
                <div className="flex flex-col items-center relative gap-1.5">
                  <span className="text-xs font-semibold tracking-wider text-primary uppercase">CURRENT PRICE</span>
                  <p className="text-base font-bold text-white font-mono tracking-tight">{currentPrice > 0 ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—'}</p>
                  <span className="text-xs text-white/40 uppercase tracking-wider">{t1.symbol} per {t0.symbol}</span>
                </div>
              </div>

              {/* MAX PRICE */}
              <div className={`p-6 sm:p-7 flex flex-col items-center justify-center gap-3 transition-all ${rangeType === 'full' ? 'opacity-20' : 'opacity-100'}`}>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/40 flex items-center gap-2">
                  MAX PRICE
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60"></div>
                </span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      const step = Math.max(0.000001, (currentPrice || maxPrice || 1) * 0.05);
                      updateMaxPrice(Math.max(minPrice, Number((maxPrice - step).toPrecision(6))));
                    }}
                    disabled={rangeType === 'full'}
                    className="text-white/30 hover:text-primary transition-colors disabled:opacity-0 p-2.5 rounded-xl border border-white/[0.08] hover:border-primary/30 cursor-pointer"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="flex flex-col items-center">
                    {rangeType === 'full' ? (
                      <Infinity size={32} className="text-white opacity-40 my-1 font-mono" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="bg-transparent border-none text-2xl sm:text-3xl font-bold text-center w-full focus:ring-0 text-white outline-none font-mono tracking-tight p-0"
                          value={maxPriceInput}
                          onChange={(e) => handleMaxPriceInputChange(e.target.value)}
                        />
                        <span className="text-xs font-mono text-primary/70 uppercase tracking-wider mt-1">{currentPrice > 0 ? `+${(((maxPrice - currentPrice) / currentPrice) * 100).toFixed(1)}% OFFSET` : ''}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const step = Math.max(0.000001, (currentPrice || maxPrice || 1) * 0.05);
                      updateMaxPrice(Number((maxPrice + step).toPrecision(6)));
                    }}
                    disabled={rangeType === 'full'}
                    className="text-white/30 hover:text-primary transition-colors disabled:opacity-0 p-2.5 rounded-xl border border-white/[0.08] hover:border-primary/30 cursor-pointer"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Deposit Liquidity (Block Element Underneath) */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-2xl backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-lg font-bold text-white tracking-tight">Deposit Liquidity</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold font-mono">
                {feeTier}
              </span>
            </div>

            <div className="space-y-4">
              {/* Token 0 Deposit Input */}
              <div className="bg-black/40 border border-white/[0.08] p-4.5 rounded-2xl flex flex-col gap-2.5 group focus-within:border-primary/50 transition-all">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Deposit {t0.symbol}</span>
                  <span className="text-xs font-mono text-white/40">Balance: {balance0}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <input
                    className="bg-transparent border-none text-2xl sm:text-3xl font-bold p-0 focus:ring-0 text-white outline-none w-full font-mono tracking-tight"
                    placeholder="0.0"
                    type="text"
                    value={inputAmount}
                    onChange={(e) => calculateAmountsFromAmount0(e.target.value)}
                  />
                  <div className="flex items-center gap-2 bg-white/[0.06] px-3 py-1.5 rounded-xl border border-white/[0.08] shrink-0">
                     <div className="h-5 w-5 rounded-full overflow-hidden shrink-0">
                       <TokenImage tokenAddress={t0.address} symbol={t0.symbol} className="w-full h-full" alt={t0.symbol} />
                     </div>
                     <span className="text-xs font-bold text-white">{t0.symbol}</span>
                  </div>
                </div>
              </div>

              {/* Token 1 Deposit Input */}
              <div className="bg-black/40 border border-white/[0.08] p-4.5 rounded-2xl flex flex-col gap-2.5 group transition-all opacity-70">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase tracking-wider text-white/40 font-semibold">Deposit {t1.symbol} (Calculated)</span>
                  <span className="text-xs font-mono text-white/40">Balance: {balance1}</span>
                </div>
                <div className="flex justify-between items-center gap-3">
                  <input
                    className="bg-transparent border-none text-2xl sm:text-3xl font-bold p-0 focus:ring-0 text-white outline-none cursor-not-allowed font-mono tracking-tight"
                    placeholder="0.0"
                    type="text"
                    value={outputAmount}
                    readOnly
                  />
                  <div className="flex items-center gap-2 bg-white/[0.06] px-3 py-1.5 rounded-xl border border-white/[0.08] shrink-0">
                     <div className="h-5 w-5 rounded-full overflow-hidden shrink-0">
                       <TokenImage tokenAddress={t1.address} symbol={t1.symbol} className="w-full h-full" alt={t1.symbol} />
                     </div>
                     <span className="text-xs font-bold text-white">{t1.symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Position Summary Readout */}
            <div className="space-y-2.5 pt-2 border-t border-white/[0.06] text-xs">
              <div className="flex justify-between items-center text-white/50">
                <span>Pool ID</span>
                <span className="font-mono text-white/70">{poolId ? `${poolId.slice(0, 8)}…${poolId.slice(-6)}` : 'Auto-computed'}</span>
              </div>
              <div className="flex justify-between items-center text-white/50">
                <span>Range Type</span>
                <span className="font-semibold text-white uppercase">{rangeType}</span>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              {!isConnected ? (
                <button
                  onClick={() => open()}
                  className="w-full bg-primary hover:brightness-110 text-black py-4 px-6 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all gold-glow active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  Connect Wallet
                </button>
              ) : (
                <button
                  disabled={isConfirming || isHookInputInvalid || !inputAmount || Number(inputAmount) <= 0}
                  onClick={() => {
                    const feeMap: Record<string, string> = {
                      '0.01%': '100',
                      '0.05%': '500',
                      '0.3%': '3000',
                      '1.00%': '10000'
                    };
                    const rawFee = feeMap[feeTier] || feeTier;
                    const ts = Number(tickSpacing) || 60;

                    let finalMinTick: number;
                    let finalMaxTick: number;

                    if (rangeType === 'full') {
                      finalMinTick = getMinTick(ts);
                      finalMaxTick = getMaxTick(ts);
                    } else {
                      finalMinTick = priceToTick(minPrice, t0.decimals, t1.decimals, ts);
                      finalMaxTick = priceToTick(maxPrice, t0.decimals, t1.decimals, ts);

                      if (finalMinTick >= finalMaxTick) {
                        finalMaxTick = finalMinTick + ts;
                      }
                    }

                    mintPosition({
                      token0: t0.address || '',
                      token1: t1.address || '',
                      feeTier: rawFee,
                      tickSpacing: String(ts),
                      hooks,
                      poolId,
                      amount0: parseUnits(inputAmount, t0.decimals).toString(),
                      amount1: parseUnits(outputAmount || '0', t1.decimals).toString(),
                      minTick: finalMinTick,
                      maxTick: finalMaxTick,
                      sqrtPrice,
                    });
                  }}
                  className={`w-full bg-primary hover:brightness-110 text-black py-4 px-6 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all gold-glow active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg ${(isConfirming || isHookInputInvalid || !inputAmount || Number(inputAmount) <= 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isConfirming ? 'Minting Position...' : 'Mint Position'}
                </button>
              )}
            </div>

          </div>

      </div>
    </div>
  );
}