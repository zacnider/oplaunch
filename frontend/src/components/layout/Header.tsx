import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';

const navLinks = [
  { path: '/', label: 'Home', icon: (active: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#f97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )},
  { path: '/launch', label: 'Launch', icon: (active: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#f97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )},
  { path: '/create', label: 'Create', icon: (active: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#f97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  )},
  { path: '/swap', label: 'Swap', icon: (active: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#f97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  )},
  { path: '/staking', label: 'Stake', icon: (active: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#f97316' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )},
];

export default function Header() {
  const location = useLocation();
  const {
    walletAddress,
    connecting,
    openConnectModal,
    disconnect,
    walletBalance,
  } = useWalletConnect();

  const [copied, setCopied] = useState(false);

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 8)}...${addr.slice(-6)}`;

  const copyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = walletAddress;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const balanceBtc = walletBalance
    ? (Number(
        typeof walletBalance === 'object' && 'confirmed' in walletBalance
          ? walletBalance.confirmed
          : walletBalance,
      ) / 100_000_000).toFixed(4)
    : null;

  return (
    <header style={styles.header}>
      <div style={styles.headerBorder} />
      <div style={styles.container}>
        <Link to="/" style={styles.logo}>
          <img src="/logo.png" alt="OpLaunch" style={styles.logoImg} />
          <span style={styles.betaBadge}>TESTNET</span>
        </Link>

        <nav style={styles.nav}>
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                style={{
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                }}
              >
                <span style={styles.navIcon}>{link.icon(isActive)}</span>
                <span style={{
                  ...styles.navLabel,
                  color: isActive ? '#f0f0ff' : '#6b6b88',
                }}>{link.label}</span>
                {isActive && <span style={styles.navIndicator} />}
              </Link>
            );
          })}
        </nav>

        <div style={styles.walletSection}>
          {walletAddress ? (
            <div style={styles.walletInfo}>
              {balanceBtc && (
                <div style={styles.balanceBadge}>
                  <span style={styles.balanceDot} />
                  <span style={styles.balanceText}>{balanceBtc} BTC</span>
                </div>
              )}
              <span
                onClick={copyAddress}
                style={styles.walletAddress}
                title="Click to copy full address"
              >
                {copied ? 'Copied!' : truncateAddress(walletAddress)}
              </span>
              <button onClick={disconnect} style={styles.disconnectBtn}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={openConnectModal}
              disabled={connecting}
              style={styles.connectBtn}
            >
              <span style={styles.connectDot} />
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    background: 'rgba(5, 5, 16, 0.8)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    padding: '0 32px',
  },
  headerBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(249, 115, 22, 0.2), rgba(168, 85, 247, 0.2), transparent)',
  },
  container: {
    maxWidth: '1340px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '70px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    textDecoration: 'none',
  },
  logoImg: {
    height: '150px',
    objectFit: 'contain' as const,
  },
  betaBadge: {
    fontSize: '9px',
    fontWeight: '700',
    color: '#10b981',
    background: 'rgba(16, 185, 129, 0.12)',
    padding: '3px 6px',
    borderRadius: '4px',
    letterSpacing: '0.5px',
    border: '1px solid rgba(16, 185, 129, 0.2)',
  },
  nav: {
    display: 'flex',
    gap: '2px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: '14px',
    padding: '5px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  navLink: {
    padding: '8px 16px',
    borderRadius: '10px',
    color: '#6b6b88',
    fontSize: '13px',
    fontWeight: '500',
    textDecoration: 'none',
    transition: 'all 0.25s ease',
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  navLinkActive: {
    background: 'rgba(249, 115, 22, 0.1)',
    boxShadow: '0 0 12px rgba(249, 115, 22, 0.08)',
  },
  navIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    transition: 'color 0.25s ease',
    fontWeight: '600',
  },
  navIndicator: {
    position: 'absolute' as const,
    bottom: '-5px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '16px',
    height: '2px',
    borderRadius: '1px',
    background: 'linear-gradient(90deg, #f97316, #a855f7)',
    boxShadow: '0 0 8px rgba(249, 115, 22, 0.4)',
  },
  walletSection: {
    display: 'flex',
    alignItems: 'center',
  },
  connectBtn: {
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#ffffff',
    border: 'none',
    padding: '10px 22px',
    borderRadius: '12px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(249, 115, 22, 0.2)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  connectDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.4)',
    border: '2px solid rgba(255, 255, 255, 0.6)',
  },
  walletInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  balanceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    padding: '7px 12px',
    borderRadius: '10px',
  },
  balanceDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)',
  },
  balanceText: {
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'var(--font-mono)',
    color: '#10b981',
  },
  walletAddress: {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    userSelect: 'none' as const,
  },
  disconnectBtn: {
    background: 'rgba(244, 63, 94, 0.08)',
    color: '#f43f5e',
    border: '1px solid rgba(244, 63, 94, 0.15)',
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};
