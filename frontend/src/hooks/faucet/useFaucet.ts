import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWriteContract, useChainId } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { MULTI_TOKEN_FAUCET_ADDRESS } from '@/lib/constants';
import MultiTokenFaucetABI from '@/abi/MultiTokenFaucet.json';
import { TOKENS, type TokenConfig } from '@/config/tokens';
import { litvmLiteforge } from '@/lib/chains';
import type { ToastType } from '@/components/Toast';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
] as const;

export interface FaucetTokenInfo {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  claimAmount: bigint;
  formattedClaimAmount: string;
  userBalance: bigint;
  formattedUserBalance: string;
  faucetBalance: bigint;
  formattedFaucetBalance: string;
  claimsRemaining: number;
  isFaucetFunded: boolean;
}

export interface ToastState {
  show: boolean;
  type: ToastType;
  title: string;
  message: string;
  txHash?: string;
}

function formatAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const float = parseFloat(formatUnits(raw, decimals));
  if (float === 0) return '0';
  if (float < 0.0001) return '<0.0001';
  if (float < 1) return float.toFixed(4);
  return float.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function useFaucet() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [tokens, setTokens] = useState<FaucetTokenInfo[]>([]);
  const [faucetNativeBalance, setFaucetNativeBalance] = useState<bigint>(0n);
  const [formattedFaucetNativeBalance, setFormattedFaucetNativeBalance] = useState<string>('0.0000');
  const [cooldown, setCooldown] = useState<number>(86400); // default 24h
  const [lastClaimTime, setLastClaimTime] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [toast, setToast] = useState<ToastState>({
    show: false,
    type: 'pending',
    title: '',
    message: '',
    txHash: undefined,
  });

  const showToast = useCallback((type: ToastType, title: string, message: string, txHash?: string) => {
    setToast({ show: true, type, title, message, txHash });
  }, []);

  const dismissToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  const refetch = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const isWrongNetwork = isConnected && chainId !== litvmLiteforge.id;

  // 1. Fetch Faucet state & tokens
  useEffect(() => {
    if (!publicClient || !MULTI_TOKEN_FAUCET_ADDRESS) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchFaucetData = async () => {
      setIsLoading(true);
      try {
        const faucetAddress = MULTI_TOKEN_FAUCET_ADDRESS as `0x${string}`;

        // Read cooldown
        let cooldownSec = 86400;
        try {
          const cd = await publicClient.readContract({
            address: faucetAddress,
            abi: MultiTokenFaucetABI.abi,
            functionName: 'cooldown',
          }) as bigint;
          cooldownSec = Number(cd);
          if (!cancelled) setCooldown(cooldownSec);
        } catch (e) {
          console.warn('Failed to read faucet cooldown:', e);
        }

        // Read native balance of faucet contract
        try {
          const nativeBal = await publicClient.getBalance({ address: faucetAddress });
          if (!cancelled) {
            setFaucetNativeBalance(nativeBal);
            setFormattedFaucetNativeBalance(parseFloat(formatUnits(nativeBal, 18)).toFixed(4));
          }
        } catch (e) {
          console.warn('Failed to read faucet native balance:', e);
        }

        // Read user's last claim & time until next claim
        let userTimeRemaining = 0;
        let userLastClaim = 0;
        if (userAddress && isAddress(userAddress)) {
          try {
            const [rem, last] = await Promise.all([
              publicClient.readContract({
                address: faucetAddress,
                abi: MultiTokenFaucetABI.abi,
                functionName: 'timeUntilNextClaim',
                args: [userAddress],
              }) as Promise<bigint>,
              publicClient.readContract({
                address: faucetAddress,
                abi: MultiTokenFaucetABI.abi,
                functionName: 'lastClaim',
                args: [userAddress],
              }) as Promise<bigint>,
            ]);
            userTimeRemaining = Number(rem);
            userLastClaim = Number(last);
          } catch (e) {
            console.warn('Failed to read user claim status:', e);
          }
        }

        if (!cancelled) {
          setLastClaimTime(userLastClaim);
          setSecondsRemaining(userTimeRemaining);
        }

        // Read token list from contract
        let tokenAddresses: `0x${string}`[] = [];
        try {
          const fetchedTokens = await publicClient.readContract({
            address: faucetAddress,
            abi: MultiTokenFaucetABI.abi,
            functionName: 'getTokens',
          }) as `0x${string}`[];
          tokenAddresses = fetchedTokens;
        } catch (e) {
          console.warn('Failed to read getTokens() from faucet, falling back to TOKENS:', e);
          tokenAddresses = TOKENS.map((t) => t.address as `0x${string}`);
        }

        // For each token, get claim amount, decimals, symbol, user balance, and faucet balance
        const tokenInfos: FaucetTokenInfo[] = await Promise.all(
          tokenAddresses.map(async (address) => {
            const configMatch = TOKENS.find(
              (t) => t.address.toLowerCase() === address.toLowerCase()
            );

            let decimals = configMatch?.decimals ?? 18;
            let symbol = configMatch?.symbol ?? 'TOKEN';
            let name = configMatch?.name ?? symbol;
            let logo = configMatch?.logo ?? '';

            // If not found in config, query on-chain
            if (!configMatch) {
              try {
                const [d, s, n] = await Promise.all([
                  publicClient.readContract({
                    address,
                    abi: ERC20_ABI,
                    functionName: 'decimals',
                  }) as Promise<number>,
                  publicClient.readContract({
                    address,
                    abi: ERC20_ABI,
                    functionName: 'symbol',
                  }) as Promise<string>,
                  publicClient.readContract({
                    address,
                    abi: ERC20_ABI,
                    functionName: 'name',
                  }) as Promise<string>,
                ]);
                decimals = d;
                symbol = s;
                name = n;
              } catch (e) {
                console.warn(`Failed to read metadata for token ${address}:`, e);
              }
            }

            // Read claim amount configured in faucet
            let claimAmount = 0n;
            try {
              claimAmount = await publicClient.readContract({
                address: faucetAddress,
                abi: MultiTokenFaucetABI.abi,
                functionName: 'amounts',
                args: [address],
              }) as bigint;
            } catch (e) {
              console.warn(`Failed to read faucet amount for ${address}:`, e);
            }

            // Read user balance
            let userBalance = 0n;
            if (userAddress && isAddress(userAddress)) {
              try {
                userBalance = await publicClient.readContract({
                  address,
                  abi: ERC20_ABI,
                  functionName: 'balanceOf',
                  args: [userAddress],
                }) as bigint;
              } catch (e) {
                console.warn(`Failed to read user balance for ${address}:`, e);
              }
            }

            // Read faucet contract balance
            let faucetBalance = 0n;
            try {
              faucetBalance = await publicClient.readContract({
                address,
                abi: ERC20_ABI,
                functionName: 'balanceOf',
                args: [faucetAddress],
              }) as bigint;
            } catch (e) {
              console.warn(`Failed to read faucet balance for ${address}:`, e);
            }

            const claimsRemaining = claimAmount > 0n ? Number(faucetBalance / claimAmount) : 0;

            return {
              address,
              name,
              symbol,
              decimals,
              logo,
              claimAmount,
              formattedClaimAmount: formatAmount(claimAmount, decimals),
              userBalance,
              formattedUserBalance: formatAmount(userBalance, decimals),
              faucetBalance,
              formattedFaucetBalance: formatAmount(faucetBalance, decimals),
              claimsRemaining,
              isFaucetFunded: faucetBalance >= claimAmount && claimAmount > 0n,
            };
          })
        );

        if (!cancelled) {
          setTokens(tokenInfos);
        }
      } catch (err) {
        console.error('Error fetching faucet data:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchFaucetData();

    return () => {
      cancelled = true;
    };
  }, [publicClient, userAddress, refreshTrigger]);

  // 2. Real-time 1-second countdown timer
  useEffect(() => {
    if (secondsRemaining <= 0) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsRemaining]);

  // 3. Claim action
  const claimTokens = async () => {
    if (!userAddress || !publicClient) {
      showToast('error', 'Wallet Not Connected', 'Please connect your wallet to claim faucet tokens.');
      return;
    }

    if (isWrongNetwork) {
      showToast('error', 'Wrong Network', 'Please switch your wallet to LitVM LiteForge.');
      return;
    }

    if (secondsRemaining > 0) {
      showToast('error', 'Cooldown Active', 'You must wait until the countdown finishes to claim again.');
      return;
    }

    const faucetAddress = MULTI_TOKEN_FAUCET_ADDRESS as `0x${string}`;

    try {
      setIsClaiming(true);
      showToast('pending', 'Initiating Claim', 'Please confirm the claim transaction in your wallet...');

      // Attempt simulation first
      try {
        await publicClient.simulateContract({
          address: faucetAddress,
          abi: MultiTokenFaucetABI.abi,
          functionName: 'claim',
          account: userAddress,
        });
      } catch (simErr: any) {
        console.warn('Simulation notice:', simErr);
      }

      const hash = await writeContractAsync({
        address: faucetAddress,
        abi: MultiTokenFaucetABI.abi,
        functionName: 'claim',
      });

      setTxHash(hash);
      showToast('pending', 'Transaction Submitted', 'Claiming all testnet tokens...', hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain');
      }

      showToast('success', 'Tokens Claimed!', 'Your testnet tokens have been transferred successfully.', hash);
      refetch();
    } catch (err: any) {
      console.error('Claim error:', err);
      const msg = err?.shortMessage ?? err?.message ?? 'Failed to claim tokens.';
      showToast('error', 'Claim Failed', msg);
    } finally {
      setIsClaiming(false);
    }
  };

  return {
    faucetAddress: MULTI_TOKEN_FAUCET_ADDRESS as `0x${string}`,
    tokens,
    faucetNativeBalance,
    formattedFaucetNativeBalance,
    cooldown,
    lastClaimTime,
    secondsRemaining,
    canClaim: isConnected && !isWrongNetwork && secondsRemaining === 0 && !isClaiming,
    isLoading,
    isClaiming,
    isWrongNetwork,
    txHash,
    toast,
    dismissToast,
    claimTokens,
    refetch,
  };
}
