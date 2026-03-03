import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

export interface TradeRecord {
    id: number;
    token_address: string;
    curve_address: string;
    trade_type: 'buy' | 'sell' | 'swap_btc_for_tokens' | 'swap_tokens_for_btc';
    btc_amount: string;
    token_amount: string;
    trader_address: string;
    tx_hash: string | null;
    created_at: number;
}

export interface HolderRecord {
    token_address: string;
    holder_address: string;
    balance: string;
    first_buy_at: number;
    last_trade_at: number;
    total_btc_spent: string;
    total_btc_received: string;
    trade_count: number;
}

export function useTradeHistory(tokenAddress: string) {
    const [trades, setTrades] = useState<TradeRecord[]>([]);
    const [holders, setHolders] = useState<HolderRecord[]>([]);
    const [totalTrades, setTotalTrades] = useState(0);
    const [totalHolders, setTotalHolders] = useState(0);
    const [loadingTrades, setLoadingTrades] = useState(false);
    const [loadingHolders, setLoadingHolders] = useState(false);

    const fetchTrades = useCallback(async (limit = 20, offset = 0) => {
        if (!tokenAddress) return;
        setLoadingTrades(true);
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/trades/token/${tokenAddress}?limit=${limit}&offset=${offset}`,
            );
            if (res.ok) {
                const data = await res.json();
                if (offset === 0) {
                    setTrades(data.trades);
                } else {
                    setTrades((prev) => [...prev, ...data.trades]);
                }
                setTotalTrades(data.total);
            }
        } catch {
            // Backend not available
        } finally {
            setLoadingTrades(false);
        }
    }, [tokenAddress]);

    const fetchHolders = useCallback(async (limit = 20, offset = 0) => {
        if (!tokenAddress) return;
        setLoadingHolders(true);
        try {
            const res = await fetch(
                `${BACKEND_URL}/api/holders/${tokenAddress}?limit=${limit}&offset=${offset}`,
            );
            if (res.ok) {
                const data = await res.json();
                if (offset === 0) {
                    setHolders(data.holders);
                } else {
                    setHolders((prev) => [...prev, ...data.holders]);
                }
                setTotalHolders(data.total);
            }
        } catch {
            // Backend not available
        } finally {
            setLoadingHolders(false);
        }
    }, [tokenAddress]);

    const reportTrade = useCallback(async (trade: {
        tokenAddress: string;
        curveAddress: string;
        tradeType: string;
        btcAmount: string;
        tokenAmount: string;
        traderAddress: string;
        txHash?: string;
    }) => {
        try {
            await fetch(`${BACKEND_URL}/api/trades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trade),
            });
            // Refresh after reporting
            fetchTrades();
            fetchHolders();
        } catch {
            console.error('Failed to report trade');
        }
    }, [fetchTrades, fetchHolders]);

    // Auto-fetch on mount / token change
    useEffect(() => {
        if (tokenAddress) {
            fetchTrades();
            fetchHolders();
        }
    }, [tokenAddress, fetchTrades, fetchHolders]);

    return {
        trades,
        holders,
        totalTrades,
        totalHolders,
        loadingTrades,
        loadingHolders,
        fetchTrades,
        fetchHolders,
        reportTrade,
    };
}
