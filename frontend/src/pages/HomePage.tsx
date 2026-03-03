import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.heroGlow} />
        <div style={styles.heroGlow2} />
        <div style={styles.heroBadge}>
          <span style={styles.heroBadgeDot} />
          Live on OP_NET Testnet
        </div>
        <h1 style={styles.heroTitle}>
          The Future of Token
          <br />
          <span className="gradient-text" style={styles.heroAccent}>
            Launches on Bitcoin
          </span>
        </h1>
        <p style={styles.heroSubtitle}>
          Create, trade, and stake tokens with bonding curves directly on Bitcoin L1.
          Fair launch mechanics. Automatic graduation to DEX.
        </p>
        <div style={styles.heroCtas}>
          <Link to="/launch" style={styles.ctaPrimary}>
            <span>Explore Tokens</span>
            <span style={styles.ctaArrow}>&rarr;</span>
          </Link>
          <Link to="/create" style={styles.ctaSecondary}>
            Create Token
          </Link>
          <a
            href="https://faucet.opnet.org/"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.ctaFaucet}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v6"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <path d="M6 18a10 10 0 0 0 12 0"/>
            </svg>
            Get Testnet BTC
          </a>
        </div>
        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <span style={styles.heroStatValue}>Bitcoin L1</span>
            <span style={styles.heroStatLabel}>Native Chain</span>
          </div>
          <span style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatValue}>0.3 BTC</span>
            <span style={styles.heroStatLabel}>Graduation Target</span>
          </div>
          <span style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatValue}>Auto</span>
            <span style={styles.heroStatLabel}>DEX Listing</span>
          </div>
          <span style={styles.heroStatDivider} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatValue}>ML-DSA</span>
            <span style={styles.heroStatLabel}>Quantum Resistant</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>PROCESS</span>
          <h2 style={styles.sectionTitle}>How It Works</h2>
          <p style={styles.sectionSubtitle}>
            From token creation to DEX listing in 4 simple steps
          </p>
        </div>
        <div style={styles.stepsGrid}>
          {[
            { num: '01', title: 'Create Token', desc: 'Deploy your OP20 token on Bitcoin. A bonding curve is automatically created for fair price discovery.', color: '#f97316' },
            { num: '02', title: 'Trade on Curve', desc: 'Buy and sell tokens using the bonding curve. Early buyers get the best price as it increases with demand.', color: '#10b981' },
            { num: '03', title: 'Graduate to DEX', desc: 'When 0.3 BTC is collected, the token graduates automatically. Liquidity moves to the DEX pool.', color: '#3b82f6' },
            { num: '04', title: 'Stake & Earn', desc: 'Stake graduated tokens in the vault to earn rewards through the Synthetix-style distribution model.', color: '#a855f7' },
          ].map((step) => (
            <div key={step.num} style={styles.stepCard}>
              <span style={{ ...styles.stepNum, color: step.color }}>{step.num}</span>
              <div style={{ ...styles.stepLine, background: step.color }} />
              <h3 style={styles.stepTitle}>{step.title}</h3>
              <p style={styles.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>FEATURES</span>
          <h2 style={styles.sectionTitle}>Why OpLaunch?</h2>
        </div>
        <div style={styles.featuresGrid}>
          {[
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-3.94-.694m5.155-6.2L8.29 4.26m5.908 1.042.348-1.97M7.48 20.364l3.126-17.727"/></svg>, title: 'Bitcoin Native', desc: 'Smart contracts on Bitcoin L1 via OP_NET. No bridges, no sidechains, just Bitcoin.', accent: '#f97316' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><path d="M4 21h16"/><path d="M12 16v5"/></svg>, title: 'Fair Launch', desc: 'Bonding curves ensure fair price discovery. No presales, no insider advantage.', accent: '#10b981' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>, title: 'Auto Graduation', desc: 'Tokens graduate to DEX automatically when the target market cap is reached.', accent: '#3b82f6' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26z"/></svg>, title: 'Staking Rewards', desc: 'Stake tokens and earn through transparent on-chain reward distribution.', accent: '#a855f7' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>, title: 'Quantum Resistant', desc: 'ML-DSA post-quantum cryptography makes your tokens future-proof.', accent: '#06b6d4' },
            { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, title: 'All-in-One', desc: 'Create, trade, swap, and stake. Everything in one platform.', accent: '#f59e0b' },
          ].map((feat) => (
            <div key={feat.title} style={styles.featureCard}>
              <div style={{ ...styles.featureIcon, color: feat.accent, background: `${feat.accent}12` }}>
                {feat.icon}
              </div>
              <h3 style={styles.featureTitle}>{feat.title}</h3>
              <p style={styles.featureDesc}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bonding Curve Explainer */}
      <section style={styles.section}>
        <div style={styles.explainerCard}>
          <div style={styles.explainerLeft}>
            <span style={styles.sectionTag}>MECHANISM</span>
            <h2 style={styles.explainerTitle}>
              How the Bonding Curve Works
            </h2>
            <p style={styles.explainerText}>
              OpLaunch uses a <strong style={{ color: '#f0f0ff' }}>virtual reserve bonding curve</strong> based on the
              constant product formula (x &times; y = k).
            </p>
            <div style={styles.explainerPoints}>
              {[
                { label: 'Early buyers', text: 'get tokens at a lower price' },
                { label: 'Price increases', text: 'automatically as more BTC flows in' },
                { label: 'Sell back', text: 'to the curve at any time' },
                { label: '0.3 BTC target', text: 'triggers graduation to DEX' },
              ].map((p) => (
                <div key={p.label} style={styles.explainerPoint}>
                  <span style={styles.pointDot} />
                  <span>
                    <strong style={{ color: '#f0f0ff' }}>{p.label}</strong>{' '}
                    <span style={{ color: '#9898b8' }}>{p.text}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div style={styles.explainerRight}>
            <svg width="100%" height="200" viewBox="0 0 400 200" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="curveStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <polygon
                fill="url(#curveGrad)"
                points="20,180 60,175 100,168 140,155 180,135 220,110 260,80 300,50 340,25 380,10 380,200 20,200"
              />
              <polyline
                fill="none"
                stroke="url(#curveStroke)"
                strokeWidth="3"
                strokeLinecap="round"
                points="20,180 60,175 100,168 140,155 180,135 220,110 260,80 300,50 340,25 380,10"
              />
              <text x="200" y="195" textAnchor="middle" fill="#5a5a78" fontSize="11">
                Tokens Sold
              </text>
            </svg>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTag}>TECHNOLOGY</span>
          <h2 style={styles.sectionTitle}>Built on Cutting-Edge Tech</h2>
        </div>
        <div style={styles.techGrid}>
          {[
            { name: 'OP_NET', desc: 'Smart contracts on Bitcoin L1', color: '#f97316' },
            { name: 'OP20', desc: 'Bitcoin-native token standard', color: '#3b82f6' },
            { name: 'ML-DSA', desc: 'Post-quantum cryptography', color: '#a855f7' },
            { name: 'WASM', desc: 'AssemblyScript contracts', color: '#06b6d4' },
          ].map((tech) => (
            <div key={tech.name} style={styles.techCard}>
              <span style={{ ...styles.techName, color: tech.color }}>{tech.name}</span>
              <span style={styles.techDesc}>{tech.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={styles.ctaSection}>
        <div style={styles.ctaGlow} />
        <h2 style={styles.ctaTitle}>Ready to Launch?</h2>
        <p style={styles.ctaText}>
          Create your token on Bitcoin in under a minute. Fair launch, bonding curve pricing,
          automatic graduation to DEX.
        </p>
        <div style={styles.heroCtas}>
          <Link to="/create" style={styles.ctaPrimary}>
            <span>Create Your Token</span>
            <span style={styles.ctaArrow}>&rarr;</span>
          </Link>
          <Link to="/launch" style={styles.ctaSecondary}>
            Browse Tokens
          </Link>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hero: { textAlign: 'center', padding: '72px 0 56px', position: 'relative', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: '-150px', left: '50%', transform: 'translateX(-60%)', width: '700px', height: '500px', background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.1) 0%, transparent 60%)', pointerEvents: 'none', filter: 'blur(40px)' },
  heroGlow2: { position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(20%)', width: '500px', height: '400px', background: 'radial-gradient(ellipse, rgba(168, 85, 247, 0.07) 0%, transparent 60%)', pointerEvents: 'none', filter: 'blur(40px)' },
  heroBadge: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.15)', padding: '8px 16px', borderRadius: '50px', fontSize: '13px', fontWeight: '500', color: '#f97316', marginBottom: '28px', position: 'relative' },
  heroBadgeDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', boxShadow: '0 0 8px rgba(249, 115, 22, 0.5)' },
  heroTitle: { fontSize: '60px', fontWeight: '900', lineHeight: 1.05, marginBottom: '24px', letterSpacing: '-2px', position: 'relative', color: '#f0f0ff' },
  heroAccent: { fontSize: '64px', display: 'inline-block' },
  heroSubtitle: { fontSize: '18px', color: '#9898b8', maxWidth: '580px', margin: '0 auto 36px', lineHeight: 1.7, position: 'relative' },
  heroCtas: { display: 'flex', justifyContent: 'center', gap: '14px', position: 'relative' },
  ctaPrimary: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#ffffff', padding: '14px 32px', borderRadius: '14px', fontSize: '15px', fontWeight: '600', textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 0 30px rgba(249, 115, 22, 0.2), 0 4px 12px rgba(0, 0, 0, 0.3)' },
  ctaArrow: { fontSize: '16px' },
  ctaSecondary: { display: 'inline-flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', color: '#f0f0ff', padding: '14px 32px', borderRadius: '14px', fontSize: '15px', fontWeight: '600', textDecoration: 'none', border: '1px solid rgba(255, 255, 255, 0.08)', transition: 'all 0.2s' },
  ctaFaucet: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(6, 182, 212, 0.08)', color: '#06b6d4', padding: '14px 28px', borderRadius: '14px', fontSize: '15px', fontWeight: '600', textDecoration: 'none', border: '1px solid rgba(6, 182, 212, 0.15)', transition: 'all 0.2s', boxShadow: '0 0 20px rgba(6, 182, 212, 0.08)' },
  heroStats: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px', marginTop: '56px', position: 'relative' },
  heroStat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  heroStatValue: { fontSize: '16px', fontWeight: '700', color: '#f0f0ff', fontFamily: 'var(--font-mono)' },
  heroStatLabel: { fontSize: '11px', color: '#5a5a78', textTransform: 'uppercase', letterSpacing: '0.5px' },
  heroStatDivider: { width: '1px', height: '32px', background: 'rgba(255, 255, 255, 0.06)' },

  section: { marginBottom: '80px' },
  sectionHeader: { textAlign: 'center', marginBottom: '48px' },
  sectionTag: { display: 'inline-block', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', color: '#f97316', marginBottom: '12px' },
  sectionTitle: { fontSize: '36px', fontWeight: '800', marginBottom: '12px', letterSpacing: '-1px', color: '#f0f0ff' },
  sectionSubtitle: { color: '#9898b8', fontSize: '16px' },

  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  stepCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', padding: '28px 22px', transition: 'all 0.3s ease' },
  stepNum: { fontSize: '32px', fontWeight: '900', fontFamily: 'var(--font-mono)', display: 'block', marginBottom: '8px', opacity: 0.7 },
  stepLine: { width: '32px', height: '2px', borderRadius: '1px', marginBottom: '16px', opacity: 0.5 },
  stepTitle: { fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#f0f0ff' },
  stepDesc: { fontSize: '13px', color: '#6b6b88', lineHeight: 1.6, margin: 0 },

  featuresGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' },
  featureCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', padding: '28px', transition: 'all 0.3s ease' },
  featureIcon: { width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', marginBottom: '16px' },
  featureTitle: { fontSize: '16px', fontWeight: '700', marginBottom: '8px', color: '#f0f0ff' },
  featureDesc: { fontSize: '13px', color: '#6b6b88', lineHeight: 1.6, margin: 0 },

  explainerCard: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center', background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '22px', padding: '48px' },
  explainerLeft: {},
  explainerTitle: { fontSize: '28px', fontWeight: '800', marginBottom: '16px', letterSpacing: '-0.5px', color: '#f0f0ff', marginTop: '12px' },
  explainerText: { fontSize: '15px', color: '#9898b8', lineHeight: 1.7, marginBottom: '20px' },
  explainerPoints: { display: 'flex', flexDirection: 'column', gap: '12px' },
  explainerPoint: { display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '14px', lineHeight: 1.5 },
  pointDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#f97316', flexShrink: 0, marginTop: '7px' },
  explainerRight: { background: 'rgba(5, 5, 16, 0.5)', borderRadius: '16px', padding: '28px', border: '1px solid rgba(255, 255, 255, 0.04)' },

  techGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' },
  techCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '16px', padding: '28px', textAlign: 'center', display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  techName: { fontSize: '20px', fontWeight: '800', fontFamily: 'var(--font-mono)' },
  techDesc: { fontSize: '13px', color: '#6b6b88' },

  ctaSection: { textAlign: 'center', padding: '64px 0 32px', position: 'relative' },
  ctaGlow: { position: 'absolute', top: '0', left: '50%', transform: 'translateX(-50%)', width: '500px', height: '300px', background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.08) 0%, transparent 60%)', pointerEvents: 'none', filter: 'blur(40px)' },
  ctaTitle: { fontSize: '40px', fontWeight: '800', marginBottom: '16px', letterSpacing: '-1px', color: '#f0f0ff', position: 'relative' },
  ctaText: { fontSize: '16px', color: '#9898b8', maxWidth: '500px', margin: '0 auto 32px', lineHeight: 1.7, position: 'relative' },
};
