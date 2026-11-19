import { useState, useEffect } from 'react';
import { ExternalLink, Users, Loader2, Search, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { request } from 'graphql-request';
import { 
  GET_GLOBAL_DATA, 
  GET_SWAPS, 
  GET_GLOBAL_TRANSACTIONS, 
  GET_GLOBAL_MODIFY_LIQUIDITIES, 
  SUBGRAPH_ENDPOINT,
} from '../../lib/queries';
import { BLOCK_EXPLORER_URL } from '@/lib/chains';


const GET_ALL_SWAPS = `
  query GetSwaps($lastTimestamp: BigInt!) {
    swaps(first: 1000, where: { timestamp_gt: $lastTimestamp }, orderBy: timestamp, orderDirection: asc) {
      timestamp
      sender
      origin
    }
  }
`;

const GET_ALL_MODIFY_LIQUIDITIES = `
  query GetModifyLiquidities($lastTimestamp: BigInt!) {
    modifyLiquidities(first: 1000, where: { timestamp_gt: $lastTimestamp }, orderBy: timestamp, orderDirection: asc) {
      timestamp
      sender
      origin
    }
  }
`;

const GET_ALL_POSITIONS = `
  query GetPositions($lastTimestamp: BigInt!) {
    positions(first: 1000, where: { createdAtTimestamp_gt: $lastTimestamp }, orderBy: createdAtTimestamp, orderDirection: asc) {
      createdAtTimestamp
      owner
      origin
    }
  }
`;



interface ActivityItem {
  id: string;
  hash: string;
  timestamp: number;
  type: string;
  usd: number | string;
  token0Amount?: string;
  token1Amount?: string;
  isToken0Negative?: boolean;
  isToken1Negative?: boolean;
}

const formatLargeCurrency = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00 tLTC';
  return `${new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 2 }).format(Number(val))} tLTC`;
};

const formatCurrency = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00 tLTC';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(val))} tLTC`;
};

const formatNumber = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '0';
  return new Intl.NumberFormat('en-US').format(Number(val));
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

const mapSwap = (swap: any, txHash: string, timestamp: number): ActivityItem => {
  const isAmount0Negative = Number(swap.amount0) < 0;
  const isAmount1Negative = Number(swap.amount1) < 0;
  
  const token0Symbol = swap.token0?.symbol || 'Token0';
  const token1Symbol = swap.token1?.symbol || 'Token1';
  
  const typeText = `Swap ${isAmount0Negative ? `${token0Symbol} for ${token1Symbol}` : `${token1Symbol} for ${token0Symbol}`}`;
  const amount0Formatted = `${isAmount0Negative ? '' : '+'}${Number(swap.amount0).toFixed(4)} ${token0Symbol}`;
  const amount1Formatted = `${isAmount1Negative ? '' : '+'}${Number(swap.amount1).toFixed(4)} ${token1Symbol}`;
  
  return {
    id: swap.id,
    hash: txHash,
    timestamp: timestamp,
    type: typeText,
    usd: swap.amountUSD,
    token0Amount: amount0Formatted,
    token1Amount: amount1Formatted,
    isToken0Negative: isAmount0Negative,
    isToken1Negative: isAmount1Negative
  };
};

