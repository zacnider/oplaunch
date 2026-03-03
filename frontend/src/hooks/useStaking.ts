import { useState, useCallback, useRef } from 'react';
import { getContract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useProvider } from '../context/ProviderContext';
import { STAKING_VAULT_ABI, OP20_ABI } from '../config/abis';

const opnetTestnet = (networks as Record<string, typeof networks.testnet>).opnetTestnet;
const MAX_SAT = 1_000_000n;

export interface TradeStep {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export interface TradeStatus {
  active: boolean;
  type: 'stake' | 'unstake' | 'claim' | null;
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

const STAKE_STEPS = [
  'Simulating token approval...',
  'Sending approval to wallet...',
  'Waiting for approval confirmation...',
  'Simulating stake transaction...',
  'Sending stake to wallet...',
  'Confirming on-chain...',
  'Stake confirmed!',
];

const UNSTAKE_STEPS = [
  'Simulating unstake transaction...',
  'Sending unstake to wallet...',
  'Confirming on-chain...',
  'Unstake confirmed!',
];

const CLAIM_STEPS = [
  'Simulating claim transaction...',
  'Sending claim to wallet...',
  'Confirming on-chain...',
  'Rewards claimed!',
];

export interface UserStakingInfo {
  stakedAmount: bigint;
  pendingRewards: bigint;
  rewardPerTokenPaid: bigint;
}

export interface PoolInfo {
  totalStaked: bigint;
  rewardRate: bigint;
  rewardEndBlock: bigint;
}

export function useStaking(vaultAddress: string, tokenAddress?: string, vaultPubKey?: string) {
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
          : i < prev.currentStep ? 'done' : i === prev.currentStep ? 'error' : 'pending',
      })),
    }));
  };

  const resetTradeStatus = () => setTradeStatus(INITIAL_TRADE_STATUS);

  const getVaultContract = useCallback(() => {
    if (!vaultAddress) return null;
    return getContract(
      vaultAddress,
      STAKING_VAULT_ABI as any,
      provider,
      net,
      address || undefined,
    );
  }, [vaultAddress, provider, address, net]);

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

  const resolveContractAddress = async (bech32: string, hexPubKey?: string): Promise<Address | null> => {
    // Use hex public key directly if available (avoids unreliable RPC lookup)
    if (hexPubKey) {
      try {
        return Address.fromString(hexPubKey);
      } catch {
        console.warn('[useStaking] Address.fromString failed for pubkey:', hexPubKey);
      }
    }
    // Fallback: try getPublicKeysInfoRaw for tweakedPubkey
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
    // Last fallback: standard getPublicKeyInfo
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

  // Get token balance
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

  // Get allowance for a spender
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

  // Get pool info (read-only)
  const getPoolInfo = useCallback(async (): Promise<PoolInfo | null> => {
    try {
      const contract = getVaultContract() as any;
      if (!contract) return null;
      const result = await contract.getPoolInfo();
      if ('error' in result) return null;
      return result.properties as PoolInfo;
    } catch {
      return null;
    }
  }, [getVaultContract]);

  // Get user staking info (read-only)
  const getUserInfo = useCallback(async (user?: string): Promise<UserStakingInfo | null> => {
    const addrStr = user || walletAddress;
    if (!addrStr) return null;
    try {
      const contract = getVaultContract() as any;
      if (!contract) return null;
      const addrObj = user ? Address.fromString(user) : address;
      if (!addrObj) return null;
      const result = await contract.getUserInfo(addrObj);
      if ('error' in result) return null;
      return result.properties as UserStakingInfo;
    } catch {
      return null;
    }
  }, [walletAddress, address, getVaultContract]);

  // Refs to always use the latest functions in long-running polls (avoids stale closures)
  const getAllowanceRef = useRef(getAllowance);
  getAllowanceRef.current = getAllowance;
  const getUserInfoRef = useRef(getUserInfo);
  getUserInfoRef.current = getUserInfo;

  // Poll until allowance increases (20 min timeout — BTC blocks ~10-15 min)
  const pollForApprovalConfirmation = async (spender: Address, prevAllowance: bigint): Promise<boolean> => {
    const MAX_ATTEMPTS = 80;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const current = await getAllowanceRef.current(spender);
        console.log(`[staking poll] allowance check #${attempt + 1}: prev=${prevAllowance}, current=${current}`);
        if (current > prevAllowance) return true;
      } catch (err) {
        console.warn(`[staking poll] allowance check #${attempt + 1} error:`, err);
      }
    }
    throw new Error('Approval confirmation timed out after 20 minutes. Check your wallet for status.');
  };

  // Poll until staked amount changes (20 min timeout — BTC blocks ~10-15 min)
  const pollForStakeChange = async (prevStaked: bigint): Promise<boolean> => {
    const MAX_ATTEMPTS = 80;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const info = await getUserInfoRef.current();
        console.log(`[staking poll] stake check #${attempt + 1}: prev=${prevStaked}, current=${info?.stakedAmount}`);
        if (info && info.stakedAmount !== prevStaked) return true;
      } catch (err) {
        console.warn(`[staking poll] stake check #${attempt + 1} error:`, err);
      }
    }
    throw new Error('Transaction confirmation timed out after 20 minutes. Check your wallet for status.');
  };

  // Stake tokens: approve → stake
  const stake = useCallback(async (amount: bigint) => {
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
    setTradeStatus({ active: true, type: 'stake', steps: makeSteps(STAKE_STEPS), currentStep: 0 });
    try {
      // Step 0: Simulate token approval
      advanceStep(STAKE_STEPS, 0);
      const tokenContract = getTokenContract() as any;
      if (!tokenContract) { setError('Token contract not available'); return null; }

      const vaultAddr = await resolveContractAddress(vaultAddress, vaultPubKey);
      if (!vaultAddr) {
        setError('Could not resolve vault contract address. Vault public key may be missing.');
        finishTrade(STAKE_STEPS, false, 'Could not resolve vault contract address');
        return null;
      }
      const prevAllowance = await getAllowance(vaultAddr);
      const approveSim = await tokenContract.increaseAllowance(vaultAddr, amount);
      if ('error' in approveSim) {
        const msg = 'Approve failed: ' + approveSim.error;
        setError(msg);
        finishTrade(STAKE_STEPS, false, msg);
        return null;
      }

      // Step 1: Send approval to wallet
      advanceStep(STAKE_STEPS, 1);
      await sendTx(approveSim);

      // Step 2: Wait for approval confirmation
      advanceStep(STAKE_STEPS, 2);
      await pollForApprovalConfirmation(vaultAddr, prevAllowance);

      // Step 3: Simulate stake transaction
      advanceStep(STAKE_STEPS, 3);
      const vaultContract = getVaultContract() as any;
      if (!vaultContract) { setError('Vault contract not available'); return null; }

      const stakeSim = await vaultContract.stake(amount);
      if ('error' in stakeSim) {
        setError(stakeSim.error);
        finishTrade(STAKE_STEPS, false, stakeSim.error);
        return null;
      }

      // Step 4: Send stake to wallet
      advanceStep(STAKE_STEPS, 4);
      const userInfoBefore = await getUserInfo();
      const prevStaked = userInfoBefore?.stakedAmount ?? 0n;
      const result = await sendTx(stakeSim);

      // Step 5: Confirming on-chain...
      advanceStep(STAKE_STEPS, 5);
      await pollForStakeChange(prevStaked);

      // Step 6: Stake confirmed!
      advanceStep(STAKE_STEPS, 6);
      finishTrade(STAKE_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stake failed';
      setError(msg);
      finishTrade(STAKE_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, vaultAddress, vaultPubKey, tokenAddress, getVaultContract, getTokenContract, getUserInfo]);

  // Unstake tokens
  const unstake = useCallback(async (amount: bigint) => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'unstake', steps: makeSteps(UNSTAKE_STEPS), currentStep: 0 });
    try {
      // Step 0: Simulate unstake
      advanceStep(UNSTAKE_STEPS, 0);
      const vaultContract = getVaultContract() as any;
      if (!vaultContract) { setError('Vault contract not available'); return null; }

      const unstakeSim = await vaultContract.unstake(amount);
      if ('error' in unstakeSim) {
        setError(unstakeSim.error);
        finishTrade(UNSTAKE_STEPS, false, unstakeSim.error);
        return null;
      }

      // Step 1: Send unstake to wallet
      advanceStep(UNSTAKE_STEPS, 1);
      const userInfoBefore = await getUserInfo();
      const prevStaked = userInfoBefore?.stakedAmount ?? 0n;
      const result = await sendTx(unstakeSim);

      // Step 2: Confirming on-chain...
      advanceStep(UNSTAKE_STEPS, 2);
      await pollForStakeChange(prevStaked);

      // Step 3: Unstake confirmed!
      advanceStep(UNSTAKE_STEPS, 3);
      finishTrade(UNSTAKE_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unstake failed';
      setError(msg);
      finishTrade(UNSTAKE_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getVaultContract, getUserInfo]);

  // Claim rewards
  const claimRewards = useCallback(async () => {
    if (!walletAddress) {
      setError('Wallet not connected');
      return null;
    }
    setLoading(true);
    setError(null);
    setTradeStatus({ active: true, type: 'claim', steps: makeSteps(CLAIM_STEPS), currentStep: 0 });
    try {
      // Step 0: Simulate claim
      advanceStep(CLAIM_STEPS, 0);
      const vaultContract = getVaultContract() as any;
      if (!vaultContract) { setError('Vault contract not available'); return null; }

      const claimSim = await vaultContract.claimRewards();
      if ('error' in claimSim) {
        setError(claimSim.error);
        finishTrade(CLAIM_STEPS, false, claimSim.error);
        return null;
      }

      // Step 1: Send claim to wallet
      advanceStep(CLAIM_STEPS, 1);
      const userInfoBefore = await getUserInfo();
      const prevRewards = userInfoBefore?.pendingRewards ?? 0n;
      const result = await sendTx(claimSim);

      // Step 2: Confirming on-chain...
      advanceStep(CLAIM_STEPS, 2);
      // Poll until pending rewards change (20 min timeout)
      const MAX_ATTEMPTS = 80;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise(r => setTimeout(r, 15000));
        try {
          const info = await getUserInfoRef.current();
          console.log(`[staking poll] claim check #${attempt + 1}: prev=${prevRewards}, current=${info?.pendingRewards}`);
          if (info && info.pendingRewards !== prevRewards) break;
        } catch (err) {
          console.warn(`[staking poll] claim check #${attempt + 1} error:`, err);
        }
        if (attempt === MAX_ATTEMPTS - 1) {
          throw new Error('Claim confirmation timed out after 20 minutes.');
        }
      }

      // Step 3: Rewards claimed!
      advanceStep(CLAIM_STEPS, 3);
      finishTrade(CLAIM_STEPS, true);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      setError(msg);
      finishTrade(CLAIM_STEPS, false, msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getVaultContract, getUserInfo]);

  return {
    getPoolInfo,
    getUserInfo,
    getBalance,
    stake,
    unstake,
    claimRewards,
    loading,
    error,
    setError,
    tradeStatus,
    resetTradeStatus,
  };
}
