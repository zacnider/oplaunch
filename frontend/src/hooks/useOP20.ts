import { useState, useCallback } from 'react';
import { getContract, OP_20_ABI, type IOP20Contract } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useProvider } from '../context/ProviderContext';

const opnetTestnet = (networks as Record<string, typeof networks.testnet>).opnetTestnet;

export function useOP20(tokenAddress: string) {
  const provider = useProvider();
  const { walletAddress, address } = useWalletConnect();
  const [loading, setLoading] = useState(false);

  const getTokenContract = useCallback(() => {
    return getContract<IOP20Contract>(
      tokenAddress,
      OP_20_ABI as any,
      provider,
      opnetTestnet,
      address || undefined,
    );
  }, [tokenAddress, provider, address]);

  const getBalance = useCallback(async (addrStr?: string): Promise<bigint> => {
    const targetAddr = addrStr || walletAddress;
    if (!targetAddr) return 0n;

    try {
      const contract = getTokenContract();
      const addrObj = addrStr ? Address.fromString(addrStr) : address;
      if (!addrObj) return 0n;
      const result = await contract.balanceOf(addrObj);
      if ('error' in result) return 0n;
      return result.properties.balance;
    } catch {
      return 0n;
    }
  }, [walletAddress, address, getTokenContract]);

  const getMetadata = useCallback(async () => {
    try {
      const contract = getTokenContract();
      const result = await contract.metadata();
      if ('error' in result) return null;
      return result.properties;
    } catch {
      return null;
    }
  }, [getTokenContract]);

  const approve = useCallback(async (spender: string, amount: bigint) => {
    if (!walletAddress) return null;

    setLoading(true);
    try {
      const contract = getTokenContract();
      const sim = await contract.increaseAllowance(Address.fromString(spender), amount);

      if ('error' in sim) return null;

      const tx = await (sim as any).sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 1_000_000n,
        network: opnetTestnet,
      });

      return tx;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getTokenContract]);

  return { getBalance, getMetadata, approve, loading };
}
