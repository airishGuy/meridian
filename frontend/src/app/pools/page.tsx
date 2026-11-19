import { Link, useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { request } from 'graphql-request';
import { GET_POOLS, GET_GLOBAL_DATA, SUBGRAPH_ENDPOINT } from '../../lib/queries';
import { TOKENS } from '../../config/tokens';
import { redis } from '../../lib/redis';
import TokenImage from '../../components/TokenImage';
import { useActiveChain } from '@/context/ActiveChainContext';

const formatLargeCurrency = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00 tLTC';
  return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(val))} tLTC`;
};

const formatNumber = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '0';
  return new Intl.NumberFormat('en-US').format(Number(val));
};

const PoolRowSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-[2fr_0.7fr_1fr_1fr_1fr_auto] p-6 items-center border-b border-white/[0.05] animate-pulse">
    {/* Pool */}
    <div className="flex items-center gap-6">
      <div className="flex -space-x-4">
        <div className="w-12 h-12 rounded-full border-[3px] border-black bg-white/5 relative z-[2]" />
        <div className="w-12 h-12 rounded-full border-[3px] border-black bg-white/5 relative z-[1]" />
      </div>
      <div className="h-5 w-24 bg-white/5 rounded" />
    </div>
    {/* Fee Tier */}
    <div className="flex md:block justify-between items-center mt-6 md:mt-0">
      <span className="md:hidden text-xs text-white/20 uppercase tracking-wider">Fee Tier</span>
      <div className="h-7 w-14 bg-white/5 rounded float-right" />
    </div>
    {/* Liquidity */}
    <div className="flex md:block justify-between items-center mt-2 md:mt-0">
      <span className="md:hidden text-xs text-white/20 uppercase tracking-wider">Liquidity</span>
      <div className="h-5 w-20 bg-white/5 rounded md:ml-auto" />
    </div>
    {/* 1D Vol */}
    <div className="flex md:block justify-between items-center mt-2 md:mt-0">
      <span className="md:hidden text-xs text-white/20 uppercase tracking-wider">1D Vol</span>
      <div className="h-5 w-20 bg-white/5 rounded md:ml-auto" />
    </div>
    {/* 1D Fees */}
    <div className="flex md:block justify-between items-center mt-2 md:mt-0">
      <span className="md:hidden text-xs text-white/20 uppercase tracking-wider">1D Fees</span>
      <div className="h-5 w-20 bg-white/5 rounded md:ml-auto" />
    </div>
    {/* Action */}
    <div className="flex md:block justify-end items-center mt-2 md:mt-0 ml-4">
      <div className="h-8 w-24 bg-white/5 rounded md:ml-auto" />
    </div>
  </div>
);

export default function PoolsPage() {
  const navigate = useNavigate();
  const { subgraphEndpoint } = useActiveChain();
  const [addressSearch, setAddressSearch] = useState('');
  const [pools, setPools] = useState<any[]>([]);
  const [globalData, setGlobalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // const fetchData = async () => {
    //   try {
    //     setLoading(true);
        
    //     let cachedPools: any[] | null = null;
    //     try {
    //       cachedPools = await redis.get<any[]>("meridian:pools");
    //       if (cachedPools && cachedPools.length > 0) {
    //         setPools(cachedPools);
    //         console.log("Instantly set pools from Cache:", cachedPools);
    //       }
    //     } catch (e) {
    //       console.error("Redis fetch failed", e);
    //     }

    //     // Always fetch from subgraph to keep data fresh (Stale-While-Revalidate pattern)
    //     const fetchPoolsPromise = request(SUBGRAPH_ENDPOINT, GET_POOLS).then(async (res: any) => {
    //       try { 
    //         await redis.set("meridian:pools", res.pools); 
    //         console.log("Updated Redis cache with fresh pools");
    //       } catch(e) {}
    //       return res;
    //     });

    //     const [poolsRes, globalRes] = await Promise.all([
    //       fetchPoolsPromise,
    //       request(SUBGRAPH_ENDPOINT, GET_GLOBAL_DATA)
    //     ]) as [any, any];
        
    //     // Update state with fresh data from subgraph
    //     setPools(poolsRes.pools || []);
    //     console.log("Fetched and updated pools from Subgraph:", poolsRes.pools);
        
    //     setGlobalData(globalRes);
    //   } catch (error) {
    //     console.error('Error fetching data:', error);
    //   } finally {
    //     setLoading(false);
    //   }
    // };
    
    const fetchData = async () => {
  try {
    setLoading(true)

    const [cachedPools, poolsRes, globalRes] = await Promise.all([
      Promise.race([
        redis.get<any[]>("meridian:pools"),
        new Promise((_, reject) => setTimeout(() => reject(), 2000))
      ]).catch(() => null),
      request(subgraphEndpoint || SUBGRAPH_ENDPOINT, GET_POOLS),
      request(subgraphEndpoint || SUBGRAPH_ENDPOINT, GET_GLOBAL_DATA)
    ]) as [any, any, any]

    // Show cache instantly if subgraph is slow (optional)
    if (cachedPools?.length) setPools(cachedPools)

    // Fresh subgraph data always wins
    setPools(poolsRes.pools || [])
    setGlobalData(globalRes)

    // Update cache in background
    redis.set("meridian:pools", poolsRes.pools).catch(() => {})

  } catch (error) {
    console.error('Error fetching data:', error)
  } finally {
    setLoading(false)
  }
}
    fetchData();
  }, [subgraphEndpoint]);

  const computePoolId = (poolKey: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }) => {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [
        poolKey.currency0,
        poolKey.currency1,
        poolKey.fee,
        poolKey.tickSpacing,
        poolKey.hooks,
      ]
    );
    return ethers.keccak256(encoded);
  };

  const filteredPools = pools.filter(pool =>
    !addressSearch ||
    pool.token0.id.toLowerCase().includes(addressSearch.toLowerCase()) ||
    pool.token1.id.toLowerCase().includes(addressSearch.toLowerCase()) ||
    pool.token0.symbol.toLowerCase().includes(addressSearch.toLowerCase()) ||
    pool.token1.symbol.toLowerCase().includes(addressSearch.toLowerCase())
  );

  const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400;
  const hasGlobalTodayData = globalData?.uniswapDayDatas?.[0]?.date === currentDayTimestamp;
  const globalVol1d = hasGlobalTodayData ? globalData?.uniswapDayDatas?.[0]?.volumeUSD : 0;
  const globalFees1d = hasGlobalTodayData ? globalData?.uniswapDayDatas?.[0]?.feesUSD : 0;


  return (
    <div className="pb-40 relative z-10 w-full max-w-7xl mx-auto">

      {/* Header & Primary CTA */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Liquidity Pools</h1>
          <p className="text-base text-white/50 mt-1">
            Provide liquidity, earn trading fees on LitVM LiteForge, and explore active markets.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/pools/create"
            className="inline-flex items-center gap-2 bg-primary hover:brightness-110 text-black px-6 py-3 rounded-2xl text-base font-bold transition-all duration-200 gold-glow active:scale-[0.98] shadow-lg"
          >
            <Plus size={18} strokeWidth={2.5} />
            Create Pool
          </Link>
        </div>
      </div>

      {/* Compact Stat Strip (Smaller sleek stat boxes) */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        {[
          { label: 'Total TVL', value: formatLargeCurrency(globalData?.poolManagers?.[0]?.totalValueLockedUSD) },
          { label: '24h Volume', value: formatLargeCurrency(globalVol1d) },
          { label: 'All-Time Volume', value: formatLargeCurrency(globalData?.poolManagers?.[0]?.totalVolumeUSD) },
          { label: '24h Fees', value: formatLargeCurrency(globalFees1d) },
          { label: 'Pools', value: formatNumber(globalData?.poolManagers?.[0]?.poolCount) },
          { label: 'Total Txns', value: formatNumber(globalData?.poolManagers?.[0]?.txCount) },
        ].map((card) => (
          <div
            key={card.label}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/20 transition-all duration-200 shadow-sm backdrop-blur-sm"
          >
            <span className="text-xs text-white/50 font-medium">{card.label}:</span>
            {loading ? (
              <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
            ) : (
              <span className="text-sm font-bold font-mono text-white">
                {card.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative group w-full max-w-md">
          <input
            type="text"
            placeholder="Search by token symbol or address..."
            value={addressSearch}
            onChange={(e) => setAddressSearch(e.target.value)}
            className="w-full bg-[#0a0a0c]/90 border border-white/10 rounded-2xl px-12 py-3.5 text-base text-white placeholder:text-white/40 focus:outline-none focus:border-primary/60 focus:bg-[#0a0a0c] transition-all shadow-inner"
          />
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-primary transition-colors" />
        </div>
        <div className="text-sm text-white/50 font-mono self-end sm:self-center font-medium">
          {filteredPools.length} {filteredPools.length === 1 ? 'Pool' : 'Pools'} Active
        </div>
      </div>

      {/* Pools Table (Standard DEX Layout, matches Activity design aesthetic) */}
      <div className="bg-black/60 rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-md">

        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[56px_2.2fr_1.2fr_1.2fr_1fr_150px] gap-4 px-6 py-4 text-sm font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0c]">
          <div>#</div>
          <div>Pool Pair</div>
          <div className="text-right">TVL</div>
          <div className="text-right">24h Volume</div>
          <div className="text-right">24h Fees</div>
          <div className="text-right">Action</div>
        </div>

        {/* Pool Rows */}
        {loading && pools.length === 0 ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="grid grid-cols-[56px_2.2fr_1.2fr_1.2fr_1fr_150px] gap-4 px-6 py-5 border-b border-white/[0.04] animate-pulse last:border-0 items-center">
              <div className="h-4 w-4 bg-white/5 rounded" />
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-black" />
                  <div className="w-10 h-10 rounded-full bg-white/5 border-2 border-black" />
                </div>
                <div className="h-5 w-32 bg-white/10 rounded" />
              </div>
              <div className="h-5 w-20 bg-white/5 rounded ml-auto" />
              <div className="h-5 w-20 bg-white/5 rounded ml-auto" />
              <div className="h-5 w-16 bg-white/5 rounded ml-auto" />
              <div className="h-9 w-28 bg-white/5 rounded-xl ml-auto" />
            </div>
          ))
        ) : (
          filteredPools.map((pool, index) => {
            const computedId = computePoolId({
              currency0: pool.token0.id,
              currency1: pool.token1.id,
              fee: parseInt(pool.feeTier),
              tickSpacing: parseInt(pool.tickSpacing),
              hooks: pool.hooks
            });

            const formatCurrency = (val: string) => {
              if (!val || isNaN(Number(val))) return '0.00 tLTC';
              return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(val))} tLTC`;
            };

            const tvlFormatted = formatCurrency(pool.totalValueLockedUSD);
            const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400;
            const hasTodayData = pool.poolDayData && pool.poolDayData.length > 0 && pool.poolDayData[0].date === currentDayTimestamp;
            const vol1d = hasTodayData ? formatCurrency(pool.poolDayData[0].volumeUSD) : '0.00 tLTC';
            const fee1d = hasTodayData ? formatCurrency(pool.poolDayData[0].feesUSD) : '0.00 tLTC';
            const feePercent = (parseInt(pool.feeTier) / 10000).toFixed(2) + '%';

            const getCurrencyParam = (address: string) =>
              (address === '0' || address === '0x0000000000000000000000000000000000000000') ? 'NATIVE' : address;

            const addLiquidityPath = `/positions/create/currency0=${getCurrencyParam(pool.token0.id)}&currency1=${getCurrencyParam(pool.token1.id)}&fee=${pool.feeTier || ''}&tickSpacing=${pool.tickSpacing || ''}&hooks=${pool.hooks || '0x0000000000000000000000000000000000000000'}&poolId=${computedId}&sqrtPrice=${pool.sqrtPrice || '0'}`;

            return (
              <div
                key={pool.id}
                onClick={() => navigate(`/pools/${computedId}`)}
                className="group relative hidden md:grid grid-cols-[56px_2.2fr_1.2fr_1.2fr_1fr_150px] gap-4 px-6 py-4.5 items-center border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors last:border-0 cursor-pointer"
              >
                {/* Rank */}
                <span className="text-sm text-white/40 font-mono font-medium">{index + 1}</span>

                {/* Pool identity */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex -space-x-3 shrink-0">
                    <div className="w-9 h-9 rounded-full border-2 border-black bg-black overflow-hidden shadow-md">
                      <TokenImage
                        tokenAddress={pool.token0.id}
                        symbol={pool.token0.symbol}
                        className="w-full h-full object-contain"
                        alt={pool.token0.symbol || 'token0'}
                      />
                    </div>
                    <div className="w-9 h-9 rounded-full border-2 border-black bg-black overflow-hidden shadow-md">
                      <TokenImage
                        tokenAddress={pool.token1.id}
                        symbol={pool.token1.symbol}
                        className="w-full h-full object-contain"
                        alt={pool.token1.symbol || 'token1'}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-base font-bold text-white tracking-tight truncate group-hover:text-primary transition-colors">
                      {pool.token0.symbol} / {pool.token1.symbol}
                    </span>
                    <span className="shrink-0 text-xs bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full font-mono font-semibold">
                      {feePercent}
                    </span>
                  </div>
                </div>

                {/* TVL */}
                <div className="text-right">
                  <span className="text-base text-white font-mono font-semibold">{tvlFormatted}</span>
                </div>

                {/* 1D Vol */}
                <div className="text-right">
                  <span className="text-base text-white/80 font-mono font-medium">{vol1d}</span>
                </div>

                {/* 1D Fees */}
                <div className="text-right">
                  <span className="text-base text-white/60 font-mono font-medium">{fee1d}</span>
                </div>

                {/* Action */}
                <div className="flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(addLiquidityPath); }}
                    className="bg-primary hover:brightness-110 text-black px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.98] shadow-sm"
                  >
                    + Deposit
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Mobile cards */}
        {!loading && filteredPools.map((pool, index) => {
          const computedId = computePoolId({
            currency0: pool.token0.id,
            currency1: pool.token1.id,
            fee: parseInt(pool.feeTier),
            tickSpacing: parseInt(pool.tickSpacing),
            hooks: pool.hooks
          });
          const formatCurrency = (val: string | number | undefined) => {
            if (val === undefined || val === null || isNaN(Number(val))) return '0.00 tLTC';
            return `${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(Number(val))} tLTC`;
          };
          const tvlFormatted = formatCurrency(pool.totalValueLockedUSD);
          const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400;
          const hasTodayData = pool.poolDayData && pool.poolDayData.length > 0 && pool.poolDayData[0].date === currentDayTimestamp;
          const vol1d = hasTodayData ? formatCurrency(pool.poolDayData[0].volumeUSD) : '0.00 tLTC';
          const fee1d = hasTodayData ? formatCurrency(pool.poolDayData[0].feesUSD) : '0.00 tLTC';
          const feePercent = (parseInt(pool.feeTier) / 10000).toFixed(2) + '%';
          const getCurrencyParam = (address: string) =>
            (address === '0' || address === '0x0000000000000000000000000000000000000000') ? 'NATIVE' : address;
          const addLiquidityPath = `/positions/create/currency0=${getCurrencyParam(pool.token0.id)}&currency1=${getCurrencyParam(pool.token1.id)}&fee=${pool.feeTier || ''}&tickSpacing=${pool.tickSpacing || ''}&hooks=${pool.hooks || '0x0000000000000000000000000000000000000000'}&poolId=${computedId}&sqrtPrice=${pool.sqrtPrice || '0'}`;

          return (
            <div
              key={`m-${pool.id}`}
              onClick={() => navigate(`/pools/${computedId}`)}
              className="md:hidden flex flex-col gap-4 px-5 py-5 border-b border-white/[0.06] hover:bg-white/[0.04] transition-all last:border-0 cursor-pointer"
            >
              {/* Top row: logos + name + fee */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2.5 shrink-0">
                    <div className="w-9 h-9 rounded-full border-2 border-black bg-black overflow-hidden">
                      <TokenImage
                        tokenAddress={pool.token0.id}
                        symbol={pool.token0.symbol}
                        className="w-full h-full object-contain"
                        alt={pool.token0.symbol || 'token0'}
                      />
                    </div>
                    <div className="w-9 h-9 rounded-full border-2 border-black bg-black overflow-hidden">
                      <TokenImage
                        tokenAddress={pool.token1.id}
                        symbol={pool.token1.symbol}
                        className="w-full h-full object-contain"
                        alt={pool.token1.symbol || 'token1'}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-white">{pool.token0.symbol} / {pool.token1.symbol}</span>
                    <span className="text-xs bg-primary/10 border border-primary/25 text-primary px-2 py-0.5 rounded-full font-mono font-semibold">{feePercent}</span>
                  </div>
                </div>
                <span className="text-xs text-white/40 font-mono">#{index + 1}</span>
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[['TVL', tvlFormatted], ['24h Vol', vol1d], ['24h Fees', fee1d]].map(([label, val]) => (
                  <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
                    <p className="text-xs uppercase tracking-wider text-white/50 mb-1">{label}</p>
                    <p className="text-sm font-mono text-white font-bold">{val}</p>
                  </div>
                ))}
              </div>
              {/* Action */}
              <button
                onClick={(e) => { e.stopPropagation(); navigate(addLiquidityPath); }}
                className="w-full bg-primary hover:brightness-110 text-black py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer"
              >
                + Deposit Liquidity
              </button>
            </div>
          );
        })}

        {!loading && filteredPools.length === 0 && (
          <div className="py-24 text-center text-white/40 text-base">
            No liquidity pools found matching your search.
          </div>
        )}
      </div>
    </div>
  );
}
