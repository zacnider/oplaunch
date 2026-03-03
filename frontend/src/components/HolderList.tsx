import type { HolderRecord } from '../hooks/useTradeHistory';

interface Props {
    holders: HolderRecord[];
    loading: boolean;
    tokenSymbol: string;
    totalSupply?: string;
    onLoadMore?: () => void;
    hasMore?: boolean;
}

function formatTokens(raw: string): string {
    const val = Number(raw) / 1e18;
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(2);
}

function truncAddr(addr: string): string {
    if (addr.length <= 16) return addr;
    return addr.slice(0, 10) + '...' + addr.slice(-4);
}

function calcPercent(balance: string, totalSupply?: string): string {
    if (!totalSupply) return '';
    const bal = Number(balance);
    const total = Number(totalSupply);
    if (total === 0) return '0%';
    const pct = (bal / total) * 100;
    if (pct < 0.01) return '<0.01%';
    return pct.toFixed(2) + '%';
}

export default function HolderList({ holders, loading, tokenSymbol, totalSupply, onLoadMore, hasMore }: Props) {
    if (loading && holders.length === 0) {
        return <div style={s.loading}>Loading holders...</div>;
    }

    if (holders.length === 0) {
        return <div style={s.empty}>No holders yet</div>;
    }

    // totalSupply is already in raw format (18 decimals)
    const rawSupply = totalSupply || undefined;

    return (
        <div style={s.wrap}>
            {/* Header */}
            <div style={s.headerRow}>
                <span style={{ ...s.headerCell, flex: '0 0 36px' }}>#</span>
                <span style={{ ...s.headerCell, flex: 1 }}>Address</span>
                <span style={{ ...s.headerCell, flex: '0 0 100px', textAlign: 'right' as const }}>Balance</span>
                {rawSupply && <span style={{ ...s.headerCell, flex: '0 0 60px', textAlign: 'right' as const }}>%</span>}
                <span style={{ ...s.headerCell, flex: '0 0 50px', textAlign: 'right' as const }}>Trades</span>
            </div>
            {/* Rows */}
            {holders.map((h, i) => (
                <div key={h.holder_address} style={s.row}>
                    <span style={{ ...s.cell, flex: '0 0 36px', color: '#5a5a78', fontSize: '12px', fontWeight: '700' }}>
                        {i + 1}
                    </span>
                    <span style={{ ...s.cell, flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#9898b8' }}>
                        {truncAddr(h.holder_address)}
                    </span>
                    <span style={{ ...s.cell, flex: '0 0 100px', textAlign: 'right' as const, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {formatTokens(h.balance)} {tokenSymbol}
                    </span>
                    {rawSupply && (
                        <span style={{ ...s.cell, flex: '0 0 60px', textAlign: 'right' as const, fontSize: '11px', color: '#f97316' }}>
                            {calcPercent(h.balance, rawSupply)}
                        </span>
                    )}
                    <span style={{ ...s.cell, flex: '0 0 50px', textAlign: 'right' as const, fontSize: '12px', color: '#5a5a78' }}>
                        {h.trade_count}
                    </span>
                </div>
            ))}
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
