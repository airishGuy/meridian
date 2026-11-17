import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, usePublicClient, useWriteContract, useSendTransaction } from 'wagmi';
import { ExternalLink, Wallet, LayoutList, X, Send, ChevronDown, Check, Loader2, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { isAddress, parseUnits, formatUnits } from 'viem';
import { TOKENS, type TokenConfig } from '@/config/tokens';
import { useTokenBalances } from '@/hooks/profile/useTokenBalances';
import { useUserPositions } from '@/hooks/profile/useUserPositions';
import Toast from '@/components/Toast';
import { request } from 'graphql-request';
import { SUBGRAPH_ENDPOINT, GET_USER_ACTIVITY } from '@/lib/queries';
import { BLOCK_EXPLORER_URL } from '@/lib/chains';

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

const formatCurrency = (val: string | number | undefined) => {
  if (val === undefined || val === null || isNaN(Number(val))) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val));
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
    isAmt0Neg = false;
    isAmt1Neg = false;
  } else if (amount > 0) {
    typeText = `Added Liquidity (${token0Symbol}/${token1Symbol})`;
    isAmt0Neg = true;
    isAmt1Neg = true;
  } else {
    typeText = `Removed Liquidity (${token0Symbol}/${token1Symbol})`;
    isAmt0Neg = false;
    isAmt1Neg = false;
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
    usd: ml.amountUSD || 0,
    token0Amount: amount0Formatted,
    token1Amount: amount1Formatted,
    isToken0Negative: isAmt0Neg,
    isToken1Negative: isAmt1Neg
  };
};



