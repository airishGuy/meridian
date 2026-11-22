import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { useAppKit } from '@reown/appkit/react';
import { useConnection, useDisconnect, useBalance } from 'wagmi';
import { formatUnits } from 'viem';
import { Menu, X, LogOut, ArrowRight, Copy, Check, ChevronDown } from 'lucide-react';
import { useActiveChain } from '@/context/ActiveChainContext';

// Deterministic random number generator based on seed string
function createRand(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return function() {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function createColor(rand: () => number) {
  const h = Math.floor(rand() * 360);
  const s = Math.floor(rand() * 60) + 40;
  const l = Math.floor(rand() * 50) + 30;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function Blockie({ address, size = 20 }: { address: string; size?: number }) {
  const seed = (address || '').toLowerCase();
  const rand = createRand(seed);

  const colors = [
    createColor(rand),
    createColor(rand),
    createColor(rand),
  ];

  const grid: number[][] = [];
  for (let y = 0; y < 8; y++) {
    const row: number[] = [];
    for (let x = 0; x < 4; x++) {
      row.push(Math.floor(rand() * 3));
    }
    const fullRow = [...row, ...row.slice().reverse()];
    grid.push(fullRow);
  }

  const cellSize = size / 8;

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox={`0 0 ${size} ${size}`} 
      className="rounded-full overflow-hidden shrink-0 border border-white/20"
    >
      {grid.flatMap((row, y) =>
        row.map((val, x) => (
          <rect
            key={`${x}-${y}`}
            x={x * cellSize}
            y={y * cellSize}
            width={cellSize}
            height={cellSize}
            fill={colors[val]}
          />
        ))
      )}
    </svg>
  );
}

export default function Navbar() {
  const { open } = useAppKit();
  const { address, isConnected } = useConnection();
  const { activeChain, chainId, supportedChains, switchNetwork } = useActiveChain();
  const visibleChains = useMemo(() => supportedChains, [supportedChains]);
  const { data: balanceData } = useBalance({
    address: address as `0x${string}` | undefined,
    chainId: activeChain.id,
    query: {
      refetchInterval: 10_000,
    },
  });

  const formattedBalance = useMemo(() => {
    if (!balanceData) return '0.000';
    const num = parseFloat(formatUnits(balanceData.value, balanceData.decimals));
    if (num === 0) return '0.000';
    if (num > 0 && num < 0.001) return '<0.001';
    return num.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }, [balanceData]);

  const nativeSymbol = balanceData?.symbol || activeChain.nativeCurrency.symbol;

  const { disconnect } = useDisconnect();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [walletDropdown, setWalletDropdown] = useState(false);
  const [networkDropdown, setNetworkDropdown] = useState(false);
  const { pathname } = useLocation();
  const [copied, setCopied] = useState(false);

  const wallet = address;
  const shortAddress = wallet ? `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}` : '';

  const handleCopy = () => {
    if (wallet) {
      navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const navLinks = [
    { label: 'Swap', href: '/' },
    { label: 'Pools', href: '/pools' },
    { label: 'Faucet', href: '/faucet' },
    { label: 'Activity', href: '/activity' },
    { label: 'Profile', href: '/profile' },
  ];

  return (
    <>
      <header className="fixed top-0 w-full z-50 bg-[#060608]/80 border-b border-white/[0.08] backdrop-blur-2xl transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Left: Logo + Navigation Links */}
          <div className="flex items-center gap-8">
            <Logo />
            
            <nav className="hidden md:flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/[0.08] rounded-full">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link 
                    key={link.href}
                    to={link.href} 
                    className={`px-5 py-2 text-base rounded-full transition-all duration-200 ${
                      isActive 
                        ? 'bg-white/10 text-white font-bold shadow-sm' 
                        : 'text-white/60 hover:text-white hover:bg-white/[0.06] font-medium'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right: Network + Wallet */}
          <div className="flex items-center gap-3">
            {/* Network Display / Selector */}
            <div className="relative hidden sm:block">
              <button 
                onClick={() => visibleChains.length > 1 && setNetworkDropdown(!networkDropdown)}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-white/20 transition-all ${
                  visibleChains.length > 1 ? 'cursor-pointer hover:bg-white/[0.07]' : 'cursor-default'
                }`}
                title={visibleChains.length > 1 ? "Switch Network" : "Active Network"}
              >
                <div className="relative flex items-center justify-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="absolute w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </div>
                <span className="text-xs font-mono font-medium tracking-tight text-white/90">{activeChain.name}</span>
                {visibleChains.length > 1 && (
                  <ChevronDown size={14} className={`text-white/40 transition-transform duration-200 ${networkDropdown ? 'rotate-180' : ''}`} />
                )}
              </button>

              {visibleChains.length > 1 && networkDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNetworkDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-[#0e0e11] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden py-2 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2 border-b border-white/[0.06] text-xs font-semibold uppercase tracking-wider text-white/40">
                      Select Network
                    </div>
                    {visibleChains.map((c) => {
                      const isSelected = c.id === chainId;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            switchNetwork(c.id);
                            setNetworkDropdown(false);
                          }}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-primary/10 text-primary font-semibold' 
                              : 'text-white/70 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-white/20'}`} />
                            <span className="font-mono text-xs">{c.name}</span>
                          </div>
                          {isSelected && <Check size={14} className="text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Desktop Wallet Area */}
            <div className="hidden md:flex items-center gap-2">
              {!isConnected ? (
                <button 
                  onClick={() => open()}
                  className="bg-primary text-black px-5 py-2.5 rounded-full text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-95 cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  Connect Wallet
                </button>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => setWalletDropdown(!walletDropdown)}
                    className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.07] transition-all cursor-pointer"
                  >
                    <Blockie address={address || ''} size={20} />
                    <span className="text-xs font-mono text-white/90 font-medium tracking-tight">{shortAddress}</span>
                    <ChevronDown size={14} className={`text-white/40 transition-transform duration-200 ${walletDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Wallet Dropdown */}
                  {walletDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setWalletDropdown(false)} />
                      
                      <div className="absolute right-0 top-full mt-2 w-72 bg-[#0e0e11] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 backdrop-blur-2xl">
                        {/* Wallet Header */}
                        <div className="p-4 border-b border-white/[0.06]">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs uppercase tracking-wider font-semibold text-white/40">Connected</span>
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <span className="text-xs font-mono text-emerald-400">Online</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Blockie address={address || ''} size={36} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono text-white font-medium tracking-tight">{shortAddress}</span>
                                <button 
                                  onClick={handleCopy} 
                                  className="text-white/40 hover:text-white transition-colors cursor-pointer p-1 rounded-md hover:bg-white/[0.08]"
                                  title="Copy Address"
                                >
                                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                </button>
                              </div>
                              <span className="text-xs text-white/40 font-mono">{activeChain.name}</span>
                            </div>
                          </div>
                        </div>

                        {/* Balance */}
                        <div className="px-4 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                          <span className="text-xs uppercase tracking-wider font-semibold text-white/40">Native Balance</span>
                          <p className="text-base text-white font-mono font-bold mt-1">
                            {formattedBalance} <span className="text-xs text-white/50 font-normal">{nativeSymbol}</span>
                          </p>
                        </div>

                        {/* Disconnect */}
                        <div className="p-2">
                          <button 
                            onClick={() => { disconnect(); setWalletDropdown(false); }}
                            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-white/60 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer text-xs font-semibold"
                          >
                            <LogOut size={14} />
                            <span>Disconnect Wallet</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 hover:text-white transition-all cursor-pointer"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`fixed inset-0 z-40 md:hidden bg-[#060608]/95 backdrop-blur-2xl transition-all duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex flex-col h-full pt-24 px-6 pb-12 overflow-y-auto">
          {/* Mobile Nav Links */}
          <nav className="flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link 
                key={link.href}
                to={link.href} 
                onClick={() => setIsMenuOpen(false)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-xl transition-all ${
                  pathname === link.href 
                    ? 'bg-white/10 text-white font-semibold' 
                    : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-base font-medium">{link.label}</span>
                <ArrowRight size={16} className={`transition-all ${pathname === link.href ? 'text-primary' : 'text-white/20'}`} />
              </Link>
            ))}
          </nav>

          {/* Mobile Network Info */}
          <div className="mt-6 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-white/40">Network</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-mono font-medium text-white">{activeChain.name}</span>
            </div>
          </div>

          {/* Mobile Wallet Section */}
          <div className="mt-auto pt-6 border-t border-white/[0.08]">
            {!isConnected ? (
              <button 
                onClick={() => { open(); setIsMenuOpen(false); }}
                className="w-full bg-primary text-black py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all hover:brightness-110 active:scale-95 cursor-pointer shadow-lg"
              >
                Connect Wallet
              </button>
            ) : (
              <div className="space-y-4">
                <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider font-semibold text-white/40">Wallet</span>
                    <span className="text-xs font-mono text-emerald-400">Connected</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-white font-medium">{shortAddress}</span>
                    <button 
                      onClick={handleCopy} 
                      className="p-1.5 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                    >
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="pt-2 border-t border-white/[0.06] flex justify-between items-baseline">
                    <span className="text-xs text-white/40">Native Balance</span>
                    <span className="text-sm font-mono text-white font-semibold">
                      {formattedBalance} {nativeSymbol}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => { disconnect(); setIsMenuOpen(false); }}
                  className="w-full bg-rose-500/10 border border-rose-500/20 text-rose-300 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:bg-rose-500/20 transition-all cursor-pointer"
                >
                  <LogOut size={15} />
                  Disconnect Wallet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
