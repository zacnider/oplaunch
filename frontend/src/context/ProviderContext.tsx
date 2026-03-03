import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const TESTNET_RPC = 'https://testnet.opnet.org';
const opnetTestnet = (networks as Record<string, typeof networks.testnet>).opnetTestnet;

interface ProviderContextType {
  provider: JSONRpcProvider;
}

const ProviderContext = createContext<ProviderContextType | null>(null);

export function ProviderContextProvider({ children }: { children: ReactNode }) {
  const provider = useMemo(
    () => new JSONRpcProvider({ url: TESTNET_RPC, network: opnetTestnet }),
    [],
  );

  return (
    <ProviderContext.Provider value={{ provider }}>
      {children}
    </ProviderContext.Provider>
  );
}

export function useProvider(): JSONRpcProvider {
  const ctx = useContext(ProviderContext);
  if (!ctx) throw new Error('useProvider must be used within ProviderContextProvider');
  return ctx.provider;
}
