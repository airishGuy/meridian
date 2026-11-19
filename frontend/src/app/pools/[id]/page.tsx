import { Link, useParams } from 'react-router-dom';
import { ArrowUp, ArrowUpRight, ArrowDownRight, ExternalLink, RefreshCw, Copy, Check, Clock } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { request } from 'graphql-request';
import { GET_POOL_BY_ID, GET_POOL_SWAPS, SUBGRAPH_ENDPOINT } from '../../../lib/queries';
import { TOKENS } from '../../../config/tokens';
import { formatPrice, getDisplayPrice } from '@/utils';
import { createChart, ColorType, LineSeries, LineType } from 'lightweight-charts';
import TokenImage from '../../../components/TokenImage';
import { BLOCK_EXPLORER_URL } from '@/lib/chains';

const getRelativeTime = (timestamp: number) => {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - timestamp);
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const getPriceFromSqrt = (sqrtPriceStr: string, token0: any, token1: any) => {
  if (!token0 || !token1 || !sqrtPriceStr) return 0;
  const sqrtPrice = Number(sqrtPriceStr);
  const decimals0 = Number(token0.decimals);
  const decimals1 = Number(token1.decimals);
  
  const t0Price = Math.pow(sqrtPrice / Math.pow(2, 96), 2) * Math.pow(10, decimals0 - decimals1);
  
  const getPriority = (symbol: string) => {
    const sym = symbol.toUpperCase();
    if (sym === 'USDC') return 100;
    if (sym === 'EURC') return 90;
    if (sym === 'MUSDC') return 80;
    if (sym === 'USDT' || sym === 'DAI') return 70;
    if (sym === 'ETH' || sym === 'WETH') return 50;
    return 0;
  };
  
  const p0 = getPriority(token0.symbol);
  const p1 = getPriority(token1.symbol);
  
  if (p0 > p1) {
    return t0Price > 0 ? 1 / t0Price : 0;
  } else {
    return t0Price;
  }
};

