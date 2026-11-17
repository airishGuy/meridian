import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Info, Plug, Lock, Unlock } from 'lucide-react';
import TokenSelector, { Token } from '@/components/TokenSelector';
import TokenImage from '@/components/TokenImage';
import { TOKENS } from '@/config/tokens';
import { usePool } from '@/hooks/pool/usePool';
import Toast from '@/components/Toast';
import { zeroAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';


export default function CreatePoolPage() {
  const { isConnected } = useAccount();
  const { open } = useAppKit();

  const [feeTier, setFeeTier] = useState(0.3);
  const [tickSpacing, setTickSpacing] = useState(60);
  const [priceRatioA, setPriceRatioA] = useState('1');
  const [priceRatioB, setPriceRatioB] = useState('1');
  const [isCustomRatio, setIsCustomRatio] = useState(false);
  const [customPriceA, setCustomPriceA] = useState('1');
  const [customPriceB, setCustomPriceB] = useState('1');

  const [copiedA, setCopiedA] = useState(false);
  const [copiedB, setCopiedB] = useState(false);
  const [tokenA, setTokenA] = useState<Token>(TOKENS[0]);
  const [tokenB, setTokenB] = useState<Token>(TOKENS[1]);

  const { initializePool, isConfirming, toast, dismissToast } = usePool()


  const [hooks, setHooks] = useState<`0x${string}`>(zeroAddress);


  const copyToken = (address: string, isA: boolean) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    if (isA) {
      setCopiedA(true);
      setTimeout(() => setCopiedA(false), 2000);
    } else {
      setCopiedB(true);
      setTimeout(() => setCopiedB(false), 2000);
    }
  };

  const feeTiers = [
    { label: 0.01, sub: 'STABLE', spacing: 1 },
    { label: 0.05, sub: 'BEST', spacing: 10 },
    { label: 0.3, sub: 'DEFI', spacing: 60 },
    { label: 1.00, sub: 'EXOTIC', spacing: 200 },
  ];

  const [copied0, setCopied0] = useState(false);
  const [copied1, setCopied1] = useState(false);

  const copyToClipboard = (text: string, isToken0: boolean) => {
    navigator.clipboard.writeText(text);
    if (isToken0) {
      setCopied0(true);
      setTimeout(() => setCopied0(false), 2000);
    } else {
      setCopied1(true);
      setTimeout(() => setCopied1(false), 2000);
    }
  };

  const isTokenA0 = (tokenA.address || '').toLowerCase() < (tokenB.address || '').toLowerCase();
  const t0 = isTokenA0 ? tokenA : tokenB;
  const t1 = isTokenA0 ? tokenB : tokenA;


  return (
    <div className="pb-40 max-w-4xl mx-auto relative w-full">
      <div className="w-full max-w-[560px]">      

          {/* Toast Demo Layer */}
          
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
      </div>
      {/* Background Glows */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-primary/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-40 left-0 w-[250px] h-[250px] bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>

      {/* Navigation Header */}
      <div className="mb-8">
        <Link to="/pools" className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-4 group text-sm font-medium">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back to Pools</span>
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Create Liquidity Pool</h1>
            <p className="text-base text-white/50 mt-1">Initialize a new Uniswap v4 pool on LitVM LiteForge with customized fees and hook logic</p>
          </div>
        </div>
      </div>

      {/* Vertical Block Flow */}
      <div className="space-y-6">

          {/* Step 1: Pair Selection Card */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center text-xs font-bold font-mono">1</span>
                <h3 className="text-base font-bold text-white tracking-tight">Select Token Pair</h3>
              </div>
              <Info size={16} className="text-white/30" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/40">First Asset</span>
                <TokenSelector
                  selectedToken={tokenA}
                  onSelect={setTokenA}
                  tokens={TOKENS}
                  excludeToken={tokenB}
                  className="w-full"
                />
              </div>
              <div className="bg-black/40 border border-white/[0.08] p-4 rounded-2xl flex flex-col gap-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-white/40">Second Asset</span>
                <TokenSelector
                  selectedToken={tokenB}
                  onSelect={setTokenB}
                  tokens={TOKENS}
                  excludeToken={tokenA}
                  className="w-full"
                />
              </div>
            </div>

            {/* Token Order Readout */}
            <div className="bg-black/50 border border-white/[0.08] rounded-2xl p-4 font-mono text-xs">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-primary font-bold w-6 shrink-0">[0]</span>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{t0.symbol}</span>
                        <span className="text-white/40 uppercase">Token0</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(t0.address || '', true)}
                        className={`p-1 cursor-pointer transition-colors ${copied0 ? 'text-primary' : 'text-white/30 hover:text-primary'}`}
                      >
                        {copied0 ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <span className="text-white/40 text-xs tracking-wider break-all select-all font-mono">
                      {t0.address}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-3 border-t border-white/[0.06]">
                  <span className="text-white/40 font-bold w-6 shrink-0">[1]</span>
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold">{t1.symbol}</span>
                        <span className="text-white/40 uppercase">Token1</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(t1.address || '', false)}
                        className={`p-1 cursor-pointer transition-colors ${copied1 ? 'text-primary' : 'text-white/30 hover:text-primary'}`}
                      >
                        {copied1 ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                    <span className="text-white/40 text-xs tracking-wider break-all select-all font-mono">
                      {t1.address}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2: Fee Tier Card */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center text-xs font-bold font-mono">2</span>
                <h3 className="text-base font-bold text-white tracking-tight">Select Fee Tier</h3>
              </div>
              <Info size={16} className="text-white/30" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {feeTiers.map((tier) => (
                <button
                  key={tier.label}
                  onClick={() => { setFeeTier(tier.label); setTickSpacing(tier.spacing); }}
                  className={`flex flex-col text-left transition-all relative overflow-hidden rounded-2xl cursor-pointer border p-4 sm:p-5 ${feeTier === tier.label
                    ? 'bg-primary/10 border-primary shadow-[0_0_24px_rgba(244,63,94,0.18)]'
                    : 'bg-black/40 border-white/[0.08] hover:bg-white/[0.03] hover:border-white/20'
                    }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="text-xs uppercase tracking-wider font-mono text-white/50">{tier.sub}</span>
                    {feeTier === tier.label && (
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </div>

                  <span className={`text-2xl font-bold tracking-tight block mb-2 font-mono ${feeTier === tier.label ? 'text-primary' : 'text-white'}`}>
                    {tier.label}%
                  </span>

                  <span className="text-xs font-mono text-white/40 mt-auto">
                    Tick Spacing: {tier.spacing}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Starting Price Ratio */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center text-xs font-bold font-mono">3</span>
                <h3 className="text-base font-bold text-white tracking-tight">Initial Price Ratio</h3>
              </div>
              <Info size={16} className="text-white/30" />
            </div>

            <div className="flex flex-wrap gap-2.5">
              {['1:1', '2:1', '1:2', 'CUSTOM'].map((opt) => {
                const isCustomOpt = opt === 'CUSTOM';
                const [a, b] = isCustomOpt ? [customPriceA, customPriceB] : opt.split(':');
                const isActive = isCustomOpt
                  ? isCustomRatio
                  : !isCustomRatio && priceRatioA === a && priceRatioB === b;
                return (
                  <button
                    key={opt}
                    onClick={() => {
                      if (isCustomOpt) {
                        setIsCustomRatio(true);
                        setPriceRatioA(customPriceA);
                        setPriceRatioB(customPriceB);
                      } else {
                        setIsCustomRatio(false);
                        setPriceRatioA(a);
                        setPriceRatioB(b);
                      }
                    }}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all border cursor-pointer ${
                      isActive
                        ? 'bg-primary text-black font-bold shadow-md'
                        : 'bg-black/40 border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {isCustomRatio && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 bg-black/40 border border-white/[0.08] rounded-2xl p-5 animate-in fade-in duration-200">
                <div className="space-y-1.5 text-center">
                  <p className="text-xs uppercase tracking-wider text-white/50 font-mono font-semibold">{t0.symbol}</p>
                  <input
                    className="w-full bg-transparent border-b border-white/20 py-1 text-center focus:outline-none focus:border-primary transition-all text-2xl font-bold font-mono text-white"
                    type="text"
                    value={customPriceA}
                    onChange={(e) => {
                      setCustomPriceA(e.target.value);
                      setPriceRatioA(e.target.value);
                    }}
                  />
                </div>
                <span className="text-primary text-2xl font-bold">:</span>
                <div className="space-y-1.5 text-center">
                  <p className="text-xs uppercase tracking-wider text-white/50 font-mono font-semibold">{t1.symbol}</p>
                  <input
                    className="w-full bg-transparent border-b border-white/20 py-1 text-center focus:outline-none focus:border-primary transition-all text-2xl font-bold font-mono text-white"
                    type="text"
                    value={customPriceB}
                    onChange={(e) => {
                      setCustomPriceB(e.target.value);
                      setPriceRatioB(e.target.value);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Extension Hooks */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-xl backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary border border-primary/25 flex items-center justify-center text-xs font-bold font-mono">4</span>
                <h3 className="text-base font-bold text-white tracking-tight">Hook Details (Optional)</h3>
              </div>
              <Info size={16} className="text-white/30" />
            </div>

            <div className="space-y-3">
              <p className="text-sm text-white/50">Attach a smart contract hook to execute custom liquidity, fee, or swap callbacks.</p>
              <div className="relative">
                <input
                  className="w-full bg-black/40 border border-white/[0.08] px-4 py-3.5 rounded-xl font-mono text-sm tracking-wider text-white uppercase placeholder:text-white/20 focus:outline-none focus:border-primary transition-all"
                  type="text"
                  placeholder={zeroAddress}
                  value={hooks === zeroAddress ? '' : hooks}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val === '') {
                      setHooks(zeroAddress);
                    } else {
                      setHooks(val as `0x${string}`);
                    }
                  }}
                />
                {hooks !== zeroAddress && (
                  <button
                    type="button"
                    onClick={() => setHooks(zeroAddress)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-wider text-white/40 hover:text-primary transition-colors cursor-pointer px-2 py-1 rounded bg-white/5"
                  >
                    Reset
                  </button>
                )}
              </div>
              
              {hooks !== zeroAddress && !/^0x[a-fA-F0-9]{40}$/.test(hooks) && (
                <p className="text-rose-400 text-xs font-mono">
                  Invalid Ethereum contract address format
                </p>
              )}
            </div>
          </div>

          {/* Pool Overview (Block Element Underneath) */}
          <div className="bg-[#0c0c0e]/95 border border-white/[0.08] p-6 sm:p-7 rounded-3xl shadow-2xl backdrop-blur-md space-y-6">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-lg font-bold text-white tracking-tight">Pool Overview</h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold uppercase tracking-wider">
                Preview
              </span>
            </div>

            {/* Pair Identity Preview */}
            <div className="flex items-center gap-4 bg-black/40 border border-white/[0.08] p-4.5 rounded-2xl">
              <div className="flex -space-x-3 shrink-0">
                <div className="w-10 h-10 rounded-full border-2 border-black bg-black overflow-hidden shadow-md">
                  <TokenImage tokenAddress={t0.address} symbol={t0.symbol} className="w-full h-full object-contain" alt={t0.symbol} />
                </div>
                <div className="w-10 h-10 rounded-full border-2 border-black bg-black overflow-hidden shadow-md">
                  <TokenImage tokenAddress={t1.address} symbol={t1.symbol} className="w-full h-full object-contain" alt={t1.symbol} />
                </div>
              </div>
              <div>
                <h4 className="text-lg font-bold text-white tracking-tight">{t0.symbol} / {t1.symbol}</h4>
                <p className="text-xs text-white/40 font-mono">Uniswap v4 on LitVM LiteForge</p>
              </div>
            </div>

            {/* Parameters Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-black/40 border border-white/[0.08] p-4.5 rounded-2xl text-sm">
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider block mb-1">Fee Tier</span>
                <span className="font-bold text-primary font-mono text-base">{feeTier}%</span>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider block mb-1">Tick Spacing</span>
                <span className="font-bold text-white font-mono text-base">{tickSpacing}</span>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider block mb-1">Initial Rate</span>
                <span className="font-bold text-white font-mono text-sm">
                  1 {t0.symbol} = {(Number(priceRatioB) / Number(priceRatioA)).toFixed(4)} {t1.symbol}
                </span>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider block mb-1">Hook Status</span>
                <span className="font-mono text-xs text-white/70 block truncate">
                  {hooks === zeroAddress ? 'None (address(0))' : `${hooks.slice(0, 6)}…${hooks.slice(-4)}`}
                </span>
              </div>
            </div>

            {/* Action Button */}
            <div className="pt-2">
              {!isConnected ? (
                <button
                  onClick={() => open()}
                  className="w-full bg-primary hover:brightness-110 text-black py-4 px-6 text-sm font-bold uppercase tracking-wider rounded-2xl transition-all gold-glow active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                >
                  Connect Wallet
                </button>
              ) : (
                <button 
                  disabled={isConfirming}
                  className={`w-full bg-primary hover:brightness-110 text-black py-4 px-6 text-sm font-bold uppercase tracking-wider rounded-2xl transition-all gold-glow active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer shadow-lg ${isConfirming ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => initializePool({
                    tokenA: t0,
                    tokenB: t1,
                    fee: feeTier * 10000,
                    tickSpacing,
                    hooks,
                    priceRatioA,
                    priceRatioB
                  })}
                >
                  {isConfirming ? 'Initializing Pool...' : 'Initialize Pool'}
                </button>
              )}
            </div>
          </div>

      </div>
    </div>
  );
}