const mapModifyLiquidity = (ml: any, txHash: string, timestamp: number): ActivityItem => {
  const amount = Number(ml.amount);
  
  const token0Symbol = ml.token0?.symbol || 'Token0';
  const token1Symbol = ml.token1?.symbol || 'Token1';
  
  let typeText = '';
  let isAmt0Neg = false;
  let isAmt1Neg = false;
  
  if (amount === 0) {
    typeText = `Collected Fees (${token0Symbol}/${token1Symbol})`;
    isAmt0Neg = true;//
    isAmt1Neg = true;//
  } else if (amount > 0) {
    typeText = `Added Liquidity (${token0Symbol}/${token1Symbol})`;
    isAmt0Neg = false;//
    isAmt1Neg = false;//
  } else {
    typeText = `Removed Liquidity (${token0Symbol}/${token1Symbol})`;
    isAmt0Neg = true;//
    isAmt1Neg = true;//
  }
  
  const amt0Val = Math.abs(Number(ml.amount0));
  const amt1Val = Math.abs(Number(ml.amount1));
  
  const amount0Formatted = `${isAmt0Neg ? '-' : '+'}${amt0Val.toFixed(4)} ${token0Symbol}`;
  const amount1Formatted = `${isAmt1Neg ? '-' : '+'}${amt1Val.toFixed(4)} ${token1Symbol}`;
  
  return {
    id: ml.id,
    hash: txHash,
    timestamp: timestamp,
    type: typeText,
    // usd: ml.amountUSD || 0,
    usd: Math.abs(Number(ml.amountUSD || 0)),
    token0Amount: amount0Formatted,
    token1Amount: amount1Formatted,
    isToken0Negative: isAmt0Neg,
    isToken1Negative: isAmt1Neg
  };
};