export default function ProfilePage() {
  const navigate = useNavigate();
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();

  const [activeTab, setActiveTab] = useState<'tokens' | 'activity' | 'positions'>('tokens');

  // Hook values
  const { balances, isLoading: balancesLoading, totalUsdValue, refetch: refetchBalances } = useTokenBalances();
  const { positions: userPositions, isLoading: positionsLoading } = useUserPositions();

  // Dynamic user activity state
  const [profileSwaps, setProfileSwaps] = useState<ActivityItem[]>([]);
  const [profileSwapsLoading, setProfileSwapsLoading] = useState(false);
  const [profileSwapsPage, setProfileSwapsPage] = useState(0);

  useEffect(() => {
    if (!userAddress) {
      setProfileSwaps([]);
      return;
    }

    const fetchUserActivity = async () => {
      try {
        setProfileSwapsLoading(true);
        const data: any = await request(SUBGRAPH_ENDPOINT, GET_USER_ACTIVITY, {
          user: userAddress.toLowerCase(),
          userBytes: userAddress.toLowerCase(),
          first: 50
        });

        const mappedItems: ActivityItem[] = [];

        if (data.swaps) {
          data.swaps.forEach((s: any) => {
            mappedItems.push(mapSwap(s, s.transaction?.id || s.id, Number(s.timestamp)));
          });
        }
        if (data.modifyLiquidities) {
          data.modifyLiquidities.forEach((ml: any) => {
            if (Number(ml.amount) !== 0) {
              mappedItems.push(mapModifyLiquidity(ml, ml.transaction?.id || ml.id, Number(ml.timestamp)));
            }
          });
        }

        // Sort all by timestamp descending
        mappedItems.sort((a, b) => b.timestamp - a.timestamp);
        setProfileSwaps(mappedItems);
        setProfileSwapsPage(0);
      } catch (error) {
        console.error('Error fetching user activity:', error);
      } finally {
        setProfileSwapsLoading(false);
      }
    };

    fetchUserActivity();
  }, [userAddress]);

  const paginatedTransactions = profileSwaps.slice(profileSwapsPage * 10, (profileSwapsPage + 1) * 10);
  const totalPages = Math.ceil(profileSwaps.length / 10);
  const hasPrevProfilePage = profileSwapsPage > 0;
  const hasNextProfilePage = profileSwapsPage < totalPages - 1;

  // Send Modal States
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string>('0x0000000000000000000000000000000000000000'); // Default to ETH
  const [customTokenAddress, setCustomTokenAddress] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState<{ raw: bigint; formatted: string } | null>(null);

  // Custom token state
  const [customTokenDetails, setCustomTokenDetails] = useState<{
    address: `0x${string}`;
    name: string;
    symbol: string;
    decimals: number;
    logo: string;
    balanceRaw: bigint;
    balanceFormatted: string;
  } | null>(null);
  const [customTokenLoading, setCustomTokenLoading] = useState(false);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  // Toast State
  const [toast, setToast] = useState<{
    show: boolean;
    type: 'pending' | 'success' | 'error';
    title: string;
    message: string;
    txHash?: string;
  }>({ show: false, type: 'pending', title: '', message: '' });

  const showToast = (type: 'pending' | 'success' | 'error', title: string, message: string, txHash?: string) => {
    setToast({ show: true, type, title, message, txHash });
  };

  const dismissToast = () => {
    setToast(prev => ({ ...prev, show: false }));
  };


  const selectableTokens = TOKENS;

  // Fetch ETH Balance
  useEffect(() => {
    if (!userAddress || !publicClient || !isSendModalOpen) return;
    
    let cancelled = false;
    const fetchEthBalance = async () => {
      try {
        const bal = await publicClient.getBalance({ address: userAddress });
        if (!cancelled) {
          setEthBalance({
            raw: bal,
            formatted: parseFloat(formatUnits(bal, 18)).toFixed(6)
          });
        }
      } catch (e) {
        console.error(e);
      }
    };

    fetchEthBalance();
    const interval = setInterval(fetchEthBalance, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userAddress, publicClient, isSendModalOpen]);

  // Fetch Custom Token details
  useEffect(() => {
    if (!customTokenAddress || !isAddress(customTokenAddress) || !publicClient || !userAddress) {
      setCustomTokenDetails(null);
      setCustomTokenError(null);
      return;
    }

    let cancelled = false;

    const fetchCustomToken = async () => {
      setCustomTokenLoading(true);
      setCustomTokenError(null);
      try {
        const [decimals, symbol, name, balance] = await Promise.all([
          publicClient.readContract({
            address: customTokenAddress as `0x${string}`,
            abi: [
              { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' }
            ],
            functionName: 'decimals',
          }).catch(() => 18),
          publicClient.readContract({
            address: customTokenAddress as `0x${string}`,
            abi: [
              { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' }
            ],
            functionName: 'symbol',
          }).catch(() => 'UNKNOWN'),
          publicClient.readContract({
            address: customTokenAddress as `0x${string}`,
            abi: [
              { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' }
            ],
            functionName: 'name',
          }).catch(() => 'Unknown Token'),
          publicClient.readContract({
            address: customTokenAddress as `0x${string}`,
            abi: [
              { type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
            ],
            functionName: 'balanceOf',
            args: [userAddress],
          }).catch(() => 0n),
        ]);

        if (cancelled) return;

        setCustomTokenDetails({
          address: customTokenAddress as `0x${string}`,
          name,
          symbol,
          decimals,
          logo: 'https://raw.githubusercontent.com/uniswap/assets/master/blockchains/ethereum/info/logo.png',
          balanceRaw: balance,
          balanceFormatted: formatUnits(balance, decimals),
        });
      } catch (err: any) {
        if (!cancelled) {
          setCustomTokenError('Failed to load token. Ensure it is a valid ERC20 contract.');
          setCustomTokenDetails(null);
        }
      } finally {
        if (!cancelled) setCustomTokenLoading(false);
      }
    };

    fetchCustomToken();
    return () => { cancelled = true; };
  }, [customTokenAddress, publicClient, userAddress]);

  const getSelectedTokenDetails = () => {
    if (selectedTokenAddress === 'custom') {
      if (customTokenDetails) {
        return {
          symbol: customTokenDetails.symbol,
          decimals: customTokenDetails.decimals,
          rawBalance: customTokenDetails.balanceRaw,
          formattedBalance: customTokenDetails.balanceFormatted,
          logo: customTokenDetails.logo,
          name: customTokenDetails.name,
        };
      }
      return {
        symbol: 'Custom',
        decimals: 18,
        rawBalance: 0n,
        formattedBalance: '0',
        logo: 'https://raw.githubusercontent.com/uniswap/assets/master/blockchains/ethereum/info/logo.png',
        name: 'Custom ERC20',
      };
    }


    const configToken = TOKENS.find(t => t.address === selectedTokenAddress);
    const balanceInfo = balances.find(b => b.token.address === selectedTokenAddress);
    const rawBal = balanceInfo?.raw ?? 0n;
    const decs = configToken?.decimals ?? 18;
    return {
      symbol: configToken?.symbol ?? 'Unknown',
      decimals: decs,
      rawBalance: rawBal,
      formattedBalance: formatUnits(rawBal, decs),
      logo: configToken?.logo ?? '',
      name: configToken?.name ?? '',
    };
  };

  const handleSend = async () => {
    if (!isConnected || !userAddress) {
      showToast('error', 'Wallet Not Connected', 'Please connect your wallet first.');
      return;
    }

    if (!recipient || !isAddress(recipient)) {
      showToast('error', 'Invalid Recipient', 'Please enter a valid recipient address.');
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      showToast('error', 'Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    const tokenDetails = getSelectedTokenDetails();
    const parsedAmount = parseUnits(amount, tokenDetails.decimals);

    if (parsedAmount > tokenDetails.rawBalance) {
      showToast('error', 'Insufficient Balance', `You do not have enough ${tokenDetails.symbol} to cover this send.`);
      return;
    }

    setSendLoading(true);
    showToast('pending', 'Sending Transaction', `Sending ${amount} ${tokenDetails.symbol} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`);

    try {
      let txHash: `0x${string}`;

      if (selectedTokenAddress === '0x0000000000000000000000000000000000000000') {
        txHash = await sendTransactionAsync({
          to: recipient as `0x${string}`,
          value: parsedAmount,
        });
      } else {
        const tokenAddr = selectedTokenAddress === 'custom' ? customTokenAddress : selectedTokenAddress;
        txHash = await writeContractAsync({
          address: tokenAddr as `0x${string}`,
          abi: [
            {
              type: 'function',
              name: 'transfer',
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'value', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'nonpayable',
            },
          ],
          functionName: 'transfer',
          args: [recipient as `0x${string}`, parsedAmount],
        });
      }

      showToast('success', 'Send Success', `Successfully sent ${amount} ${tokenDetails.symbol}!`, txHash);
      setIsSendModalOpen(false);
      setAmount('');
      setRecipient('');
      setCustomTokenAddress('');
      
      // Refresh balances
      setTimeout(() => {
        refetchBalances();
      }, 3000);

    } catch (e: any) {
      console.error(e);
      showToast('error', 'Send Failed', e?.shortMessage ?? e?.message ?? 'Failed to send assets.');
    } finally {
      setSendLoading(false);
    }
  };

  const formatUsd = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  const formatPrice = (p: number) =>
    p < 0.001 ? p.toExponential(4) : p.toLocaleString('en-US', { maximumFractionDigits: 6 });

  return (
    <div className="w-full relative z-10 flex-1 flex flex-col">
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

      {/* Portfolio header */}
      <section className="w-full mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="shrink-0">
            <span className="text-primary font-bold tracking-wider text-xs uppercase mb-2 block">
              My Portfolio
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white mb-3">
              {!isConnected
                ? <span className="text-white/20">Not connected</span>
                : totalUsdValue > 0
                  ? formatUsd(totalUsdValue)
                  : <span className="text-white/40 text-2xl font-mono">{userAddress?.slice(0, 6)}…{userAddress?.slice(-4)}</span>
              }
            </h1>
            {isConnected && (
              <div className="flex flex-wrap items-center gap-3 mt-4">
                <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full w-fit border border-emerald-400/20 text-xs font-medium">
                  <Wallet size={14} />
                  <span>Wallet Connected</span>
                </div>
                <button
                  onClick={() => setIsSendModalOpen(true)}
                  className="flex items-center gap-2 text-black bg-primary hover:bg-primary/90 px-4 py-1.5 rounded-xl text-xs transition-all cursor-pointer font-bold tracking-wide gold-glow active:scale-[0.98]"
                >
                  <Send size={12} />
                  Send Assets
                </button>
              </div>
            )}
          </div>

          {/* Token balance bar — weighted by USD value */}
          {isConnected && (
            <div className="flex-1 w-full lg:max-w-md bg-[#0a0a0c]/80 rounded-2xl border border-white/[0.08] p-5 flex flex-col justify-center gap-3 backdrop-blur-sm shadow-xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-white/40 shrink-0">Token Allocation</p>
                {totalUsdValue > 0 && (
                  <p className="text-xs text-white/60 font-mono font-medium">{formatUsd(totalUsdValue)} total</p>
                )}
              </div>
              <div className="flex h-2 w-full bg-white/5 rounded-full overflow-hidden shrink-0">
                {balancesLoading ? (
                  <div className="h-full w-full bg-white/10 animate-pulse rounded-full" />
                ) : totalUsdValue === 0 ? (
                  <div className="h-full w-full bg-white/5 rounded-full" />
                ) : (
                  (() => {
                    const colors = ['#F472B6', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#06B6D4', '#EC4899'];
                    return balances
                      .filter(b => (b.usdValue ?? 0) > 0)
                      .map((b, i) => {
                        const pct = ((b.usdValue ?? 0) / totalUsdValue) * 100;
                        return (
                          <div
                            key={b.token.symbol}
                            className="h-full transition-all duration-500 hover:brightness-125"
                            style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                            title={`${b.token.symbol}: ${formatUsd(b.usdValue ?? 0)} (${pct.toFixed(1)}%)`}
                          />
                        );
                      })
                  })()
                )}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
                {(() => {
                  const colors = ['#F472B6', '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#06B6D4', '#EC4899'];
                  return balances
                    .filter(b => (b.usdValue ?? 0) > 0)
                    .map((b, i) => (
                      <span key={b.token.symbol} className="flex items-center gap-1.5 text-xs text-white/50">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
                        <span className="font-medium text-white/70">{b.token.symbol}</span>
                        <span className="text-white/30 font-mono">{((b.usdValue ?? 0) / totalUsdValue * 100).toFixed(0)}%</span>
                      </span>
                    ));
                })()}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="inline-flex w-full sm:w-auto p-1.5 bg-[#0a0a0c] rounded-2xl mb-8 border border-white/[0.08] shadow-lg gap-1">
        <button 
          onClick={() => setActiveTab('tokens')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all cursor-pointer ${
            activeTab === 'tokens' 
              ? 'bg-white/10 text-white shadow-md' 
              : 'text-white/40 hover:text-white'
          }`}
        >
          Tokens
        </button>
        <button 
          onClick={() => setActiveTab('positions')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all cursor-pointer ${
            activeTab === 'positions' 
              ? 'bg-white/10 text-white shadow-md' 
              : 'text-white/40 hover:text-white'
          }`}
        >
          Positions
        </button>
        <button 
          onClick={() => setActiveTab('activity')}
          className={`flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-sm sm:text-base font-bold transition-all cursor-pointer ${
            activeTab === 'activity' 
              ? 'bg-white/10 text-white shadow-md' 
              : 'text-white/40 hover:text-white'
          }`}
        >
          Activity
        </button>
      </div>

      {/* Content */}
      <div className="w-full">
        {activeTab === 'tokens' ? (
          <div className="bg-black/50 rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-sm">
            {/* Header row */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr] gap-4 px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0a]">
              <div>Token</div>
              <div className="text-right">Balance</div>
              <div className="text-right">USD Value</div>
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
                <Wallet size={32} strokeWidth={1.5} />
                <p className="text-sm font-medium">Connect your wallet to see balances</p>
              </div>
            ) : balancesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-5 border-b border-white/[0.04] last:border-0 animate-pulse">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white/10" />
                    <div className="space-y-2">
                      <div className="h-4 w-28 bg-white/10 rounded" />
                      <div className="h-3 w-16 bg-white/5 rounded" />
                    </div>
                  </div>
                  <div className="h-5 w-24 bg-white/10 rounded" />
                </div>
              ))
            ) : (
              balances.map((item) => {
                const hasBalance = item.raw > 0n;
                return (
                  <div
                    key={item.token.address}
                    className={`group relative grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4 px-6 py-4.5 items-center border-b border-white/[0.04] last:border-0 hover:bg-white/[0.035] transition-colors ${
                      hasBalance ? '' : 'opacity-60'
                    }`}
                  >
                    {/* Left accent on tokens with balance */}
                    {hasBalance && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />
                    )}

                    {/* Token info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-black border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                        <img
                          src={item.token.logo}
                          alt={item.token.symbol}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white tracking-tight truncate">{item.token.name}</h3>
                          {item.usdPrice !== null && (
                            <span className="text-xs font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/[0.06]">
                              ${item.usdPrice < 0.01
                                ? item.usdPrice.toFixed(6)
                                : item.usdPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                            </span>
                          )}
                        </div>
                        <p className="text-white/40 text-xs font-mono mt-0.5">{item.token.symbol}</p>
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="text-left md:text-right">
                      {hasBalance ? (
                        <>
                          <p className="text-base font-bold text-white tracking-tight font-mono">{item.formatted}</p>
                          <p className="text-white/40 text-xs font-mono mt-0.5">{item.token.symbol}</p>
                        </>
                      ) : (
                        <p className="text-white/20 text-base font-mono">—</p>
                      )}
                    </div>

                    {/* USD Value */}
                    <div className="text-left md:text-right">
                      {item.usdValue !== null ? (
                        <>
                          <p className="text-base font-bold text-white font-mono tracking-tight">{formatUsd(item.usdValue)}</p>
                          <p className="text-white/30 text-xs font-mono mt-0.5">Value</p>
                        </>
                      ) : (
                        <p className="text-white/20 text-xs font-mono">—</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : activeTab === 'positions' ? (
          <div className="space-y-6">
            {/* Compact summary bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="bg-[#0a0a0c]/80 border border-white/[0.08] px-5 py-3 rounded-xl flex items-center gap-3 shadow-md backdrop-blur-sm">
                <span className="text-xs font-medium uppercase tracking-wider text-white/50">Active Positions:</span>
                <span className="text-lg font-bold font-mono text-white tracking-tight">
                  {positionsLoading ? <span className="animate-pulse">…</span> : userPositions.length}
                </span>
              </div>
              <div className="bg-[#0a0a0c]/80 border border-white/[0.08] px-5 py-3 rounded-xl flex items-center gap-3 shadow-md backdrop-blur-sm">
                <span className="text-xs font-medium uppercase tracking-wider text-white/50">Unique Pools:</span>
                <span className="text-lg font-bold font-mono text-white tracking-tight">
                  {positionsLoading ? <span className="animate-pulse">…</span>
                    : new Set(userPositions.map(p => `${p.currency0}-${p.currency1}-${p.fee}`)).size}
                </span>
              </div>
            </div>

            {/* Position list */}
            {!isConnected ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
                <Wallet size={32} strokeWidth={1.5} />
                <p className="text-xs uppercase tracking-wider">Connect your wallet to see positions</p>
              </div>
            ) : positionsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="p-6 bg-[#0a0a0c]/80 border border-white/[0.08] rounded-2xl animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-black" />
                        <div className="w-10 h-10 rounded-full bg-white/5 border-2 border-black" />
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-40 bg-white/10 rounded" />
                        <div className="h-3 w-56 bg-white/5 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : userPositions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-white/30">
                <LayoutList size={32} strokeWidth={1.5} />
                <p className="text-xs uppercase tracking-wider">No positions found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {userPositions.map((pos) => (
                  <div
                    key={pos.tokenId}
                    onClick={() => navigate(`/positions/${pos.tokenId}`)}
                    className="group bg-[#0a0a0c]/80 border border-white/[0.08] hover:border-primary/30 hover:bg-white/[0.035] p-6 rounded-2xl transition-all duration-200 cursor-pointer relative overflow-hidden shadow-lg backdrop-blur-sm"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      {/* Left: token logos + pair info */}
                      <div className="flex items-center gap-4">
                        <div className="flex -space-x-2.5 shrink-0">
                          {[pos.token0, pos.token1].map((tok, i) => (
                            <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-black overflow-hidden">
                              {tok.logo ? (
                                <img
                                  src={tok.logo}
                                  alt={tok.symbol}
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-white/40">{tok.symbol[0]}</div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-semibold text-white tracking-tight group-hover:text-primary transition-colors">
                              {pos.token0.symbol} / {pos.token1.symbol}
                            </h3>
                            <span className="text-xs bg-primary/10 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-mono">
                              {pos.feePct}
                            </span>
                            <span className="text-xs text-white/40 font-mono bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                              #{pos.tokenId}
                            </span>
                          </div>
                          <p className="text-xs font-mono text-white/40 mt-1.5">
                            Range:&nbsp;
                            <span className="text-white/70">
                              {formatPrice(pos.priceLower)}&nbsp;—&nbsp;{formatPrice(pos.priceUpper)}
                            </span>
                            &nbsp;<span className="text-white/30">{pos.token1.symbol}/{pos.token0.symbol}</span>
                          </p>
                        </div>
                      </div>

                      {/* Right: ticks */}
                      <div className="text-left md:text-right shrink-0">
                        <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Tick Range</p>
                        <p className="text-sm font-mono text-white/80 font-medium">
                          {pos.tickLower} — {pos.tickUpper}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full bg-black/50 rounded-2xl border border-white/[0.08] overflow-hidden shadow-2xl">
            <div className="hidden md:grid grid-cols-[100px_1.4fr_120px_140px_140px_110px] gap-4 px-6 py-3.5 text-xs font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0a]">
              <div>Time</div>
              <div>Type & Action</div>
              <div className="text-right">Total USD</div>
              <div className="text-right">Token0</div>
              <div className="text-right">Token1</div>
              <div className="text-right">Txn</div>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {!isConnected ? (
                <div className="py-14 text-center text-white/30 text-xs">
                  connect your wallet to see activity
                </div>
              ) : profileSwapsLoading ? (
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
              ) : paginatedTransactions && paginatedTransactions.length > 0 ? (
                paginatedTransactions.map((tx) => {
                  const formattedTime = getRelativeTime(tx.timestamp);
                  const isSwap = tx.type.startsWith('Swap');
                  const isAddLiq = tx.type.includes('Added Liquidity');
                  const isRemoveLiq = tx.type.includes('Removed Liquidity');
                  const isBuy = tx.isToken0Negative;

                  return (
                    <div 
                      key={tx.id} 
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
                            {tx.type}
                          </span>
                        </div>
                      </div>

                      {/* Total USD */}
                      <div className="flex md:block justify-between items-center md:text-right">
                        <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Total USD</span>
                        <span className={`text-sm font-bold font-mono ${isSwap && isBuy ? 'text-emerald-400' : 'text-white/90'}`}>
                          {tx.usd === '-' ? '-' : formatCurrency(tx.usd)}
                        </span>
                      </div>

                      {/* Token0 Amount */}
                      <div className="flex md:block justify-between items-center md:text-right">
                        <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Token0</span>
                        <span className={`text-xs font-mono font-medium ${tx.isToken0Negative ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                          {tx.token0Amount}
                        </span>
                      </div>

                      {/* Token1 Amount */}
                      <div className="flex md:block justify-between items-center md:text-right">
                        <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Token1</span>
                        <span className={`text-xs font-mono font-medium ${tx.isToken1Negative ? 'text-rose-400/80' : 'text-emerald-400'}`}>
                          {tx.token1Amount || '-'}
                        </span>
                      </div>

                      {/* Txn Hash */}
                      <div className="flex md:block justify-between items-center md:text-right">
                        <span className="md:hidden text-xs uppercase tracking-wider text-white/30 font-sans">Txn</span>
                        <a 
                          href={`${BLOCK_EXPLORER_URL}/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono text-white/50 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all rounded-sm group/hash"
                        >
                          {tx.hash.slice(0, 4)}...{tx.hash.slice(-4)}
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
            
            <div className="p-4 border-t border-white/[0.06] flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/[0.01]">
              <p className="text-xs text-white/40 font-mono">
                {profileSwaps.length > 0 ? (
                  `Showing ${profileSwapsPage * 10 + 1}-${Math.min((profileSwapsPage + 1) * 10, profileSwaps.length)} of ${profileSwaps.length} transactions`
                ) : (
                  'No transactions'
                )}
              </p>
              <div className="flex gap-3">
                <button 
                  disabled={!hasPrevProfilePage || profileSwapsLoading}
                  onClick={() => setProfileSwapsPage(prev => Math.max(0, prev - 1))}
                  className="px-5 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  Prev
                </button>
                <button 
                  disabled={!hasNextProfilePage || profileSwapsLoading}
                  onClick={() => setProfileSwapsPage(prev => prev + 1)}
                  className="px-5 py-2 bg-primary text-black rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] gold-glow hover:brightness-110 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Send Assets Modal */}
      {isSendModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => setIsSendModalOpen(false)}
          />

          <div className="relative w-full max-w-lg bg-[#0d0d10] border border-white/15 p-6 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col rounded-3xl">
            <button
              onClick={() => setIsSendModalOpen(false)}
              className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors cursor-pointer p-1 rounded-full hover:bg-white/10"
            >
              <X size={18} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white tracking-tight">Send Assets</h2>
              <p className="text-xs text-white/40 mt-1">
                Transfer native zkLTC or custom tokens to another address.
              </p>
            </div>

            <div className="w-full space-y-4">
              {/* Token Selector Dropdown */}
              <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl">
                <label className="text-xs font-medium uppercase tracking-wider text-white/40 block mb-2">Select Token</label>
                <div className="relative">
                  <select
                    value={selectedTokenAddress}
                    onChange={(e) => {
                      setSelectedTokenAddress(e.target.value);
                      setAmount(''); // clear amount to avoid wrong inputs
                    }}
                    className="w-full bg-[#16161a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs tracking-wider outline-none cursor-pointer appearance-none pr-10 focus:border-primary/50"
                  >
                    {selectableTokens.map((tok) => (
                      <option key={tok.address} value={tok.address} className="bg-[#121212] text-white">
                        {tok.symbol} - {tok.name}
                      </option>
                    ))}
                    <option value="custom" className="bg-[#121212] text-white font-sans">
                      CUSTOM TOKEN CONTRACT ADDRESS...
                    </option>
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 text-white/40 pointer-events-none w-4 h-4" />
                </div>
              </div>

              {/* Custom Token Address Input (if selected) */}
              {selectedTokenAddress === 'custom' && (
                <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl animate-in slide-in-from-top-2 duration-200">
                  <label className="text-xs font-medium uppercase tracking-wider text-white/40 block mb-2">Token Contract Address</label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={customTokenAddress}
                    onChange={(e) => setCustomTokenAddress(e.target.value)}
                    className="w-full bg-[#16161a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-primary/50"
                  />
                  {customTokenLoading && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                      <Loader2 size={12} className="animate-spin" />
                      Loading token contract details...
                    </div>
                  )}
                  {customTokenError && (
                    <div className="text-xs text-rose-400 mt-2">
                      {customTokenError}
                    </div>
                  )}
                  {customTokenDetails && (
                    <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3">
                      <div className="flex items-center gap-2">
                        <img src={customTokenDetails.logo} className="w-5 h-5 rounded-full" />
                        <div>
                          <p className="text-xs font-semibold text-white">{customTokenDetails.symbol}</p>
                          <p className="text-xs text-white/40">{customTokenDetails.name}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs font-mono text-white/60">
                        DECIMALS: {customTokenDetails.decimals}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recipient Address */}
              <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl">
                <label className="text-xs font-medium uppercase tracking-wider text-white/40 block mb-2">Recipient Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-[#16161a] border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-mono outline-none focus:border-primary/50"
                />
              </div>

              {/* Amount Input */}
              <div className="bg-white/[0.03] border border-white/10 p-4 rounded-2xl">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-white/40">Amount</label>
                  <span className="text-xs text-white/40 font-mono">
                    Balance: {parseFloat(getSelectedTokenDetails().formattedBalance).toLocaleString(undefined, { maximumFractionDigits: 6 })} {getSelectedTokenDetails().symbol}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-4">
                  <input
                    type="text"
                    placeholder="0.0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-transparent text-2xl font-bold text-white outline-none w-2/3 font-mono"
                  />
                  <button
                    onClick={() => setAmount(getSelectedTokenDetails().formattedBalance)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-semibold rounded-lg transition-all cursor-pointer font-mono shrink-0"
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 w-full mt-6">
              <button
                onClick={() => setIsSendModalOpen(false)}
                className="py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sendLoading || (selectedTokenAddress === 'custom' && !customTokenDetails)}
                className="py-3 bg-primary hover:bg-primary/90 text-black text-xs font-bold rounded-xl gold-glow active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sendLoading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Send Assets
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
