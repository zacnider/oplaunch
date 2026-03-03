import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { truncateAddress } from '../utils/format';

interface TokenData {
  tokenId: string;
  curveAddress: string;
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  description: string;
  imageUrl: string;
  creator: string;
  createdAt: number;
  status: 'deploying' | 'active' | 'graduated';
  progressPercent?: number;
}

type FilterType = 'all' | 'new' | 'trending' | 'graduating' | 'graduated';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

export default function LaunchPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const params = new URLSearchParams();
        if (filter !== 'all' && filter === 'graduated') params.set('status', 'graduated');
        if (searchQuery) params.set('search', searchQuery);

        const res = await fetch(`${BACKEND_URL}/api/tokens?${params}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tokens) {
            setTokens(data.tokens);
          }
        }
      } catch {
        // Backend not available
      } finally {
        setLoading(false);
      }
    };
    fetchTokens();
  }, [filter, searchQuery]);

  const filteredTokens = tokens.filter((token) => {
    if (filter === 'graduated' && token.status !== 'graduated') return false;
    if (filter === 'graduating' && (token.progressPercent || 0) < 80) return false;
    if (filter === 'new' && Date.now() - token.createdAt > 3600000 * 2) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!token.name.toLowerCase().includes(q) && !token.symbol.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Page Header */}
      <div style={styles.pageHeader}>
        <div>
          <span style={styles.pageTag}>LAUNCHPAD</span>
          <h1 style={styles.pageTitle}>Token Launchpad</h1>
          <p style={styles.pageSubtitle}>
            Discover and trade tokens on their bonding curves
          </p>
        </div>
        <Link to="/create" style={styles.createBtn}>
          + Create Token
        </Link>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        {[
          { value: tokens.length.toString(), label: 'Tokens Launched', color: '#f97316' },
          { value: '--', label: 'Total Volume', color: '#3b82f6' },
          { value: tokens.filter((t) => t.status === 'active').length.toString(), label: 'Active Curves', color: '#10b981' },
          { value: tokens.filter((t) => t.status === 'graduated').length.toString(), label: 'Graduated', color: '#a855f7' },
        ].map((stat) => (
          <div key={stat.label} style={styles.statItem}>
            <span style={{ ...styles.statValue, color: stat.color }}>{stat.value}</span>
            <span style={styles.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div style={styles.controls}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input
            type="text"
            placeholder="Search tokens by name or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <div style={styles.filters}>
          {(['all', 'new', 'trending', 'graduating', 'graduated'] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  ...styles.filterBtn,
                  ...(filter === f ? styles.filterBtnActive : {}),
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Token Grid */}
      {loading && (
        <div style={styles.loadingState}>
          <div style={styles.spinner} />
          <span>Loading tokens...</span>
        </div>
      )}

      {!loading && filteredTokens.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg></div>
          <p style={styles.emptyTitle}>No tokens found</p>
          <p style={styles.emptyDesc}>Be the first to create a token!</p>
          <Link to="/create" style={styles.emptyBtn}>
            Create a token
          </Link>
        </div>
      )}

      <div style={styles.tokenGrid}>
        {filteredTokens.map((token) => (
          <Link
            to={`/token/${token.tokenId}`}
            key={token.tokenId}
            style={styles.tokenCard}
          >
            <div style={styles.cardHeader}>
              {token.imageUrl ? (
                <img src={token.imageUrl} alt={token.name} style={styles.tokenIconImg} />
              ) : (
                <div style={styles.tokenIcon}>
                  {token.symbol.slice(0, 2)}
                </div>
              )}
              <div style={styles.tokenInfo}>
                <h3 style={styles.tokenName}>{token.name}</h3>
                <span style={styles.tokenSymbol}>${token.symbol}</span>
              </div>
              {token.status === 'graduated' ? (
                <span style={styles.graduatedBadge}>Graduated</span>
              ) : (
                <span style={styles.activeBadge}>Active</span>
              )}
            </div>

            {/* Progress Bar */}
            <div style={styles.progressContainer}>
              <div style={styles.progressHeader}>
                <span style={styles.progressLabel}>Bonding Curve</span>
                <span style={styles.progressPercent}>{token.progressPercent ?? 0}%</span>
              </div>
              <div style={styles.progressBar}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${token.progressPercent ?? 0}%`,
                    background:
                      (token.progressPercent ?? 0) >= 90
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #f97316, #a855f7)',
                  }}
                />
              </div>
            </div>

            <div style={styles.cardFooter}>
              <span style={styles.creatorText}>by {truncateAddress(token.creator)}</span>
              <span style={styles.supply}>{Number(token.totalSupply).toLocaleString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' },
  pageTag: { display: 'inline-block', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', color: '#f97316', marginBottom: '8px' },
  pageTitle: { fontSize: '36px', fontWeight: '800', marginBottom: '8px', letterSpacing: '-1px', color: '#f0f0ff' },
  pageSubtitle: { color: '#9898b8', fontSize: '16px' },
  createBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', boxShadow: '0 0 20px rgba(249, 115, 22, 0.15)', whiteSpace: 'nowrap' as const },

  statsBar: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' },
  statItem: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' },
  statValue: { display: 'block', fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-mono)', marginBottom: '4px' },
  statLabel: { fontSize: '12px', color: '#5a5a78', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },

  controls: { display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' as const, alignItems: 'center' },
  searchWrap: { flex: 1, minWidth: '200px', position: 'relative' as const },
  searchIcon: { position: 'absolute' as const, left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', opacity: 0.4 },
  searchInput: { width: '100%', background: 'rgba(15, 15, 35, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px 16px 12px 38px', color: '#f0f0ff', fontSize: '14px', outline: 'none', backdropFilter: 'blur(8px)' },
  filters: { display: 'flex', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '4px' },
  filterBtn: { background: 'transparent', border: 'none', color: '#5a5a78', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' },
  filterBtnActive: { background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' },

  loadingState: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '12px', padding: '60px', color: '#5a5a78' },
  spinner: { width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.06)', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin-slow 1s linear infinite' },

  emptyState: { textAlign: 'center' as const, padding: '60px 0' },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { fontSize: '20px', fontWeight: '700', color: '#f0f0ff', marginBottom: '8px' },
  emptyDesc: { fontSize: '14px', color: '#5a5a78', marginBottom: '20px' },
  emptyBtn: { display: 'inline-block', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', padding: '10px 24px', borderRadius: '10px', fontWeight: '600', fontSize: '14px', textDecoration: 'none' },

  tokenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' },
  tokenCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', padding: '22px', textDecoration: 'none', color: 'inherit', transition: 'all 0.3s ease', cursor: 'pointer' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' },
  tokenIcon: { width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, #f97316, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', color: '#ffffff', flexShrink: 0 },
  tokenIconImg: { width: '44px', height: '44px', borderRadius: '12px', objectFit: 'cover' as const, flexShrink: 0 },
  tokenInfo: { flex: 1 },
  tokenName: { fontSize: '16px', fontWeight: '700', color: '#f0f0ff', margin: 0 },
  tokenSymbol: { fontSize: '13px', color: '#5a5a78' },
  graduatedBadge: { background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', border: '1px solid rgba(16, 185, 129, 0.15)' },
  activeBadge: { background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600', border: '1px solid rgba(249, 115, 22, 0.15)' },

  progressContainer: { marginBottom: '14px' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  progressLabel: { fontSize: '12px', color: '#5a5a78' },
  progressPercent: { fontSize: '12px', fontWeight: '700', color: '#f97316', fontFamily: 'var(--font-mono)' },
  progressBar: { height: '4px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '2px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s ease' },

  cardFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.04)' },
  creatorText: { fontSize: '12px', color: '#5a5a78', fontFamily: 'var(--font-mono)' },
  supply: { fontSize: '12px', color: '#5a5a78' },
};
