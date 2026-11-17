import { Logo } from './Logo';
import { LITEFORGE_EXPLORER_URL, LITEFORGE_FAUCET_URL, LITEFORGE_HUB_URL } from '@/lib/chains';
import { ExternalLink } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-white/[0.08] bg-[#060608]/90 backdrop-blur-xl relative z-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo & Description */}
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <Logo />
            <span className="hidden sm:inline text-white/20">|</span>
            <p className="text-xs text-white/50">
              Uniswap v4 DEX built on <span className="text-white font-medium">LitVM LiteForge</span>
            </p>
          </div>

          {/* Network Links */}
          <div className="flex items-center flex-wrap justify-center gap-4 text-xs font-mono">
            <a 
              href={LITEFORGE_EXPLORER_URL} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition-all"
            >
              <span>Explorer</span>
              <ExternalLink size={11} className="text-primary" />
            </a>
            <a 
              href={LITEFORGE_FAUCET_URL} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition-all"
            >
              <span>Faucet</span>
              <ExternalLink size={11} className="text-primary" />
            </a>
            <a 
              href={LITEFORGE_HUB_URL} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="inline-flex items-center gap-1.5 text-white/50 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-white/20 transition-all"
            >
              <span>Testnet Hub</span>
              <ExternalLink size={11} className="text-primary" />
            </a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/30">
          <p>&copy; {new Date().getFullYear()} Meridian Protocol. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="font-mono text-white/50">Chain ID 4441 (zkLTC)</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
