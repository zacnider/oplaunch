import { useState, useCallback, useRef } from 'react';
import { getContract, TransactionOutputFlags } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useProvider } from '../context/ProviderContext';
import { BONDING_CURVE_ABI, OP20_ABI } from '../config/abis';

const opnetTestnet = (networks as Record<string, typeof networks.testnet>).opnetTestnet;

const MAX_SAT = 1_000_000n;

export interface TradeStep {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export interface TradeStatus {
  active: boolean;
  type: 'buy' | 'sell' | null;
  steps: TradeStep[];
  currentStep: number;
  error?: string;
  success?: boolean;
}

const INITIAL_TRADE_STATUS: TradeStatus = {
  active: false,
  type: null,
  steps: [],
  currentStep: 0,
};

const BUY_STEPS = [
  'Fetching escrow address...',
  'Simulating buy transaction...',
  'Sending transaction to wallet...',
  'Confirming on-chain...',
  'Transaction confirmed!',
];

const SELL_STEPS = [
  'Simulating token approval...',
  'Sending approval to wallet...',
  'Waiting for approval confirmation...',
  'Simulating sell transaction...',
  'Sending sell to wallet...',
  'Confirming on-chain...',
  'Transaction confirmed!',
];

const SWAP_BTC_STEPS = [
  'Simulating swap transaction...',
  'Sending transaction to wallet...',
  'Confirming on-chain...',
  'Swap confirmed!',
];

const SWAP_TOKEN_STEPS = [
  'Simulating token approval...',
  'Sending approval to wallet...',
  'Waiting for approval confirmation...',
  'Simulating swap transaction...',
  'Sending swap to wallet...',
  'Confirming on-chain...',
  'Swap confirmed!',
];

export interface CurveState {
  virtualBtcReserve: bigint;
  virtualTokenReserve: bigint;
  realBtcCollected: bigint;
  targetMarketCap: bigint;
  tokensSold: bigint;
  tokensRemaining: bigint;
  totalTrades: bigint;
  isActive: boolean;
  isGraduated: boolean;
}

export interface PoolState {
  poolBtcReserve: bigint;
  poolTokenReserve: bigint;
  poolK: bigint;
  totalSwaps: bigint;
  isGraduated: boolean;
}

/**
 * Hook for interacting with a BondingCurve + its OP_20 token.
 * Each token has its own BondingCurve contract at a unique address.
 * Buy/sell uses real OP_20 token transfers via TransferHelper.
 */
export function useBondingCurve(curveAddress: string, tokenAddress?: string) {
  const provider = useProvider();
  const { walletAddress, address, network } = useWalletConnect();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>(INITIAL_TRADE_STATUS);

  const net = network || opnetTestnet;

  const makeSteps = (labels: string[]): TradeStep[] =>
    labels.map((label) => ({ label, status: 'pending' as const }));

  const advanceStep = (stepLabels: string[], stepIndex: number) => {
    setTradeStatus((prev) => ({
      ...prev,
      currentStep: stepIndex,
      steps: stepLabels.map((label, i) => ({
        label,
        status: i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending',
      })),
    }));
  };

  const finishTrade = (stepLabels: string[], success: boolean, errorMsg?: string) => {
    setTradeStatus((prev) => ({
      ...prev,
      currentStep: stepLabels.length - 1,
      success,
      error: errorMsg,
      steps: stepLabels.map((label, i) => ({
        label,
        status: success
          ? 'done'
          : i < (prev.currentStep) ? 'done' : i === prev.currentStep ? 'error' : 'pending',
      })),
    }));
  };

  const resetTradeStatus = () => setTradeStatus(INITIAL_TRADE_STATUS);

  const getCurveContract = useCallback(() => {
    if (!curveAddress) return null;
    return getContract(
      curveAddress,
      BONDING_CURVE_ABI as any,
      provider,
      net,
      address || undefined,
    );
  }, [curveAddress, provider, address, net]);

  const getTokenContract = useCallback(() => {
    if (!tokenAddress) return null;
    return getContract(
      tokenAddress,
      OP20_ABI as any,
      provider,
      net,
      address || undefined,
    );
  }, [tokenAddress, provider, address, net]);

  // Resolve bech32 contract address to Address object
  const resolveContractAddress = async (bech32: string): Promise<Address | null> => {
    // Try getPublicKeysInfoRaw for tweakedPubkey (more reliable)
    try {
      const raw = await (provider as any).getPublicKeysInfoRaw(bech32);
      if (raw) {
        const info = raw[bech32] || Object.values(raw)[0];
        const key = info?.tweakedPubkey || info?.mldsaHashedPublicKey || info?.originalPubKey;
        if (key && !info?.error) {
          return Address.fromString(key);
        }
      }
    } catch { /* ignore */ }
    // Fallback: standard getPublicKeyInfo
    try {
      const addr = await provider.getPublicKeyInfo(bech32, false);
      if (addr) return addr;
    } catch { /* ignore */ }
    return null;
  };

  const sendTx = async (sim: any, satToSpend: bigint = MAX_SAT) => {
    return sim.sendTransaction({
      signer: null,
      mldsaSigner: null,
      refundTo: walletAddress ?? '',
      maximumAllowedSatToSpend: satToSpend,
      network: net,
    });
  };

  // Get curve state (read-only)
  const getCurveState = useCallback(async (): Promise<CurveState | null> => {
    try {
      const contract = getCurveContract() as any;
      if (!contract) return null;
      const result = await contract.getCurveState();
      if ('error' in result) {
        setError(result.error);
        return null;
      }
      return result.properties as CurveState;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get curve state');
      return null;
    }
  }, [getCurveContract]);

  // Get real OP_20 token balance
  const getBalance = useCallback(async (user?: string): Promise<bigint> => {
    const addrStr = user || walletAddress;
    if (!addrStr || !tokenAddress) return 0n;
    try {
      const contract = getTokenContract() as any;
      if (!contract) return 0n;
      const addrObj = user ? Address.fromString(user) : address;
      if (!addrObj) return 0n;
      const result = await contract.balanceOf(addrObj);
      if ('error' in result) return 0n;
      return result.properties.balance as bigint;
    } catch {
      return 0n;
    }
  }, [walletAddress, address, tokenAddress, getTokenContract]);

  // Get current allowance for a spender
  const getAllowance = async (spender: Address): Promise<bigint> => {
    try {
      const tokenContract = getTokenContract() as any;
      if (!tokenContract || !address) return 0n;
      const result = await tokenContract.allowance(address, spender);
      if ('error' in result) return 0n;
      return result.properties.remaining as bigint;
    } catch {
      return 0n;
    }
  };

  // Refs to always use the latest functions in long-running polls (avoids stale closures)
  const getBalanceRef = useRef(getBalance);
  getBalanceRef.current = getBalance;
  const getAllowanceRef = useRef(getAllowance);
  getAllowanceRef.current = getAllowance;

  // Poll until token balance changes (confirms tx on-chain)
  // Timeout after 20 minutes (80 attempts at 15s intervals) — BTC blocks ~10-15 min
  const pollForBalanceChange = async (prevBalance: bigint): Promise<boolean> => {
    const MAX_ATTEMPTS = 80;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const current = await getBalanceRef.current();
        console.log(`[poll] balance check #${attempt + 1}: prev=${prevBalance}, current=${current}`);
        if (current !== prevBalance) return true;
      } catch (err) {
        console.warn(`[poll] balance check #${attempt + 1} error:`, err);
      }
    }
    throw new Error('Transaction confirmation timed out after 20 minutes. Check your wallet for status.');
  };

  // Poll until allowance increases above the pre-approval level
  // Timeout after 20 minutes (80 attempts at 15s intervals) — BTC blocks ~10-15 min
  const pollForApprovalConfirmation = async (spender: Address, prevAllowance: bigint): Promise<boolean> => {
    const MAX_ATTEMPTS = 80;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const current = await getAllowanceRef.current(spender);
        console.log(`[poll] allowance check #${attempt + 1}: prev=${prevAllowance}, current=${current}`);
        if (current > prevAllowance) return true;
      } catch (err) {
        console.warn(`[poll] allowance check #${attempt + 1} error:`, err);
      }
    }
    throw new Error('Approval confirmation timed out after 20 minutes. Check your wallet for status.');
  };

  // Get quote: how many tokens for given BTC amount (read-only)
  const getQuote = useCallback(async (btcAmount: bigint): Promise<bigint | null> => {
    try {
      const contract = getCurveContract() as any;
      if (!contract) return null;
      const result = await contract.getTokensForBtc(btcAmount);
      if ('error' in result) return null;
      return result.properties.tokensOut as bigint;
    } catch {
      return null;
    }
  }, [getCurveContract]);

  // Get escrow address from the curve contract (read-only)
  const getEscrowAddress = useCallback(async (): Promise<string | null> => {
    try {
      const contract = getCurveContract() as any;
      if (!contract) return null;
      const result = await contract.getEscrowAddress();
      if ('error' in result) return null;
      return result.properties.escrowAddress as string;
    } catch {
      return null;
    }
  }, [getCurveContract]);

  // Get pending BTC withdrawal amount for a user (read-only)
  const getPendingWithdrawal = useCallback(async (user?: string): Promise<bigint> => {
    const addrStr = user || walletAddress;
    if (!addrStr) return 0n;
    try {
      const contract = getCurveContract() as any;
      if (!contract) return 0n;
      const addrObj = user ? Address.fromString(user) : address;
      if (!addrObj) return 0n;
      const result = await contract.getPendingWithdrawal(addrObj);
      if ('error' in result) return 0n;
      return result.properties.pendingBtc as bigint;
    } catch {
      return 0n;
    }
  }, [walletAddress, address, getCurveContract]);

  // Buy tokens on the bonding curve
  // Real BTC sent via extraOutputs to escrow address
  const buy = useCallback(async (btcAmount: bigint, escrowAddr?: string) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'buy', steps: makeSteps(BUY_STEPS), currentStep: 0 });
    try {
      // Step 0: Fetch escrow address
      advanceStep(BUY_STEPS, 0);
      const contract = getCurveContract() as any;
      if (!contract) { setError('Curve contract not available'); return null; }

      let escrow = escrowAddr;
      if (!escrow) {
        escrow = await getEscrowAddress() ?? undefined;
      }
      if (!escrow) {
        setError('Could not get escrow address');
        finishTrade(BUY_STEPS, false, 'Could not get escrow address');
        return null;
      }

      // Step 1: Simulate buy transaction
      advanceStep(BUY_STEPS, 1);
      contract.setTransactionDetails({
        inputs: [],
        outputs: [
          {
            to: escrow,
            value: btcAmount,
            index: 1,
            scriptPubKey: undefined,
            flags: TransactionOutputFlags.hasTo,
          },
        ],
      });

      const sim = await contract.buy(btcAmount);
      if ('error' in sim) {
        setError(sim.error);
        finishTrade(BUY_STEPS, false, sim.error);
        return null;
      }

      // Step 2: Send transaction to wallet
      advanceStep(BUY_STEPS, 2);
      const balBefore = await getBalance();
      const result = await sim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress ?? '',
        maximumAllowedSatToSpend: MAX_SAT,
        network: net,
        extraOutputs: [
          { address: escrow, value: btcAmount },
        ],
      });

      // Step 3: Confirming on-chain...
      advanceStep(BUY_STEPS, 3);
      await pollForBalanceChange(balBefore);

      // Step 4: Confirmed!
      advanceStep(BUY_STEPS, 4);
      finishTrade(BUY_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Buy failed';
      setError(msg);
      finishTrade(BUY_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getCurveContract, getEscrowAddress, net]);

  // Sell tokens back to the bonding curve
  // Step 1: approve curve to spend tokens
  // Step 2: call curve.sell()
  const sell = useCallback(async (tokenAmount: bigint) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    if (!tokenAddress) {
      setError('Token address not available');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'sell', steps: makeSteps(SELL_STEPS), currentStep: 0 });
    try {
      // Step 0: Simulate token approval
      advanceStep(SELL_STEPS, 0);
      const tokenContract = getTokenContract() as any;
      if (!tokenContract) { setError('Token contract not available'); return null; }

      const curveAddr = await resolveContractAddress(curveAddress);
      if (!curveAddr) {
        setError('Could not resolve curve contract address');
        finishTrade(SELL_STEPS, false, 'Could not resolve curve contract address');
        return null;
      }
      const prevAllowance = await getAllowance(curveAddr);
      const approveSim = await tokenContract.increaseAllowance(curveAddr, tokenAmount);
      if ('error' in approveSim) {
        const msg = 'Approve failed: ' + approveSim.error;
        setError(msg);
        finishTrade(SELL_STEPS, false, msg);
        return null;
      }

      // Step 1: Send approval to wallet
      advanceStep(SELL_STEPS, 1);
      await sendTx(approveSim);

      // Step 2: Wait for approval confirmation
      advanceStep(SELL_STEPS, 2);
      await pollForApprovalConfirmation(curveAddr, prevAllowance);

      // Step 3: Simulate sell transaction
      advanceStep(SELL_STEPS, 3);
      const curveContract = getCurveContract() as any;
      if (!curveContract) { setError('Curve contract not available'); return null; }

      const sellSim = await curveContract.sell(tokenAmount);
      if ('error' in sellSim) {
        setError(sellSim.error);
        finishTrade(SELL_STEPS, false, sellSim.error);
        return null;
      }

      // Step 4: Send sell to wallet
      advanceStep(SELL_STEPS, 4);
      const balBefore = await getBalance();
      const result = await sendTx(sellSim);

      // Step 5: Confirming on-chain...
      advanceStep(SELL_STEPS, 5);
      await pollForBalanceChange(balBefore);

      // Step 6: Confirmed!
      advanceStep(SELL_STEPS, 6);
      finishTrade(SELL_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sell failed';
      setError(msg);
      finishTrade(SELL_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, curveAddress, tokenAddress, getCurveContract, getTokenContract]);

  // Get user position on the curve (read-only)
  const getUserPosition = useCallback(async (user?: string) => {
    const addrStr = user || walletAddress;
    if (!addrStr) return null;
    try {
      const contract = getCurveContract() as any;
      if (!contract) return null;
      const addrObj = user ? Address.fromString(user) : address;
      if (!addrObj) return null;
      const result = await contract.getUserPosition(addrObj);
      if ('error' in result) return null;
      return result.properties as { btcDeposited: bigint; tokensBought: bigint };
    } catch {
      return null;
    }
  }, [walletAddress, address, getCurveContract]);

  // Get AMM pool state (read-only, post-graduation)
  const getPoolState = useCallback(async (): Promise<PoolState | null> => {
    try {
      const contract = getCurveContract() as any;
      if (!contract) return null;
      const result = await contract.getPoolState();
      if ('error' in result) return null;
      return result.properties as PoolState;
    } catch {
      return null;
    }
  }, [getCurveContract]);

  // Swap BTC for tokens on AMM pool (post-graduation)
  // Real BTC sent via extraOutputs to escrow address (same as buy)
  const swapBtcForTokens = useCallback(async (btcAmount: bigint) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'buy', steps: makeSteps(SWAP_BTC_STEPS), currentStep: 0 });
    try {
      // Step 0: Fetch escrow + simulate swap
      advanceStep(SWAP_BTC_STEPS, 0);
      const contract = getCurveContract() as any;
      if (!contract) { setError('Curve contract not available'); return null; }

      const escrow = await getEscrowAddress();
      if (!escrow) {
        setError('Could not get escrow address');
        finishTrade(SWAP_BTC_STEPS, false, 'Could not get escrow address');
        return null;
      }

      // Set transaction details so contract can verify escrow output
      contract.setTransactionDetails({
        inputs: [],
        outputs: [
          {
            to: escrow,
            value: btcAmount,
            index: 1,
            scriptPubKey: undefined,
            flags: TransactionOutputFlags.hasTo,
          },
        ],
      });

      const sim = await contract.swapBtcForTokens(btcAmount);
      if ('error' in sim) {
        setError(sim.error);
        finishTrade(SWAP_BTC_STEPS, false, sim.error);
        return null;
      }

      // Step 1: Send to wallet with extraOutputs (real BTC to escrow)
      advanceStep(SWAP_BTC_STEPS, 1);
      const balBefore = await getBalance();
      const result = await sim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress ?? '',
        maximumAllowedSatToSpend: MAX_SAT,
        network: net,
        extraOutputs: [
          { address: escrow, value: btcAmount },
        ],
      });

      // Step 2: Confirming on-chain...
      advanceStep(SWAP_BTC_STEPS, 2);
      await pollForBalanceChange(balBefore);

      // Step 3: Confirmed!
      advanceStep(SWAP_BTC_STEPS, 3);
      finishTrade(SWAP_BTC_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg);
      finishTrade(SWAP_BTC_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getCurveContract, getEscrowAddress, net]);

  // Swap tokens for BTC on AMM pool (post-graduation)
  // Step 1: approve curve, Step 2: call swapTokensForBtc
  const swapTokensForBtc = useCallback(async (tokenAmount: bigint) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    if (!tokenAddress) {
      setError('Token address not available');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'sell', steps: makeSteps(SWAP_TOKEN_STEPS), currentStep: 0 });
    try {
      // Step 0: Simulate approval
      advanceStep(SWAP_TOKEN_STEPS, 0);
      const tokenContract = getTokenContract() as any;
      if (!tokenContract) { setError('Token contract not available'); return null; }

      const curveAddr = await resolveContractAddress(curveAddress);
      if (!curveAddr) {
        setError('Could not resolve curve contract address');
        finishTrade(SWAP_TOKEN_STEPS, false, 'Could not resolve curve contract address');
        return null;
      }
      const prevAllowance = await getAllowance(curveAddr);
      const approveSim = await tokenContract.increaseAllowance(curveAddr, tokenAmount);
      if ('error' in approveSim) {
        const msg = 'Approve failed: ' + approveSim.error;
        setError(msg);
        finishTrade(SWAP_TOKEN_STEPS, false, msg);
        return null;
      }

      // Step 1: Send approval
      advanceStep(SWAP_TOKEN_STEPS, 1);
      await sendTx(approveSim);

      // Step 2: Wait for approval confirmation
      advanceStep(SWAP_TOKEN_STEPS, 2);
      await pollForApprovalConfirmation(curveAddr, prevAllowance);

      // Step 3: Simulate swap
      advanceStep(SWAP_TOKEN_STEPS, 3);
      const curveContract = getCurveContract() as any;
      if (!curveContract) { setError('Curve contract not available'); return null; }

      const swapSim = await curveContract.swapTokensForBtc(tokenAmount);
      if ('error' in swapSim) {
        setError(swapSim.error);
        finishTrade(SWAP_TOKEN_STEPS, false, swapSim.error);
        return null;
      }

      // Step 4: Send swap
      advanceStep(SWAP_TOKEN_STEPS, 4);
      const balBefore = await getBalance();
      const result = await sendTx(swapSim);

      // Step 5: Confirming on-chain...
      advanceStep(SWAP_TOKEN_STEPS, 5);
      await pollForBalanceChange(balBefore);

      // Step 6: Confirmed!
      advanceStep(SWAP_TOKEN_STEPS, 6);
      finishTrade(SWAP_TOKEN_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Swap failed';
      setError(msg);
      finishTrade(SWAP_TOKEN_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, curveAddress, tokenAddress, getCurveContract, getTokenContract]);

  // Claim pending BTC withdrawal via backend escrow
  const claimBtc = useCallback(async () => {
    if (!walletAddress || !address) {
      setError('Wallet not connected');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      // Pre-check: verify pending withdrawal exists on-chain (using direct address object)
      const localPending = await getPendingWithdrawal();
      console.log('[claimBtc] Local pending check:', localPending.toString(), 'sats');
      console.log('[claimBtc] walletAddress (bech32):', walletAddress);
      console.log('[claimBtc] address.toString():', address.toString());
      console.log('[claimBtc] address.toHex():', address.toHex());

      if (localPending <= 0n) {
        setError('No pending BTC withdrawal found on-chain');
        return null;
      }

      const userPubKeyHex = address.toString();
      const resp = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/escrow/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curveAddress,
          userBech32: walletAddress,
          userPubKeyHex,
        }),
      });
      const data = await resp.json();
      if (!data.success) {
        setError(data.error || 'Claim failed');
        return null;
      }
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, address, curveAddress, getPendingWithdrawal]);

  return {
    getCurveState,
    getPoolState,
    getBalance,
    getQuote,
    getEscrowAddress,
    getPendingWithdrawal,
    buy,
    sell,
    claimBtc,
    swapBtcForTokens,
    swapTokensForBtc,
    getUserPosition,
    loading,
    error,
    setError,
    tradeStatus,
    resetTradeStatus,
  };
}
