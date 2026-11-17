import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { useAccount } from 'wagmi';

import { TokenConfig } from '@/config/tokens';
import { useTokenBalance } from '@/hooks/shared/useTokenBalance';
import TokenImage from './TokenImage';

export interface Token extends TokenConfig {
  balance?: string;
}

interface TokenSelectorProps {
  selectedToken: Token | null;
  onSelect: (token: Token) => void;
  tokens: Token[];
  excludeToken?: Token | null;
  label?: string;
  className?: string;
  disabled?: boolean;
}

const TokenListItem = ({ 
  token, 
  isSelected, 
  onClick 
}: { 
  token: Token; 
  isSelected: boolean; 
  onClick: () => void; 
}) => {
  const { address } = useAccount();
  const { formattedBalance } = useTokenBalance({ token, address });

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-150 group cursor-pointer text-left ${
        isSelected 
          ? 'bg-primary/10 border border-primary/30' 
          : 'hover:bg-white/[0.05] border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
          <TokenImage tokenAddress={token.address} symbol={token.symbol} className="w-full h-full object-contain" alt={token.symbol} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold tracking-tight token-symbol ${isSelected ? 'text-primary' : 'text-white'}`}>
              {token.symbol}
            </span>
            {isSelected && (
              <span className="text-xs uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                Selected
              </span>
            )}
          </div>
          <p className="text-xs text-white/40 truncate">{token.name}</p>
        </div>
      </div>
      
      <div className="flex flex-col items-end gap-0.5 pl-3 shrink-0">
        <span className="text-sm font-mono text-white/90 font-medium">{formattedBalance}</span>
        <span className="text-xs font-mono text-white/40">{token.symbol}</span>
      </div>
    </button>
  );
};

const TokenSelector: React.FC<TokenSelectorProps> = ({
  selectedToken,
  onSelect,
  tokens,
  excludeToken = null,
  label = "Select Token",
  className = "",
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isSameToken = (a: Token, b: Token) => {
    if (a.address && a.address !== '0x' && b.address && b.address !== '0x') {
      return a.address.toLowerCase() === b.address.toLowerCase();
    }
    return a.symbol.toLowerCase() === b.symbol.toLowerCase();
  };

  const filteredTokens = tokens.filter(token => {
    if (excludeToken && isSameToken(token, excludeToken)) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      token.symbol.toLowerCase().includes(query) ||
      token.name.toLowerCase().includes(query) ||
      (token.address !== '0x' && token.address.toLowerCase().includes(query))
    );
  });

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <div className={`relative ${className}`}>
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all duration-200 cursor-pointer ${
          selectedToken 
            ? 'bg-white/[0.06] hover:bg-white/[0.1] border-white/10 hover:border-white/20 text-white' 
            : 'bg-primary text-black border-transparent font-bold hover:brightness-110 shadow-md'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
      >
        {selectedToken ? (
          <>
            <div className="w-6 h-6 rounded-full overflow-hidden bg-white/10 shrink-0 border border-white/10">
              <TokenImage tokenAddress={selectedToken.address} symbol={selectedToken.symbol} className="w-full h-full object-contain" alt={selectedToken.symbol} />
            </div>
            <span className="text-sm font-semibold tracking-tight token-symbol text-white">{selectedToken.symbol}</span>
            {!disabled && (
              <ChevronDown 
                size={15} 
                className={`text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
              />
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-bold tracking-tight">{label}</span>
            <ChevronDown size={15} />
          </>
        )}
      </button>

      {/* Modal Overlay & Card */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => { setIsOpen(false); setSearchQuery(""); }}
        >
          <div
            className="relative w-full max-w-md bg-[#0d0d10] border border-white/[0.1] rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <h3 className="text-base font-bold text-white tracking-tight">Select a token</h3>
              <button 
                onClick={() => { setIsOpen(false); setSearchQuery(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="mt-4 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={16} />
              <input
                autoFocus
                type="text"
                placeholder="Search token name, symbol, or address"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-primary/50 focus:bg-white/[0.06] pl-11 pr-4 py-3 rounded-2xl text-sm text-white placeholder:text-white/30 outline-none transition-all"
              />
            </div>

            {/* Token List */}
            <div className="w-full flex-1 overflow-y-auto custom-scrollbar mt-4 -mr-2 pr-2 space-y-1">
              {filteredTokens.length > 0 ? (
                filteredTokens.map((token, index) => (
                  <TokenListItem
                    key={`${token.chainId ?? ''}-${token.symbol}-${index}`}
                    token={token}
                    isSelected={selectedToken ? isSameToken(token, selectedToken) : false}
                    onClick={() => {
                      onSelect(token);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                  />
                ))
              ) : (
                <div className="py-16 flex flex-col items-center justify-center text-center opacity-40">
                  <Search size={28} className="mb-2 text-white/40" />
                  <p className="text-xs uppercase tracking-wider font-semibold text-white/60">No tokens found</p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default TokenSelector;
