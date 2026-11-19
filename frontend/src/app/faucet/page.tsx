import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { 
  Droplets, 
  Clock, 
  Check, 
  Copy, 
  ExternalLink, 
  Sparkles, 
  AlertCircle, 
  RefreshCw, 
  Wallet,
  Fuel,
  Info,
  Plus,
  Vault,
  Coins,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { useFaucet, type FaucetTokenInfo } from '@/hooks/faucet/useFaucet';
import { useActiveChain } from '@/context/ActiveChainContext';
import { litvmLiteforge, LITEFORGE_FAUCET_URL, LITEFORGE_EXPLORER_URL } from '@/lib/chains';
import TokenImage from '@/components/TokenImage';
import Toast from '@/components/Toast';

function formatTimeParts(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

export default function FaucetPage() {
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  const { switchNetwork } = useActiveChain();
  const {
    faucetAddress,
    tokens,
    faucetNativeBalance,
    formattedFaucetNativeBalance,
    cooldown,
    secondsRemaining,
    canClaim,
    isLoading,
    isClaiming,
    isWrongNetwork,
    txHash,
    toast,
    dismissToast,
    claimTokens,
    refetch,
  } = useFaucet();

  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleAddTokenToWallet = async (token: FaucetTokenInfo) => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        await (window as any).ethereum.request({
          method: 'wallet_watchAsset',
          params: {
            type: 'ERC20',
            options: {
              address: token.address,
              symbol: token.symbol,
              decimals: token.decimals,
              image: token.logo ? `${window.location.origin}${token.logo}` : undefined,
            },
          },
        });
      } catch (err) {
        console.warn('User rejected or wallet does not support watchAsset:', err);
      }
    }
  };

  const timer = formatTimeParts(secondsRemaining);
  const isCooldownActive = secondsRemaining > 0;
  const anyUnfunded = tokens.some((t) => !t.isFaucetFunded);
  const fundedCount = tokens.filter((t) => t.isFaucetFunded).length;

  return (
    <div className="pb-40 relative z-10 w-full max-w-7xl mx-auto">
      {/* Toast Notification Container */}
      {toast.show && (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            txHash={toast.txHash}
            onClose={dismissToast}
          />
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-mono font-medium mb-3">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            LitVM LiteForge Testnet
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white flex items-center gap-3">
            Multi-Token Faucet
            <Droplets className="text-primary w-8 h-8 sm:w-10 sm:h-10" />
          </h1>
          <p className="text-base sm:text-lg text-white/50 mt-2 max-w-2xl leading-relaxed">
            Claim testnet ERC-20 tokens to swap, supply liquidity, and explore Uniswap v4 on LitVM LiteForge. 
            All tokens are distributed simultaneously with a single claim.
          </p>
        </div>

        {/* Faucet Contract Pill */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-md">
            <span className="text-xs text-white/40 font-mono">Faucet Contract:</span>
            <span className="text-xs text-white/80 font-mono font-semibold">
              {faucetAddress ? `${faucetAddress.slice(0, 6)}...${faucetAddress.slice(-4)}` : 'Loading...'}
            </span>
            <button
              onClick={() => handleCopy(faucetAddress)}
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Copy Faucet Contract Address"
            >
              {copiedAddress === faucetAddress ? (
                <Check size={14} className="text-emerald-400" />
              ) : (
                <Copy size={14} />
              )}
            </button>
            <a
              href={`${LITEFORGE_EXPLORER_URL}/address/${faucetAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              title="View Contract on Explorer"
            >
              <ExternalLink size={14} />
            </a>
          </div>

          <button
            onClick={refetch}
            disabled={isLoading}
            className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-white/20 text-white/50 hover:text-white transition-all cursor-pointer disabled:opacity-50"
            title="Refresh Faucet Data"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* Main Action Banner: Countdown Timer & Claim Button */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c0c10] via-[#09090c] to-[#121218] border border-white/[0.1] p-6 sm:p-10 mb-8 shadow-2xl backdrop-blur-xl">
        {/* Decorative background glow */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-[#8B5CF6]/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Eligibility Info */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-full ${
                !isConnected 
                  ? 'bg-amber-400' 
                  : isCooldownActive 
                    ? 'bg-rose-400 animate-pulse' 
                    : 'bg-emerald-400 animate-ping'
              }`} />
              <span className="text-xs uppercase tracking-widest font-mono font-bold text-white/60">
                {!isConnected 
                  ? 'Wallet Disconnected' 
                  : isWrongNetwork 
                    ? 'Wrong Network'
                    : isCooldownActive 
                      ? 'Cooldown in Progress' 
                      : 'Tokens Available to Claim'}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {!isConnected ? (
                'Connect your wallet to check claim eligibility'
              ) : isWrongNetwork ? (
                'Switch to LitVM LiteForge to claim'
              ) : isCooldownActive ? (
                'Next claim unlocks soon'
              ) : (
                'Claim All 6 Testnet Tokens'
              )}
            </h2>

            <p className="text-sm sm:text-base text-white/50 mt-2 max-w-xl leading-relaxed">
              {isCooldownActive ? (
                `Each wallet can claim once every 24 hours. Once the countdown timer finishes, the claim button will automatically activate.`
              ) : (
                `Receive 1,000 of every supported token (tUSDT, tLTC, STPT, GENOME, MC, ZYN) directly into your wallet in a single transaction.`
              )}
            </p>

            {/* Quick Metrics */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 mt-6 pt-6 border-t border-white/[0.06]">
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40">Tokens Per Claim</p>
                <p className="text-base sm:text-lg font-bold font-mono text-white mt-0.5">
                  1,000 <span className="text-xs text-white/40 font-normal">per token</span>
                </p>
              </div>
              <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40">Claim Cooldown</p>
                <p className="text-base sm:text-lg font-bold font-mono text-white mt-0.5">
                  {Math.round(cooldown / 3600)} Hours
                </p>
              </div>
              <div className="w-[1px] h-8 bg-white/10 hidden sm:block" />
              <div>
                <p className="text-xs uppercase tracking-wider text-white/40">Network Fee</p>
                <p className="text-base sm:text-lg font-bold font-mono text-white mt-0.5">
                  ~0.0001 zkLTC
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Countdown & CTA */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center bg-black/40 border border-white/[0.08] rounded-2xl p-6 sm:p-8 backdrop-blur-md">
            <span className="text-xs uppercase tracking-wider text-white/40 font-medium mb-3 flex items-center gap-1.5">
              <Clock size={14} className="text-primary" />
              Countdown to Next Claim
            </span>

            {/* Countdown Boxes */}
            <div className="flex items-center gap-2 sm:gap-3 my-2">
              <div className="flex flex-col items-center">
                <div className={`w-16 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center border font-mono text-2xl sm:text-3xl font-extrabold shadow-inner ${
                  isCooldownActive 
                    ? 'bg-white/[0.04] border-white/15 text-white' 
                    : 'bg-primary/15 border-primary/40 text-primary'
                }`}>
                  {timer.hours}
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 mt-1.5">Hours</span>
              </div>

              <span className="text-2xl font-mono text-white/30 -mt-5">:</span>

              <div className="flex flex-col items-center">
                <div className={`w-16 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center border font-mono text-2xl sm:text-3xl font-extrabold shadow-inner ${
                  isCooldownActive 
                    ? 'bg-white/[0.04] border-white/15 text-white' 
                    : 'bg-primary/15 border-primary/40 text-primary'
                }`}>
                  {timer.minutes}
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 mt-1.5">Minutes</span>
              </div>

              <span className="text-2xl font-mono text-white/30 -mt-5">:</span>

              <div className="flex flex-col items-center">
                <div className={`w-16 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center border font-mono text-2xl sm:text-3xl font-extrabold shadow-inner ${
                  isCooldownActive 
                    ? 'bg-white/[0.04] border-white/15 text-white' 
                    : 'bg-primary/15 border-primary/40 text-primary'
                }`}>
                  {timer.seconds}
                </div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-white/40 mt-1.5">Seconds</span>
              </div>
            </div>

            {/* Claim CTA Button */}
            <div className="w-full mt-6">
              {!isConnected ? (
                <button
                  onClick={() => open()}
                  className="w-full flex items-center justify-center gap-2 bg-primary hover:brightness-110 text-black py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.99]"
                >
                  <Wallet size={18} />
                  Connect Wallet to Claim
                </button>
              ) : isWrongNetwork ? (
                <button
                  onClick={() => switchNetwork(litvmLiteforge.id)}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:brightness-110 text-black py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.99]"
                >
                  Switch to LitVM LiteForge
                </button>
              ) : isCooldownActive ? (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 bg-white/[0.06] border border-white/10 text-white/40 py-4 rounded-xl text-base font-bold tracking-wide cursor-not-allowed"
                >
                  <Clock size={18} />
                  Cooldown Active ({timer.hours}:{timer.minutes}:{timer.seconds})
                </button>
              ) : (
                <button
                  onClick={claimTokens}
                  disabled={isClaiming}
                  className="w-full flex items-center justify-center gap-2.5 bg-primary hover:brightness-110 text-black py-4 rounded-xl text-base font-extrabold tracking-wide transition-all duration-200 cursor-pointer gold-glow shadow-xl active:scale-[0.99] disabled:opacity-50"
                >
                  {isClaiming ? (
                    <>
                      <RefreshCw size={18} className="animate-spin text-black" />
                      Claiming Tokens...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Claim All Tokens Now
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Faucet Contract Balances & Reserves Card */}
      <div className="mb-8 rounded-3xl bg-black/40 border border-white/[0.08] p-6 sm:p-8 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
              <Vault size={24} />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Faucet Contract Balances
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-medium ${
                  anyUnfunded 
                    ? 'bg-amber-500/10 border border-amber-500/25 text-amber-300' 
                    : 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
                }`}>
                  {fundedCount} of {tokens.length} Funded
                </span>
              </h3>
              <p className="text-xs text-white/40 mt-0.5">
                On-chain reserves currently stored in the faucet smart contract (`{faucetAddress}`).
              </p>
            </div>
          </div>

          {/* Native gas held by faucet contract */}
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.08] px-4 py-2.5 rounded-2xl self-start sm:self-auto">
            <Fuel size={16} className="text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Faucet Gas Reserve</p>
              <p className="text-sm font-bold font-mono text-white">
                {formattedFaucetNativeBalance} <span className="text-xs text-white/40 font-normal">zkLTC</span>
              </p>
            </div>
          </div>
        </div>

        {/* Token Balance Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {isLoading && tokens.length === 0 ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] animate-pulse">
                <div className="w-8 h-8 rounded-full bg-white/10 mb-3" />
                <div className="h-4 w-16 bg-white/10 rounded mb-2" />
                <div className="h-5 w-20 bg-white/5 rounded" />
              </div>
            ))
          ) : (
            tokens.map((token) => (
              <div
                key={`vault-${token.address}`}
                className={`p-4 rounded-2xl border transition-all duration-200 ${
                  token.isFaucetFunded 
                    ? 'bg-white/[0.02] border-white/[0.08] hover:border-white/20' 
                    : 'bg-amber-500/[0.02] border-amber-500/15 hover:border-amber-500/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-full border border-black bg-black overflow-hidden shadow-sm shrink-0">
                    <TokenImage
                      tokenAddress={token.address}
                      symbol={token.symbol}
                      className="w-full h-full object-contain"
                      alt={token.symbol}
                    />
                  </div>
                  <span className={`w-2 h-2 rounded-full ${
                    token.isFaucetFunded ? 'bg-emerald-400' : 'bg-amber-400'
                  }`} title={token.isFaucetFunded ? 'Funded' : 'Reserve Empty'} />
                </div>

                <p className="text-xs text-white/50 font-medium truncate">{token.symbol}</p>
                <p className="text-base font-mono font-bold text-white mt-0.5 tracking-tight">
                  {token.formattedFaucetBalance}
                </p>

                <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-mono">
                  <span className="text-white/40">Claims:</span>
                  <span className={token.isFaucetFunded ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {token.claimsRemaining.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Admin funding tip if empty */}
        {anyUnfunded && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Notice:</strong> One or more tokens have 0 faucet reserve. To enable claims for those tokens, 
                the token deployer or admin can transfer token supply directly to the Faucet Contract (`{faucetAddress}`).
              </span>
            </div>
            <button
              onClick={() => handleCopy(faucetAddress)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
            >
              <Copy size={13} />
              <span>Copy Faucet Address</span>
            </button>
          </div>
        )}
      </div>

      {/* Gas Faucet Alert / Helper Banner */}
      <div className="mb-10 p-5 rounded-2xl bg-gradient-to-r from-blue-900/20 via-primary/5 to-transparent border border-blue-500/20 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5 sm:mt-0">
            <Fuel size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Need Native zkLTC for Gas?
            </h4>
            <p className="text-xs text-white/60 mt-0.5 leading-relaxed">
              To send transactions and execute swaps on LitVM LiteForge, you will need a small amount of native gas (<span className="text-primary font-mono">zkLTC</span>). 
              Claim free native gas from the official LiteForge gas faucet.
            </p>
          </div>
        </div>
        <a
          href={LITEFORGE_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-white hover:text-primary transition-all shrink-0 cursor-pointer"
        >
          LiteForge Gas Faucet
          <ExternalLink size={14} />
        </a>
      </div>

      {/* Tokens List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">Available Tokens</h3>
            <p className="text-xs text-white/50 mt-0.5">
              Every eligible claim dispenses the exact amounts listed below.
            </p>
          </div>
          <span className="text-xs font-mono text-white/40 font-semibold bg-white/[0.04] px-3 py-1.5 rounded-full border border-white/[0.06]">
            {tokens.length} Tokens Configured
          </span>
        </div>

        {/* Tokens Table / Cards Grid */}
        <div className="bg-black/60 rounded-3xl border border-white/[0.08] overflow-hidden shadow-2xl backdrop-blur-md">
          {/* Table Header (Desktop) */}
          <div className="hidden md:grid grid-cols-[2fr_1.3fr_1.3fr_1.3fr_120px] gap-4 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-white/40 border-b border-white/[0.06] bg-[#0a0a0c]">
            <div>Token</div>
            <div className="text-right">Claim Amount</div>
            <div className="text-right">Your Wallet Balance</div>
            <div className="text-right">Faucet Contract Balance</div>
            <div className="text-right">Action</div>
          </div>

          {/* Token Rows */}
          {isLoading && tokens.length === 0 ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="grid grid-cols-[2fr_1.3fr_1.3fr_1.3fr_120px] gap-4 px-6 py-5 border-b border-white/[0.04] animate-pulse items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/10" />
                  <div className="h-4 w-28 bg-white/10 rounded" />
                </div>
                <div className="h-4 w-20 bg-white/5 rounded ml-auto" />
                <div className="h-4 w-20 bg-white/5 rounded ml-auto" />
                <div className="h-4 w-20 bg-white/5 rounded ml-auto" />
                <div className="h-8 w-20 bg-white/5 rounded-xl ml-auto" />
              </div>
            ))
          ) : (
            tokens.map((token) => (
              <div
                key={token.address}
                className="group grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1.3fr_1.3fr_120px] gap-4 px-6 py-4.5 items-center border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors last:border-0"
              >
                {/* Token Identity */}
                <div className="flex items-center justify-between md:justify-start gap-3.5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-full border-2 border-black bg-black overflow-hidden shadow-md shrink-0">
                      <TokenImage
                        tokenAddress={token.address}
                        symbol={token.symbol}
                        className="w-full h-full object-contain"
                        alt={token.symbol}
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white group-hover:text-primary transition-colors">
                          {token.symbol}
                        </span>
                        <span className="text-xs text-white/40 font-mono">
                          {token.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] font-mono text-white/30">
                          {`${token.address.slice(0, 6)}...${token.address.slice(-4)}`}
                        </span>
                        <button
                          onClick={() => handleCopy(token.address)}
                          className="text-white/30 hover:text-white transition-colors cursor-pointer p-0.5"
                          title="Copy Token Address"
                        >
                          {copiedAddress === token.address ? (
                            <Check size={12} className="text-emerald-400" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        <a
                          href={`${LITEFORGE_EXPLORER_URL}/token/${token.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/30 hover:text-white transition-colors p-0.5"
                          title="View on LiteForge Explorer"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Amount Badge */}
                  <div className="md:hidden flex flex-col items-end">
                    <span className="text-xs text-white/40">Claim</span>
                    <span className="text-sm font-bold font-mono text-primary">
                      +{token.formattedClaimAmount}
                    </span>
                  </div>
                </div>

                {/* Claim Amount (Desktop) */}
                <div className="hidden md:flex justify-end items-center">
                  <span className="text-base font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-1 rounded-xl">
                    +{token.formattedClaimAmount} {token.symbol}
                  </span>
                </div>

                {/* User Wallet Balance */}
                <div className="flex md:block justify-between items-center text-right">
                  <span className="md:hidden text-xs text-white/40 uppercase">Your Balance</span>
                  <span className="text-sm sm:text-base font-mono font-medium text-white/90">
                    {isConnected ? token.formattedUserBalance : '—'}
                  </span>
                </div>

                {/* Faucet Contract Balance */}
                <div className="flex md:block justify-between items-center text-right">
                  <span className="md:hidden text-xs text-white/40 uppercase">Faucet Balance</span>
                  <div className="flex flex-col items-end">
                    <div className="inline-flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${token.isFaucetFunded ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span className="text-sm sm:text-base font-mono font-medium text-white/80">
                        {token.formattedFaucetBalance}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-white/40">
                      {token.claimsRemaining.toLocaleString()} claims left
                    </span>
                  </div>
                </div>

                {/* Action: Add to Wallet */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleAddTokenToWallet(token)}
                    className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-white/70 hover:text-white transition-all cursor-pointer"
                    title="Add to MetaMask / Web3 Wallet"
                  >
                    <Plus size={13} />
                    <span>Add to Wallet</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
