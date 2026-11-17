import { useState } from 'react';
import { WagmiProvider, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { litvmLiteforge } from '@/lib/chains';
import { ActiveChainProvider } from '@/context/ActiveChainContext';

const projectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
  import.meta.env.VITE_REOWN_PROJECT_ID ||
  '94995f5e4564f8a0664f16eac1852573';

// Create Wagmi Adapter with LitVM LiteForge
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: [litvmLiteforge],
  ssr: true,
  transports: {
    [litvmLiteforge.id]: http(),
  }
});

// Export underlying Wagmi config
export const config = wagmiAdapter.wagmiConfig;

// Initialize AppKit with LitVM LiteForge network
createAppKit({
  adapters: [wagmiAdapter],
  networks: [litvmLiteforge],
  defaultNetwork: litvmLiteforge,
  projectId,
  metadata: {
    name: 'Meridian',
    description: 'The univ4 DEX on LitVM LiteForge',
    url: 'https://testnet.litvm.com',
    icons: ['https://avatars.githubusercontent.com/u/179229932'],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#F472B6',
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!projectId || projectId === 'insert-your-project-id-here') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4">
        <div className="max-w-md w-full bg-red-900/20 border border-red-500/50 p-6 rounded-2xl text-center shadow-lg">
          <h2 className="text-xl  text-red-400 mb-2">Missing WalletConnect Project ID</h2>
          <p className="text-gray-300 text-sm mb-4">
            Could not initialize AppKit. Add your Project ID from{' '}
            <a
              href="https://cloud.reown.com"
              className="text-red-300 underline"
              target="_blank"
              rel="noreferrer"
            >
              Reown Cloud
            </a>{' '}
            to <code className="bg-black/50 px-2 py-1 rounded text-red-300">.env</code> as{' '}
            <code className="bg-black/50 px-2 py-1 rounded text-red-300">
              VITE_WALLETCONNECT_PROJECT_ID
            </code>{' '}
            and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ActiveChainProvider>
          {children}
        </ActiveChainProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
