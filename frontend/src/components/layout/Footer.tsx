export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.footerBorder} />
      <div style={styles.container}>
        <div style={styles.left}>
          <span style={styles.brand}>OpLaunch</span>
          <span style={styles.divider} />
          <span style={styles.tagline}>DeFi Launchpad on Bitcoin L1</span>
        </div>
        <div style={styles.center}>
          <a href="https://x.com/prematrkurtcuk" target="_blank" rel="noopener noreferrer" style={styles.socialLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            Twitter
          </a>
          <a href="https://github.com/zacnider" target="_blank" rel="noopener noreferrer" style={styles.socialLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
        <div style={styles.right}>
          <span style={styles.network}>
            <span style={styles.networkDot} />
            Testnet
          </span>
          <span style={styles.powered}>
            Built on <span style={styles.opnet}>OP_NET</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    padding: '24px 32px',
    marginTop: 'auto',
    position: 'relative',
  },
  footerBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.06), transparent)',
  },
  container: {
    maxWidth: '1340px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  brand: {
    fontWeight: '700',
    fontSize: '14px',
    color: 'var(--text-primary)',
  },
  divider: {
    width: '1px',
    height: '14px',
    background: 'rgba(255, 255, 255, 0.1)',
  },
  tagline: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  socialLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: 'var(--text-muted)',
    textDecoration: 'none',
    fontSize: '13px',
    transition: 'color 0.2s',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  network: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(16, 185, 129, 0.08)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    padding: '5px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
  },
  networkDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)',
  },
  powered: {
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  opnet: {
    color: '#f97316',
    fontWeight: '600',
  },
};