export default function PoolDetailsPage() {
  const { id } = useParams();
  const [pool, setPool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [swapsPage, setSwapsPage] = useState(0);
  const [swapsLoading, setSwapsLoading] = useState(false);

  const [chartSwaps, setChartSwaps] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyPoolId = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => {
    setSwapsPage(0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const fetchPool = async () => {
      try {
        setLoading(true);
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_POOL_BY_ID, { id: id.toLowerCase() });
        setPool(data.pool);
      } catch (error) {
        console.error('Error fetching pool details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPool();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const fetchSwaps = async () => {
      try {
        setSwapsLoading(true);
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_POOL_SWAPS, {
          poolId: id.toLowerCase(),
          first: 11,
          skip: swapsPage * 10
        });
        setSwaps(data.swaps || []);
      } catch (error) {
        console.error('Error fetching swaps:', error);
      } finally {
        setSwapsLoading(false);
      }
    };
    fetchSwaps();
  }, [id, swapsPage]);

  useEffect(() => {
    if (!id) return;
    const fetchChartData = async () => {
      try {
        setChartLoading(true);
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_POOL_SWAPS, {
          poolId: id.toLowerCase(),
          first: 100,
          skip: 0
        });
        setChartSwaps(data.swaps || []);
      } catch (error) {
        console.error('Error fetching chart swaps:', error);
      } finally {
        setChartLoading(false);
      }
    };
    fetchChartData();
  }, [id]);

  const reversedSwaps = [...chartSwaps].reverse();
  const pointsData = reversedSwaps.map((swap: any, idx: number) => {
    const price = getPriceFromSqrt(swap.sqrtPriceX96, pool?.token0, pool?.token1);
    const date = new Date(Number(swap.timestamp) * 1000);
    return {
      price,
      timestamp: Number(swap.timestamp),
      date,
      index: idx
    };
  });

  const currentPriceVal = pool ? getPriceFromSqrt(pool.sqrtPrice || '0', pool.token0, pool.token1) : 0;
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current || chartSwaps.length === 0 || !pool) return;

    const container = chartContainerRef.current;
    
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255, 255, 255, 0.4)',
        fontFamily: 'Montserrat, Figtree, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor: 'rgba(255, 255, 255, 0.4)',
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(255,255,255,0.15)',
          width: 1,
          style: 3,
          labelVisible: false,
        },
        horzLine: {
          color: 'rgba(255,255,255,0.15)',
          width: 1,
          style: 3,
          labelVisible: false,
        },
      },
      handleScale: false,
      handleScroll: false,
      width: container.clientWidth || 500,
      height: container.clientHeight || 160,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#F472B6',
      lineWidth: 1,                 // thin line
      lineType: LineType.Simple,    // straight segments between points = zigzag
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: '#F472B6',
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat: {
        type: 'price',
        precision: 6,
        minMove: 0.000001,
      },
    });

    const chartData: { time: number; value: number }[] = [];
  let lastTime = 0;
  pointsData.forEach((pt) => {
    let currentTime = pt.timestamp;
    if (currentTime <= lastTime) {
      currentTime = lastTime + 1; // times must be strictly ascending
    }
    chartData.push({ time: currentTime, value: pt.price });
    lastTime = currentTime;
  });

  lineSeries.setData(chartData as any);
  chart.timeScale().fitContent();

  chart.subscribeCrosshairMove((param) => {
    if (!param.time) {
      setHoveredPoint(null);
      return;
    }
    const timeVal = Number(param.time);
    const pt = chartData.find((d) => d.time === timeVal);
    if (pt) {
      setHoveredPoint({
        price: pt.value,
        date: new Date(pt.time * 1000),
      });
    } else {
      setHoveredPoint(null);
    }
  });


    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [chartSwaps, pool]);

  const token0Address = pool?.token0?.id || "0x0000000000000000000000000000000000000000";
  const token1Address = pool?.token1?.id || "0x0000000000000000000000000000000000000000";

  const getCurrencyParam = (address: string) => {
    return (address === "0" || address === "0x0000000000000000000000000000000000000000") ? "NATIVE" : address;
  };



  const formatCurrency = (val: string | number | undefined) => {
    if (val === undefined || val === null || isNaN(Number(val))) return '0.00 tLTC';
    return `${new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(Number(val))} tLTC`;
  };

  const currentDayStart = Math.floor(Date.now() / 1000 / 86400) * 86400;
  const sevenDaysAgo = currentDayStart - 86400 * 7;

  const latestDay = pool?.poolDayData?.[0];
  const isRecent24h = latestDay && Number(latestDay.date) >= currentDayStart - 86400;
  
  const vol24h = isRecent24h ? Number(latestDay.volumeUSD) : 0;
  const fees24h = isRecent24h ? Number(latestDay.feesUSD) : 0;

  const vol7d = pool?.poolDayData?.reduce((acc: number, day: any) => {
    return Number(day.date) >= sevenDaysAgo ? acc + Number(day.volumeUSD) : acc;
  }, 0) || 0;
  const fees7d = pool?.poolDayData?.reduce((acc: number, day: any) => {
    return Number(day.date) >= sevenDaysAgo ? acc + Number(day.feesUSD) : acc;
  }, 0) || 0;

  const feePercent = pool?.feeTier ? (Number(pool.feeTier) / 10000).toFixed(2) + '%' : '0.00%';

  const addLiquidityPath = `/positions/create/currency0=${getCurrencyParam(token0Address)}&currency1=${getCurrencyParam(token1Address)}&fee=${pool?.feeTier || ''}&tickSpacing=${pool?.tickSpacing || ''}&hooks=${pool?.hooks || '0x0000000000000000000000000000000000000000'}&poolId=${id}`;



  return (
    <div className="pb-40 relative z-10 flex flex-col items-center w-full">
      <main className="w-full">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="flex -space-x-3.5">
              <div className="w-14 h-14 rounded-full border-2 border-black overflow-hidden bg-black flex items-center justify-center relative z-[2]">
                {loading ? (
                  <div className="w-full h-full bg-white/5 animate-pulse" />
                ) : (
                  <TokenImage
                    tokenAddress={token0Address}
                    symbol={pool?.token0?.symbol}
                    className="w-full h-full object-contain"
                    alt={pool?.token0?.symbol || 'token0'}
                  />
                )}
              </div>
              <div className="w-14 h-14 rounded-full border-2 border-black overflow-hidden bg-black flex items-center justify-center relative z-[1]">
                {loading ? (
                  <div className="w-full h-full bg-white/5 animate-pulse" />
                ) : (
                  <TokenImage
                    tokenAddress={token1Address}
                    symbol={pool?.token1?.symbol}
                    className="w-full h-full object-contain"
                    alt={pool?.token1?.symbol || 'token1'}
                  />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                {loading ? (
                  <div className="h-8 w-44 bg-white/5 rounded animate-pulse" />
                ) : (
                  <>
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                      {pool?.token0?.symbol} / {pool?.token1?.symbol}
                    </h1>
                    <span className="bg-primary/10 border border-primary/25 text-primary px-3 py-0.5 rounded-full text-xs font-mono font-bold">{feePercent}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                {loading ? (
                  <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
                    {getDisplayPrice(pool)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-white/40 font-medium">Pool ID:</span>
                <span className="text-xs font-mono text-white/60">
                  {id ? `${id.slice(0, 10)}...${id.slice(-8)}` : 'UNKNOWN'}
                </span>
                {id && (
                  <button
                    onClick={handleCopyPoolId}
                    className="p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer text-white/40 hover:text-white flex items-center justify-center"
                    title="Copy Pool ID"
                  >
                    {copied ? (
                      <Check size={12} className="text-emerald-400" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <Link 
              to={`/?from=${token0Address}&to=${token1Address}`}
              className="flex-1 md:flex-none border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-2xl flex items-center justify-center transition-all active:scale-[0.98]"
            >
              Swap
            </Link>
            <Link
              to={addLiquidityPath}
              className="flex-1 md:flex-none bg-primary hover:brightness-110 text-black px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-2xl transition-all gold-glow active:scale-[0.98] flex items-center justify-center text-center shadow-lg"
            >
              Add Liquidity
            </Link>
          </div>
        </header>

        {/* Compact Stat Strip (Smaller sleek stat boxes) */}
        <div className="flex flex-wrap items-center gap-2.5 mb-6">
          {[
            { label: '24h Vol', val: formatCurrency(vol24h) },
            { label: '7d Vol', val: formatCurrency(vol7d) },
            { label: 'All-Time Vol', val: formatCurrency(pool?.volumeUSD) },
            { label: '24h Fees', val: formatCurrency(fees24h) },
            { label: '7d Fees', val: formatCurrency(fees7d) },
            { label: 'Total TVL', val: formatCurrency(pool?.totalValueLockedUSD) }
          ].map((m, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-all duration-200 shadow-sm backdrop-blur-sm"
            >
              <span className="text-xs font-medium text-white/50">{m.label}:</span>
              {loading ? (
                <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
              ) : (
                <span className="text-sm font-bold font-mono text-white">{m.val}</span>
              )}
            </div>
          ))}
        </div>

        {/* Bento Grid for Analytics */}
        <div className="grid grid-cols-12 gap-6 mb-8">
          {/* Price Chart Module */}
          <div className="col-span-12 lg:col-span-8 bg-[#0c0c0e]/95 border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col justify-between min-h-[380px]">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold uppercase tracking-wider text-white/60">Price History</span>
                  {chartLoading && <RefreshCw size={14} className="text-primary animate-spin" />}
                </div>
              </div>

              {/* Display Hovered or Current Price */}
              <div className="mb-4">
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
                  {hoveredPoint ? (
                    `$${hoveredPoint.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  ) : currentPriceVal ? (
                    `$${currentPriceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                  ) : (
                    '—'
                  )}
                </p>
                <p className="text-xs text-white/40 font-mono mt-1">
                  {hoveredPoint ? (
                    hoveredPoint.date.toLocaleString()
                  ) : (
                    ''
                  )}
                </p>
              </div>
            </div>

            {/* Chart Container */}
            <div className="relative flex-1 min-h-[220px] flex items-end">
              {chartLoading && chartSwaps.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white/40 text-sm flex items-center gap-2">
                    <RefreshCw size={16} className="animate-spin text-primary" />
                    Loading Chart Data...
                  </div>
                </div>
              ) : chartSwaps.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-white/40 text-sm font-medium">
                    No swap history available for this pool
                  </div>
                </div>
              ) : (
                <div ref={chartContainerRef} className="w-full h-full" />
              )}
            </div>
          </div>

          {/* Stats Column */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            {/* TVL Card */}
            <div className="bg-[#0c0c0e]/95 border border-white/[0.08] rounded-3xl p-6 shadow-2xl backdrop-blur-md flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">Total Value Locked</p>
              {loading ? (
                <div className="h-8 w-32 bg-white/5 rounded animate-pulse mt-1" />
              ) : (
                <p className="text-3xl font-extrabold font-mono tracking-tight text-white">
                  {formatCurrency(pool?.totalValueLockedUSD)}
                </p>
              )}
            </div>

            {/* Pool Balances */}
            <div className="bg-[#0c0c0e]/95 border border-white/[0.08] rounded-3xl p-6 shadow-2xl backdrop-blur-md border-l-4 border-l-primary flex flex-col justify-center flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Pool Reserves</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border border-white/10 bg-black flex items-center justify-center overflow-hidden shadow-sm">
                      <TokenImage
                        tokenAddress={token0Address}
                        symbol={pool?.token0?.symbol}
                        className="w-full h-full object-contain"
                        alt={pool?.token0?.symbol || 'token0'}
                      />
                    </div>
                    <span className="text-sm font-bold text-white">
                      {loading ? '...' : pool?.token0?.symbol}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-white font-semibold">
                    {loading ? '...' : Number(pool?.totalValueLockedToken0 || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full border border-white/10 bg-black flex items-center justify-center overflow-hidden shadow-sm">
                      <TokenImage
                        tokenAddress={token1Address}
                        symbol={pool?.token1?.symbol}
                        className="w-full h-full object-contain"
                        alt={pool?.token1?.symbol || 'token1'}
                      />
                    </div>
                    <span className="text-sm font-bold text-white">
                      {loading ? '...' : pool?.token1?.symbol}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-white font-semibold">
                    {loading ? '...' : Number(pool?.totalValueLockedToken1 || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Swaps Table - Redesigned to match Profile Activity */}
        <section className="bg-black/50 rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-sm">
          <div className="px-6 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-bold text-white tracking-tight">Recent Trades</h3>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40 font-mono">
                {swaps.length} trades recorded
              </span>
              {chartLoading && <RefreshCw size={12} className="text-white/30 animate-spin" />}
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[100px_1fr_120px_140px_140px_110px] gap-4 px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0a]">
            <div>Time</div>
            <div>Type</div>
            <div className="text-right">Total (tLTC)</div>
            <div className="text-right"><span className="token-symbol">{pool?.token0?.symbol}</span></div>
            <div className="text-right"><span className="token-symbol">{pool?.token1?.symbol}</span></div>
            <div className="text-right">Txn</div>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {loading || swapsLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-[100px_1fr_120px_140px_140px_110px] gap-4 px-6 py-3.5 items-center animate-pulse">
                  <div className="h-4 bg-white/5 rounded w-14" />
                  <div className="h-4 bg-white/5 rounded w-28" />
                  <div className="h-4 bg-white/5 rounded w-16 md:ml-auto" />
                  <div className="h-4 bg-white/5 rounded w-20 md:ml-auto" />
                  <div className="h-4 bg-white/5 rounded w-20 md:ml-auto" />
                  <div className="h-4 bg-white/5 rounded w-16 md:ml-auto" />
                </div>
              ))
            ) : swaps && swaps.length > 0 ? (
              swaps.slice(0, 10).map((row: any) => {
                const isBuy = Number(row.amount0) < 0;
                const relTime = getRelativeTime(Number(row.timestamp));
                const fullTime = new Date(Number(row.timestamp) * 1000).toLocaleString();
                const amt0 = Math.abs(Number(row.amount0));
                const amt1 = Math.abs(Number(row.amount1));

                return (
                  <div 
                    key={row.id} 
                    className="grid grid-cols-1 md:grid-cols-[100px_1fr_120px_140px_140px_110px] gap-3 md:gap-4 px-6 py-3.5 items-center hover:bg-white/[0.035] transition-colors group"
                  >
                    {/* Time */}
                    <div className="flex md:block justify-between items-center text-xs text-white/50 font-mono" title={fullTime}>
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Time</span>
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} className="text-white/30 hidden md:inline" />
                        {relTime}
                      </span>
                    </div>

                    {/* Type & Direction */}
                    <div className="flex md:block justify-between items-center">
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Type</span>
                      <div className="flex items-center gap-2">
                        {isBuy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase">
                            <ArrowUpRight size={13} className="stroke-[2.5]" />
                            buy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/25 uppercase">
                            <ArrowDownRight size={13} className="stroke-[2.5]" />
                            sell
                          </span>
                        )}
                        <span className="text-xs text-white/70 font-medium">
                          {isBuy ? (
                            <span><span className="token-symbol text-white/50">{pool.token1.symbol}</span> → <span className="token-symbol text-emerald-400 font-semibold">{pool.token0.symbol}</span></span>
                          ) : (
                            <span><span className="token-symbol text-white/50">{pool.token0.symbol}</span> → <span className="token-symbol text-rose-400 font-semibold">{pool.token1.symbol}</span></span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Total USD */}
                    <div className="flex md:block justify-between items-center md:text-right">
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Total (tLTC)</span>
                      <span className={`text-sm font-bold font-mono ${isBuy ? 'text-emerald-400' : 'text-white/90'}`}>
                        {formatCurrency(row.amountUSD)}
                      </span>
                    </div>

                    {/* Token 0 Amount */}
                    <div className="flex md:block justify-between items-center md:text-right">
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans"><span className="token-symbol">{pool.token0.symbol}</span></span>
                      <span className={`text-xs font-mono font-medium ${isBuy ? 'text-emerald-400' : 'text-rose-400/80'}`}>
                        {isBuy ? '+' : '-'}{amt0.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="token-symbol text-white/40">{pool.token0.symbol}</span>
                      </span>
                    </div>

                    {/* Token 1 Amount */}
                    <div className="flex md:block justify-between items-center md:text-right">
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans"><span className="token-symbol">{pool.token1.symbol}</span></span>
                      <span className={`text-xs font-mono font-medium ${!isBuy ? 'text-emerald-400' : 'text-rose-400/80'}`}>
                        {!isBuy ? '+' : '-'}{amt1.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="token-symbol text-white/40">{pool.token1.symbol}</span>
                      </span>
                    </div>

                    {/* Txn Hash */}
                    <div className="flex md:block justify-between items-center md:text-right">
                      <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Txn</span>
                      <a
                        href={`${BLOCK_EXPLORER_URL}/tx/${row.transaction.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-white/50 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all rounded-sm group/hash"
                      >
                        {row.transaction.id.slice(0, 4)}...{row.transaction.id.slice(-4)}
                        <ExternalLink size={10} className="text-primary/70 shrink-0" />
                      </a>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-14 text-center text-white/30 text-xs">
                no trades found for this pool
              </div>
            )}
          </div>

          <div className="p-4 bg-white/[0.01] border-t border-white/[0.06] flex items-center justify-between px-6">
            <span className="text-xs text-white/40 font-mono">
              Page {swapsPage + 1}
            </span>
            <div className="flex gap-3">
              <button
                disabled={swapsPage === 0 || swapsLoading}
                onClick={() => setSwapsPage(prev => Math.max(0, prev - 1))}
                className="border border-white/10 text-white px-5 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                Prev
              </button>
              <button
                disabled={swaps.length <= 10 || swapsLoading}
                onClick={() => setSwapsPage(prev => prev + 1)}
                className="border border-white/10 text-white px-5 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