export default function ActivityPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [timeRange, setTimeRange] = useState('All time');
  const [filterType, setFilterType] = useState('All types');
  const [globalData, setGlobalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [swaps, setSwaps] = useState<ActivityItem[]>([]);
  const [swapsPage, setSwapsPage] = useState(0);
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);

  // Unique Users Stats States
  const [showUniqueUsers, setShowUniqueUsers] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [userStats, setUserStats] = useState<{
    uniqueCount: number;
    swappersCount: number;
    lpCount: number;
    positionOwnersCount: number;
    addresses: string[];
  } | null>(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [showAddressList, setShowAddressList] = useState(false);

  const handleFetchUniqueUsers = async () => {
    if (userStats) {
      setShowUniqueUsers(!showUniqueUsers);
      return;
    }

    try {
      setFetchingUsers(true);
      setShowUniqueUsers(true);

      const uniqueUsersSet = new Set<string>();
      const swapUsersSet = new Set<string>();
      const liquidityUsersSet = new Set<string>();
      const positionUsersSet = new Set<string>();

      // 1. Fetch Swaps
      let lastSwapTimestamp = "0";
      let hasMoreSwaps = true;
      while (hasMoreSwaps) {
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_ALL_SWAPS, { lastTimestamp: lastSwapTimestamp });
        const swapsList = data?.swaps || [];
        if (swapsList.length === 0) {
          hasMoreSwaps = false;
        } else {
          for (const swap of swapsList) {
            const sender = swap.sender.toLowerCase();
            const origin = swap.origin.toLowerCase();
            swapUsersSet.add(sender);
            swapUsersSet.add(origin);
            uniqueUsersSet.add(sender);
            uniqueUsersSet.add(origin);
          }
          lastSwapTimestamp = swapsList[swapsList.length - 1].timestamp;
          if (swapsList.length < 1000) {
            hasMoreSwaps = false;
          }
        }
      }

      // 2. Fetch Modify Liquidities
      let lastLiqTimestamp = "0";
      let hasMoreLiq = true;
      while (hasMoreLiq) {
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_ALL_MODIFY_LIQUIDITIES, { lastTimestamp: lastLiqTimestamp });
        const mlList = data?.modifyLiquidities || [];
        if (mlList.length === 0) {
          hasMoreLiq = false;
        } else {
          for (const liq of mlList) {
            const sender = liq.sender ? liq.sender.toLowerCase() : "";
            const origin = liq.origin.toLowerCase();
            if (sender) {
              liquidityUsersSet.add(sender);
              uniqueUsersSet.add(sender);
            }
            liquidityUsersSet.add(origin);
            uniqueUsersSet.add(origin);
          }
          lastLiqTimestamp = mlList[mlList.length - 1].timestamp;
          if (mlList.length < 1000) {
            hasMoreLiq = false;
          }
        }
      }

      // 3. Fetch Positions
      let lastPosTimestamp = "0";
      let hasMorePos = true;
      while (hasMorePos) {
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_ALL_POSITIONS, { lastTimestamp: lastPosTimestamp });
        const posList = data?.positions || [];
        if (posList.length === 0) {
          hasMorePos = false;
        } else {
          for (const pos of posList) {
            const owner = pos.owner.toLowerCase();
            const origin = pos.origin.toLowerCase();
            positionUsersSet.add(owner);
            positionUsersSet.add(origin);
            uniqueUsersSet.add(owner);
            uniqueUsersSet.add(origin);
          }
          lastPosTimestamp = posList[posList.length - 1].createdAtTimestamp;
          if (posList.length < 1000) {
            hasMorePos = false;
          }
        }
      }

      setUserStats({
        uniqueCount: uniqueUsersSet.size,
        swappersCount: swapUsersSet.size,
        lpCount: liquidityUsersSet.size,
        positionOwnersCount: positionUsersSet.size,
        addresses: Array.from(uniqueUsersSet),
      });
    } catch (error) {
      console.error("Error fetching unique users:", error);
    } finally {
      setFetchingUsers(false);
    }
  };

  useEffect(() => {
    const fetchGlobalData = async () => {
      try {
        setLoading(true);
        const data = await request(SUBGRAPH_ENDPOINT, GET_GLOBAL_DATA);
        setGlobalData(data);
      } catch (error) {
        console.error('Error fetching global data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchGlobalData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setSwapsLoading(true);
        let mappedItems: ActivityItem[] = [];
        let hasNext = false;
        
        const limit = 11;
        const skip = swapsPage * 10;
        
        const now = Math.floor(Date.now() / 1000);
        let minTimestamp = 0;
        if (timeRange === '1h') {
          minTimestamp = now - 3600;
        } else if (timeRange === '24h') {
          minTimestamp = now - 86400;
        } else if (timeRange === '7d') {
          minTimestamp = now - 86400 * 7;
        } else if (timeRange === '30d') {
          minTimestamp = now - 86400 * 30;
        }
        
        if (filterType === 'All types') {
          const whereClause: any = {};
          if (minTimestamp > 0) {
            whereClause.timestamp_gte = minTimestamp.toString();
          }
          
          const data: any = await request(SUBGRAPH_ENDPOINT, GET_GLOBAL_TRANSACTIONS, {
            first: limit,
            skip: skip,
            where: whereClause
          });
          
          const txs = data.transactions || [];
          hasNext = txs.length > 10;
          const displayTxs = txs.slice(0, 10);
          
          displayTxs.forEach((tx: any) => {
            const txHash = tx.id;
            const timestamp = Number(tx.timestamp);
            
            if (tx.swaps && tx.swaps.length > 0) {
              tx.swaps.forEach((s: any) => {
                mappedItems.push(mapSwap(s, txHash, timestamp));
              });
            }
            if (tx.modifyLiquiditys && tx.modifyLiquiditys.length > 0) {
              tx.modifyLiquiditys.forEach((ml: any) => {
                if (ml.amount !== "0") {
                  mappedItems.push(mapModifyLiquidity(ml, txHash, timestamp));
                }
              });
            }
          });
          
          mappedItems.sort((a, b) => b.timestamp - a.timestamp);
          
        } else if (filterType === 'Swaps') {
          const whereClause: any = {};
          if (minTimestamp > 0) {
            whereClause.timestamp_gte = minTimestamp.toString();
          }
          
          const data: any = await request(SUBGRAPH_ENDPOINT, GET_SWAPS, {
            first: limit,
            skip: skip,
            where: whereClause
          });
          const swapsList = data.swaps || [];
          hasNext = swapsList.length > 10;
          console.log("Total swaps fetched: ", swapsList.length);
          const displaySwaps = swapsList.slice(0, 10);
          
          displaySwaps.forEach((s: any) => {
            mappedItems.push(mapSwap(s, s.transaction?.id || s.id, Number(s.timestamp)));
          });
          
        } else if (filterType === 'Added Liquidity') {
          const whereClause: any = { amount_gt: "0" };
          if (minTimestamp > 0) {
            whereClause.timestamp_gte = minTimestamp.toString();
          }
          
          const data: any = await request(SUBGRAPH_ENDPOINT, GET_GLOBAL_MODIFY_LIQUIDITIES, {
            first: limit,
            skip: skip,
            where: whereClause
          });
          const mlList = data.modifyLiquidities || [];
          hasNext = mlList.length > 10;
          const displayMls = mlList.slice(0, 10);
          
          displayMls.forEach((ml: any) => {
            mappedItems.push(mapModifyLiquidity(ml, ml.transaction?.id || ml.id, Number(ml.timestamp)));
          });
          
        } else if (filterType === 'Remove Liquidity') {
          const whereClause: any = { amount_lt: "0" };
          if (minTimestamp > 0) {
            whereClause.timestamp_gte = minTimestamp.toString();
          }
          
          const data: any = await request(SUBGRAPH_ENDPOINT, GET_GLOBAL_MODIFY_LIQUIDITIES, {
            first: limit,
            skip: skip,
            where: whereClause
          });
          const mlList = data.modifyLiquidities || [];
          hasNext = mlList.length > 10;
          const displayMls = mlList.slice(0, 10);
          
          displayMls.forEach((ml: any) => {
            mappedItems.push(mapModifyLiquidity(ml, ml.transaction?.id || ml.id, Number(ml.timestamp)));
          });
          
        } else {
          mappedItems = [];
          hasNext = false;
        }
        
        setSwaps(mappedItems);
        setHasNextPage(hasNext);
      } catch (error) {
        console.error('Error fetching activity items:', error);
      } finally {
        setSwapsLoading(false);
      }
    };
    
    fetchData();
  }, [swapsPage, filterType, timeRange]);

  // Reset pagination if filters are modified
  useEffect(() => {
    setSwapsPage(0);
  }, [filterType, timeRange]);

  const currentDayTimestamp = Math.floor(Date.now() / 1000 / 86400) * 86400;
  const hasGlobalTodayData = globalData?.uniswapDayDatas?.[0]?.date === currentDayTimestamp;
  const globalVol1d = hasGlobalTodayData ? globalData?.uniswapDayDatas?.[0]?.volumeUSD : 0;
  const globalFees1d = hasGlobalTodayData ? globalData?.uniswapDayDatas?.[0]?.feesUSD : 0;

  const totalTxCount = Number(globalData?.poolManagers?.[0]?.txCount || 0);

  const filteredSwaps = swaps;

  const hasPrevPage = swapsPage > 0;

  const statCards = [
    {
      label: 'Total TVL',
      value: loading ? null : formatLargeCurrency(globalData?.poolManagers?.[0]?.totalValueLockedUSD),
      accent: false,
    },
    {
      label: '1D Volume',
      value: loading ? null : formatLargeCurrency(globalVol1d),
      accent: false,
    },
    {
      label: 'All Time Volume',
      value: loading ? null : formatLargeCurrency(globalData?.poolManagers?.[0]?.totalVolumeUSD),
      accent: false,
    },
    {
      label: '1D Fees',
      value: loading ? null : formatLargeCurrency(globalFees1d),
      accent: false,
    },
    {
      label: 'All Time Fees',
      value: loading ? null : formatLargeCurrency(globalData?.poolManagers?.[0]?.totalFeesUSD),
      accent: false,
    },
    {
      label: 'Total Pools',
      value: loading ? null : formatNumber(globalData?.poolManagers?.[0]?.poolCount),
      accent: false,
    },
    {
      label: 'Total Txns',
      value: loading ? null : formatNumber(globalData?.poolManagers?.[0]?.txCount),
      accent: false,
    },
  ];

  return (
    <div className="pb-40 relative z-10 w-full">

      {/* Compact Stat Boxes */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all ${
              card.accent
                ? 'bg-primary/10 border border-primary/30 shadow-sm'
                : 'bg-white/[0.03] border border-white/[0.08] hover:border-white/20'
            }`}
          >
            <span className="text-xs text-white/50 font-medium">{card.label}:</span>
            {loading ? (
              <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
            ) : (
              <span className={`text-sm font-bold font-mono ${card.accent ? 'text-primary' : 'text-white'}`}>
                {card.value}
              </span>
            )}
          </div>
        ))}
      </div>

     {/* Unique Users Section */}


      {/* Tabs & Actions */}
      <div className="flex justify-between items-center border-b border-white/10 mb-10">
        <div className="flex gap-10">
          <button className="pb-5 text-primary border-b-2 border-primary uppercase tracking-widest text-xs flex items-center gap-3">
            Activity 
            <span className="bg-primary text-black text-xs font-bold px-2 py-0.5 rounded-full">{totalTxCount || filteredSwaps.length}</span>
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 bg-white/[0.02] p-6 rounded-2xl border border-white/5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/40">Filter by type</label>
            <div className="relative">
              <button 
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center justify-between gap-10 bg-black border border-primary/50 px-6 py-3 rounded-full text-sm font-semibold transition-all min-w-[220px] text-white group cursor-pointer active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">filter_list</span>
                  {filterType}
                </div>
                <span className={`material-symbols-outlined text-white/40 group-hover:text-primary transition-all ${filterOpen ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              
              {filterOpen && (
                <div className="absolute top-full left-0 mt-2 w-full bg-black border border-primary/30 rounded-xl shadow-2xl z-20 py-2 overflow-hidden backdrop-blur-xl">
                  {['All types', 'Swaps', 'Added Liquidity', 'Remove Liquidity'].map(type => (
                    <button 
                      key={type}
                      onClick={() => {
                        setFilterType(type);
                        setFilterOpen(false);
                      }}
                      className={`w-full text-left px-5 py-3 text-sm transition-colors border-l-2 ${filterType === type ? 'text-primary bg-primary/10 border-primary' : 'text-white/70 hover:bg-white/5 hover:text-white border-transparent cursor-pointer'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <label className="text-xs font-semibold uppercase tracking-wider text-white/40">Time Range</label>
          <div className="flex bg-black/40 rounded-full p-1.5 border border-white/10">
            {['1h', '24h', '7d', '30d', 'All Time'].map(range => (
              <button 
                key={range}
                onClick={() => setTimeRange(range)}
                className={`flex-1 md:px-6 py-2 text-xs font-bold tracking-wider rounded-full transition-all whitespace-nowrap active:scale-95 ${timeRange === range ? 'bg-primary text-black shadow-lg' : 'text-white/40 hover:text-white cursor-pointer'}`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction List Table */}
      <div className="bg-black/50 rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
        <div className="px-6 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-white tracking-tight">Transactions Feed</h3>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Live</span>
            </div>
          </div>
          <span className="text-xs text-white/40 font-mono">
            Page {swapsPage + 1}
          </span>
        </div>

        <div className="hidden md:grid grid-cols-[100px_1.4fr_120px_140px_140px_110px] gap-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0a]">
          <div>Time</div>
          <div>Type & Action</div>
          <div className="text-right">Total (tLTC)</div>
          <div className="text-right">Token0</div>
          <div className="text-right">Token1</div>
          <div className="text-right">Txn</div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {swapsLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-[100px_1.4fr_120px_140px_140px_110px] gap-4 px-6 py-3.5 items-center animate-pulse">
                <div className="h-4 bg-white/5 rounded w-14" />
                <div className="h-4 bg-white/5 rounded w-32" />
                <div className="h-4 bg-white/5 rounded w-16 md:ml-auto" />
                <div className="h-4 bg-white/5 rounded w-20 md:ml-auto" />
                <div className="h-4 bg-white/5 rounded w-20 md:ml-auto" />
                <div className="h-4 bg-white/5 rounded w-16 md:ml-auto" />
              </div>
            ))
          ) : filteredSwaps && filteredSwaps.length > 0 ? (
            filteredSwaps.map((row: any) => {
              const formattedTime = getRelativeTime(row.timestamp);
              const isSwap = row.type.startsWith('Swap');
              const isAddLiq = row.type.includes('Added Liquidity');
              const isRemoveLiq = row.type.includes('Removed Liquidity');
              const isBuy = row.isToken0Negative;

              return (
                <div 
                  key={row.id} 
                  className="grid grid-cols-1 md:grid-cols-[100px_1.4fr_120px_140px_140px_110px] gap-3 md:gap-4 px-6 py-3.5 items-center hover:bg-white/[0.035] transition-colors group"
                >
                  {/* Time */}
                  <div className="flex md:block justify-between items-center text-xs text-white/50 font-mono">
                     <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Time</span>
                     <span className="flex items-center gap-1.5">
                       <Clock size={12} className="text-white/30 hidden md:inline" />
                       {formattedTime}
                     </span>
                  </div>

                  {/* Type & Action */}
                  <div className="flex md:block justify-between items-center">
                    <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Type</span>
                    <div className="flex items-center gap-2">
                      {isSwap ? (
                        isBuy ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 uppercase">
                            <ArrowUpRight size={13} className="stroke-[2.5]" />
                            buy
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-rose-500/10 text-rose-400 border border-rose-500/25 uppercase">
                            <ArrowDownRight size={13} className="stroke-[2.5]" />
                            sell
                          </span>
                        )
                      ) : isAddLiq ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-purple-500/10 text-purple-300 border border-purple-500/25 uppercase">
                          + add lp
                        </span>
                      ) : isRemoveLiq ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-amber-500/10 text-amber-300 border border-amber-500/25 uppercase">
                          - remove lp
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-sm bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 uppercase">
                          fees
                        </span>
                      )}
                      <span className="text-xs text-white/70 font-medium">
                        {row.type}
                      </span>
                    </div>
                  </div>

                  {/* Total USD */}
                  <div className="flex md:block justify-between items-center md:text-right">
                    <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Total (tLTC)</span>
                    <span className={`text-sm font-bold font-mono ${isSwap && isBuy ? 'text-emerald-400' : 'text-white/90'}`}>
                      {row.usd === '-' ? '-' : formatCurrency(row.usd)}
                    </span>
                  </div>

                  {/* Token0 Amount */}
                  <div className="flex md:block justify-between items-center md:text-right">
                    <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Token0</span>
                    <span className={`text-xs font-mono font-medium ${row.isToken0Negative ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                      {row.token0Amount}
                    </span>
                  </div>

                  {/* Token1 Amount */}
                  <div className="flex md:block justify-between items-center md:text-right">
                    <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Token1</span>
                    <span className={`text-xs font-mono font-medium ${row.isToken1Negative ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                      {row.token1Amount || '-'}
                    </span>
                  </div>

                  {/* Txn Hash */}
                  <div className="flex md:block justify-between items-center md:text-right">
                    <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Txn</span>
                    <a 
                      href={`${BLOCK_EXPLORER_URL}/tx/${row.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-white/50 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all rounded-sm group/hash"
                    >
                      {row.hash.slice(0, 4)}...{row.hash.slice(-4)}
                      <ExternalLink size={10} className="text-primary/70 shrink-0" />
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-14 text-center text-white/30 text-xs">
              no transactions found
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <p className="text-xs text-white/40 font-mono">
          Page {swapsPage + 1} <span className="mx-2 opacity-20">|</span> Showing {swapsPage * 10 + 1}-{swapsPage * 10 + filteredSwaps.length} transactions
        </p>
        <div className="flex gap-3">
          <button 
            disabled={!hasPrevPage || swapsLoading}
            onClick={() => setSwapsPage(prev => Math.max(0, prev - 1))}
            className="px-6 py-2.5 bg-white/5 border border-white/10 text-sm font-semibold text-white hover:bg-white/10 transition-all active:scale-[0.98] disabled:text-white/30 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            Prev
          </button>
          <button 
            disabled={!hasNextPage || swapsLoading}
            onClick={() => setSwapsPage(prev => prev + 1)}
            className="px-6 py-2.5 bg-primary text-black text-sm font-semibold transition-all active:scale-[0.98] gold-glow hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}