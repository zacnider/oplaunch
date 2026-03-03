import type { TradeRecord } from '../hooks/useTradeHistory';

interface Props {
    trades: TradeRecord[];
    loading: boolean;
    tokenSymbol: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatBtc(sats: string): string {
    const val = Number(sats) / 1e8;
    return val.toFixed(6);
}

function formatTokens(raw: string): string {
    const val = Number(raw) / 1e18;
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(2);
}

function tradeLabel(type: string): { text: string; color: string } {
    switch (type) {
        case 'buy': return { text: 'Buy', color: '#10b981' };
        case 'sell': return { text: 'Sell', color: '#f43f5e' };
        case 'swap_btc_for_tokens': return { text: 'Swap (Buy)', color: '#10b981' };
        case 'swap_tokens_for_btc': return { text: 'Swap (Sell)', color: '#f43f5e' };
        default: return { text: type, color: '#5a5a78' };
    }
}

function truncAddr(addr: string): string {
    if (addr.length <= 14) return addr;
    return addr.slice(0, 8) + '...' + addr.slice(-4);
}

export default function TradeHistoryTable({ trades, loading, tokenSymbol, onLoadMore, hasMore }: Props) {
    if (loading && trades.length === 0) {
        return <div style={s.loading}>Loading trades...</div>;
    }

    if (trades.length === 0) {
        return <div style={s.empty}>No trades yet</div>;
    }

    return (
        <div style={s.wrap}>
            {/* Header */}
            <div style={s.headerRow}>
                <span style={{ ...s.headerCell, flex: '0 0 60px' }}>Time</span>
                <span style={{ ...s.headerCell, flex: '0 0 80px' }}>Type</span>
                <span style={{ ...s.headerCell, flex: 1 }}>BTC</span>
                <span style={{ ...s.headerCell, flex: 1 }}>{tokenSymbol}</span>
                <span style={{ ...s.headerCell, flex: '0 0 100px' }}>Trader</span>
            </div>
            {/* Rows */}
            {trades.map((t) => {
                const label = tradeLabel(t.trade_type);
                return (
                    <div key={t.id} style={s.row}>
                        <span style={{ ...s.cell, flex: '0 0 60px', color: '#5a5a78', fontSize: '11px' }}>
                            {timeAgo(t.created_at)}
                        </span>
                        <span style={{ ...s.cell, flex: '0 0 80px' }}>
                            <span style={{ ...s.badge, background: label.color + '18', color: label.color, borderColor: label.color + '30' }}>
                                {label.text}
                            </span>
                        </span>
                        <span style={{ ...s.cell, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {formatBtc(t.btc_amount)}
                        </span>
                        <span style={{ ...s.cell, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {formatTokens(t.token_amount)}
                        </span>
                        <span style={{ ...s.cell, flex: '0 0 100px', fontSize: '11px', color: '#9898b8', fontFamily: 'var(--font-mono)' }}>
                            {truncAddr(t.trader_address)}
                        </span>
                    </div>
                );
            })}
            {/* Load More */}
            {hasMore && onLoadMore && (
                <button onClick={onLoadMore} style={s.loadMore} disabled={loading}>
                    {loading ? 'Loading...' : 'Load More'}
                </button>
            )}
        </div>
    );
}

const s: Record<string, React.CSSProperties> = {
    wrap: {
        display: 'flex',
        flexDirection: 'column',
    },
    headerRow: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    headerCell: {
        fontSize: '10px',
        fontWeight: '600',
        color: '#5a5a78',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
    },
    row: {
        display: 'flex',
        alignItems: 'center',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
    },
    cell: {
        color: '#f0f0ff',
    },
    badge: {
        padding: '2px 8px',
        borderRadius: '6px',
        fontSize: '10px',
        fontWeight: '600',
        border: '1px solid',
    },
    loading: {
        textAlign: 'center' as const,
        padding: '24px',
        color: '#5a5a78',
        fontSize: '13px',
    },
    empty: {
        textAlign: 'center' as const,
        padding: '24px',
        color: '#5a5a78',
        fontSize: '13px',
    },
    loadMore: {
        margin: '12px auto',
        padding: '8px 20px',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(5,5,16,0.5)',
        color: '#9898b8',
        fontSize: '12px',
        cursor: 'pointer',
    },
};
