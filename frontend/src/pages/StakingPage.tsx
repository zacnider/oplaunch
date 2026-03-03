import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useStaking, type PoolInfo, type UserStakingInfo } from '../hooks/useStaking';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

interface StakingPool {
  vaultAddress: string;
  vaultPubKey: string;
  stakingTokenAddress: string;
  rewardTokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  curveAddress: string;
  imageUrl: string;
  status: string;
}

type StakeTab = 'stake' | 'unstake';

export default function StakingPage() {
  const { walletAddress } = useWalletConnect();
  const [pools, setPools] = useState<StakingPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<StakingPool | null>(null);
  const [loadingPools, setLoadingPools] = useState(true);
  const [stakeTab, setStakeTab] = useState<StakeTab>('stake');
  const [amount, setAmount] = useState('');
  const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
  const [userInfo, setUserInfo] = useState<UserStakingInfo | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);

  // Fetch graduated token pools from backend
  useEffect(() => {
    setLoadingPools(true);
    fetch(`${BACKEND_URL}/api/staking/pools`)
      .then((r) => r.json())
      .then((data) => {
        if (data.pools && data.pools.length > 0) {
          setPools(data.pools);
          setSelectedPool(data.pools[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPools(false));
  }, []);

  const {
    getPoolInfo,
    getUserInfo,
    getBalance,
    stake,
    unstake,
    claimRewards,
    loading: tradeLoading,
    error: tradeError,
    setError,
    tradeStatus,
    resetTradeStatus,
  } = useStaking(
    selectedPool?.vaultAddress || '',
    selectedPool?.stakingTokenAddress,
    selectedPool?.vaultPubKey,
  );

  const isPoolReady = selectedPool?.status === 'active' && !!selectedPool?.vaultAddress;

  // Fetch on-chain pool info
  useEffect(() => {
    if (!selectedPool) return;
    getPoolInfo().then(setPoolInfo);
  }, [selectedPool, getPoolInfo]);

  // Fetch user staking info & token balance
  useEffect(() => {
    if (!selectedPool || !walletAddress) return;
    getUserInfo().then(setUserInfo);
    getBalance().then(setTokenBalance);
  }, [selectedPool, walletAddress, getUserInfo, getBalance]);

  const refreshData = () => {
    getPoolInfo().then(setPoolInfo);
    if (walletAddress) {
      getUserInfo().then(setUserInfo);
      getBalance().then(setTokenBalance);
    }
  };

  const tokenSymbol = selectedPool?.tokenSymbol || 'TOKEN';
  const tokenName = selectedPool?.tokenName || 'Token';
  const totalStakedDisplay = poolInfo
    ? (Number(poolInfo.totalStaked) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 })
    : '0';
  const rewardRateDisplay = poolInfo
    ? (Number(poolInfo.rewardRate) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '0';
  const userStakedDisplay = userInfo
    ? (Number(userInfo.stakedAmount) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })
    : '0';
  const pendingRewardsDisplay = userInfo
    ? (Number(userInfo.pendingRewards) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : '0';
  const tokenBalanceDisplay = (Number(tokenBalance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const hasPendingRewards = userInfo ? userInfo.pendingRewards > 0n : false;

  const handleStake = async () => {
    if (!amount || !walletAddress) return;
    try {
      const tokenAmount = BigInt(Math.floor(parseFloat(amount) * 1e18));
      if (stakeTab === 'stake') {
        await stake(tokenAmount);
      } else {
        await unstake(tokenAmount);
      }
      setAmount('');
      refreshData();
    } catch (err) {
      console.error('Staking action failed:', err);
    }
  };

  const handleClaim = async () => {
    if (!walletAddress) return;
    try {
      await claimRewards();
      refreshData();
    } catch (err) {
      console.error('Claim failed:', err);
    }
  };

  const maxAmount = stakeTab === 'stake'
    ? Number(tokenBalance) / 1e18
    : Number(userInfo?.stakedAmount ?? 0n) / 1e18;

  const hasPool = pools.length > 0;

  return (
    <div>
      <span style={s.pageTag}>EARN</span>
      <h1 style={s.pageTitle}>Staking</h1>
      <p style={s.pageSubtitle}>
        Stake graduated tokens and earn rewards over time.
      </p>

      {/* How Staking Works */}
      <div style={s.infoCard}>
        <div style={s.infoCardGlow} />
        <h2 style={s.infoTitle}>How Staking Works</h2>
        <div style={s.stepsGrid}>
          {[
            { num: '1', title: 'Create Token', desc: 'Launch your token with a bonding curve on the Token Launchpad.', color: '#f97316' },
            { num: '2', title: 'Graduate', desc: 'When the bonding curve collects 0.3 BTC, the token graduates to DEX.', color: '#10b981' },
            { num: '3', title: 'Stake', desc: 'Stake your graduated tokens in the staking vault to earn rewards.', color: '#3b82f6' },
          ].map((step) => (
            <div key={step.num} style={s.stepCard}>
              <div style={{ ...s.stepIcon, background: `${step.color}14` }}>
                <span style={{ color: step.color, fontSize: '20px', fontWeight: '800' }}>{step.num}</span>
              </div>
              <h3 style={s.stepTitle}>{step.title}</h3>
              <p style={s.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {!hasPool && !loadingPools ? (
        /* No graduated tokens yet */
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Staking Pools</h2>
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </div>
            <h3 style={s.emptyTitle}>No Graduated Tokens Yet</h3>
            <p style={s.emptyDesc}>
              Staking pools are created automatically when tokens graduate from their bonding curves.
              Once a token collects enough BTC and graduates, you'll be able to stake it here.
            </p>
            <div style={s.emptyCtas}>
              <Link to="/launch" style={s.ctaSecondary}>Browse Tokens</Link>
              <Link to="/create" style={s.ctaPrimary}>Create Token &rarr;</Link>
            </div>
          </div>
        </div>
      ) : loadingPools ? (
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <span style={s.loadingText}>Loading staking pools...</span>
        </div>
      ) : (
        /* Pool found → 2 column layout */
        <div style={s.twoCol}>
          {/* Left: Pool info + stats */}
          <div style={s.leftCol}>
            {/* Pool selector (if multiple) */}
            {pools.length > 1 && (
              <div style={s.poolSelector}>
                <label style={s.poolSelectorLabel}>Select Pool</label>
                <select
                  value={selectedPool?.stakingTokenAddress || ''}
                  onChange={(e) => {
                    const p = pools.find((pool) => pool.stakingTokenAddress === e.target.value);
                    if (p) setSelectedPool(p);
                  }}
                  style={s.poolSelectorSelect}
                >
                  {pools.map((p) => (
                    <option key={p.stakingTokenAddress} value={p.stakingTokenAddress}>
                      {p.tokenName} ({p.tokenSymbol})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Pool info card */}
            <div style={s.poolCard}>
              <div style={s.poolCardGlow} />
              <div style={s.poolHeader}>
                {selectedPool?.imageUrl ? (
                  <img src={selectedPool.imageUrl} alt={tokenName} style={s.poolTokenImg} />
                ) : (
                  <div style={s.poolTokenIcon}>{tokenSymbol.slice(0, 2)}</div>
                )}
                <div>
                  <h3 style={s.poolTokenName}>{tokenName}</h3>
                  <span style={s.poolTokenSymbol}>${tokenSymbol}</span>
                </div>
                <div style={{
                  ...s.poolStatusBadge,
                  ...(isPoolReady ? {} : { background: 'rgba(249, 115, 22, 0.08)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.15)' }),
                }}>
                  <span style={{
                    ...s.poolStatusDot,
                    ...(isPoolReady ? {} : { background: '#f97316', boxShadow: '0 0 6px rgba(249, 115, 22, 0.5)' }),
                  }} />
                  {isPoolReady ? 'Active' : 'Vault Deploying...'}
                </div>
              </div>
              <div style={s.poolInfoRow}>
                <span style={s.poolInfoLabel}>Vault Address</span>
                <span style={s.poolInfoValue}>
                  {selectedPool?.vaultAddress
                    ? `${selectedPool.vaultAddress.slice(0, 12)}...${selectedPool.vaultAddress.slice(-6)}`
                    : '--'}
                </span>
              </div>
              <div style={s.poolInfoRow}>
                <span style={s.poolInfoLabel}>Token Address</span>
                <span style={s.poolInfoValue}>
                  {selectedPool?.stakingTokenAddress
                    ? `${selectedPool.stakingTokenAddress.slice(0, 12)}...${selectedPool.stakingTokenAddress.slice(-6)}`
                    : '--'}
                </span>
              </div>
            </div>

            {/* Stats Grid */}
            <div style={s.statsGrid}>
              {[
                { label: 'Total Staked', value: `${totalStakedDisplay} ${tokenSymbol}`, color: '#f97316' },
                { label: 'Your Staked', value: walletAddress ? `${userStakedDisplay} ${tokenSymbol}` : '--', color: '#3b82f6' },
                { label: 'Pending Rewards', value: walletAddress ? `${pendingRewardsDisplay} ${tokenSymbol}` : '--', color: '#10b981' },
                { label: 'Reward Rate', value: `${rewardRateDisplay}/block`, color: '#a855f7' },
              ].map((stat) => (
                <div key={stat.label} style={s.statCard}>
                  <span style={s.statLabel}>{stat.label}</span>
                  <span style={{ ...s.statValue, color: stat.color }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Stake/Unstake/Claim panel */}
          <div style={s.tradePanel}>
            <div style={s.tradePanelGlow} />

            {/* User Balances */}
            {walletAddress && (
              <div style={s.balancesWrap}>
                <div style={s.balanceRow}>
                  <span style={s.balanceLabel}>{tokenSymbol} Balance</span>
                  <span style={s.balanceValue}>{tokenBalanceDisplay} {tokenSymbol}</span>
                </div>
                <div style={s.balanceRow}>
                  <span style={s.balanceLabel}>Staked</span>
                  <span style={s.balanceValue}>{userStakedDisplay} {tokenSymbol}</span>
                </div>
              </div>
            )}

            {tradeStatus.active ? (
              /* Trade in progress: Show stepper */
              <div style={s.tradeProgress}>
                <div style={s.tradeProgressHeader}>
                  <div style={{
                    ...s.tradeProgressSpinner,
                    animation: tradeStatus.success ? 'none' : 'spin 1s linear infinite',
                  }}>
                    {tradeStatus.success ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : tradeStatus.error ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    )}
                  </div>
                  <h3 style={s.tradeProgressTitle}>
                    {tradeStatus.success
                      ? tradeStatus.type === 'stake' ? 'Stake Successful!'
                        : tradeStatus.type === 'unstake' ? 'Unstake Successful!'
                        : 'Rewards Claimed!'
                      : tradeStatus.error
                        ? 'Transaction Failed'
                        : tradeStatus.type === 'stake' ? 'Staking Tokens...'
                        : tradeStatus.type === 'unstake' ? 'Unstaking Tokens...'
                        : 'Claiming Rewards...'}
                  </h3>
                </div>

                <div style={s.tradeSteps}>
                  {tradeStatus.steps.map((step, i) => (
                    <div key={i} style={s.tradeStepRow}>
                      <div style={{
                        ...s.tradeStepCircle,
                        ...(step.status === 'done' ? s.tradeStepDone : {}),
                        ...(step.status === 'active' ? s.tradeStepActive : {}),
                        ...(step.status === 'error' ? s.tradeStepError : {}),
                      }}>
                        {step.status === 'done' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : step.status === 'error' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        ) : (
                          <span style={{ fontSize: '10px' }}>{i + 1}</span>
                        )}
                      </div>
                      <span style={{
                        ...s.tradeStepLabel,
                        color: step.status === 'done' ? '#10b981'
                          : step.status === 'active' ? '#f97316'
                          : step.status === 'error' ? '#f43f5e'
                          : '#5a5a78',
                        fontWeight: step.status === 'active' ? '600' : '400',
                      }}>
                        {step.label}
                      </span>
                      {step.status === 'active' && (
                        <span style={s.tradeStepBadge}>Processing...</span>
                      )}
                    </div>
                  ))}
                </div>

                {tradeStatus.error && (
                  <div style={s.tradeProgressError}>{tradeStatus.error}</div>
                )}

                {(tradeStatus.success || tradeStatus.error) && (
                  <button
                    onClick={() => { resetTradeStatus(); refreshData(); }}
                    style={{
                      ...s.tradeBtn,
                      background: tradeStatus.success
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : 'linear-gradient(135deg, #5a5a78, #3a3a58)',
                      marginTop: '16px',
                    }}
                  >
                    {tradeStatus.success ? 'Done' : 'Back'}
                  </button>
                )}
              </div>
            ) : (
              /* Normal: Stake/Unstake form + Claim */
              <>
                <div style={s.tradeTabs}>
                  <button
                    onClick={() => { setStakeTab('stake'); setAmount(''); setError(null); }}
                    style={{
                      ...s.tradeTabBtn,
                      ...(stakeTab === 'stake' ? s.tradeTabStake : {}),
                    }}
                  >
                    Stake
                  </button>
                  <button
                    onClick={() => { setStakeTab('unstake'); setAmount(''); setError(null); }}
                    style={{
                      ...s.tradeTabBtn,
                      ...(stakeTab === 'unstake' ? s.tradeTabUnstake : {}),
                    }}
                  >
                    Unstake
                  </button>
                </div>

                <div style={s.tradeForm}>
                  <label style={s.tradeLabel}>
                    {stakeTab === 'stake' ? 'Amount to Stake' : 'Amount to Unstake'}
                  </label>
                  <div style={s.inputGroup}>
                    <input
                      type="text"
                      placeholder="0.0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      style={s.tradeInput}
                    />
                    <span style={s.inputSuffix}>{tokenSymbol}</span>
                  </div>

                  {/* Quick amounts */}
                  <div style={s.quickAmounts}>
                    {['25%', '50%', '75%', 'Max'].map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          const pct = v === 'Max' ? 1 : parseInt(v) / 100;
                          const val = maxAmount * pct;
                          setAmount(val > 0 ? val.toFixed(4) : '0');
                        }}
                        style={s.quickBtn}
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  {tradeError && (
                    <div style={s.errorText}>{tradeError}</div>
                  )}

                  <button
                    onClick={handleStake}
                    disabled={tradeLoading || !amount || !walletAddress || !isPoolReady || parseFloat(amount || '0') <= 0}
                    style={{
                      ...s.tradeBtn,
                      background: stakeTab === 'stake'
                        ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                        : 'linear-gradient(135deg, #f97316, #ea580c)',
                      boxShadow: stakeTab === 'stake'
                        ? '0 0 20px rgba(59, 130, 246, 0.15)'
                        : '0 0 20px rgba(249, 115, 22, 0.15)',
                      opacity: tradeLoading || !amount || !walletAddress || !isPoolReady || parseFloat(amount || '0') <= 0 ? 0.5 : 1,
                    }}
                  >
                    {!walletAddress
                      ? 'Connect Wallet'
                      : !isPoolReady
                        ? 'Vault Deploying...'
                        : tradeLoading
                          ? 'Processing...'
                          : stakeTab === 'stake'
                            ? `Stake ${tokenSymbol}`
                            : `Unstake ${tokenSymbol}`}
                  </button>
                </div>

                {/* Pending Rewards */}
                <div style={s.rewardsSection}>
                  <div style={s.rewardsHeader}>
                    <span style={s.rewardsLabel}>Pending Rewards</span>
                    <span style={s.rewardsValue}>
                      {walletAddress ? `${pendingRewardsDisplay} ${tokenSymbol}` : '--'}
                    </span>
                  </div>
                  <button
                    onClick={handleClaim}
                    disabled={tradeLoading || !walletAddress || !isPoolReady || !hasPendingRewards}
                    style={{
                      ...s.claimBtn,
                      opacity: tradeLoading || !walletAddress || !hasPendingRewards ? 0.5 : 1,
                    }}
                  >
                    {tradeLoading ? 'Processing...' : 'Claim Rewards'}
                  </button>
                </div>

                {/* Contract info */}
                <div style={s.contractInfo}>
                  <div style={s.contractRow}>
                    <span style={s.contractLabel}>Vault</span>
                    <span style={s.contractAddress}>
                      {selectedPool?.vaultAddress
                        ? `${selectedPool.vaultAddress.slice(0, 12)}...${selectedPool.vaultAddress.slice(-6)}`
                        : '--'}
                    </span>
                  </div>
                  <div style={s.contractRow}>
                    <span style={s.contractLabel}>Token</span>
                    <span style={s.contractAddress}>
                      {selectedPool?.stakingTokenAddress
                        ? `${selectedPool.stakingTokenAddress.slice(0, 12)}...${selectedPool.stakingTokenAddress.slice(-6)}`
                        : '--'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  pageTag: { display: 'inline-block', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', color: '#f97316', marginBottom: '8px' },
  pageTitle: { fontSize: '36px', fontWeight: '800', marginBottom: '8px', letterSpacing: '-1px', color: '#f0f0ff' },
  pageSubtitle: { color: '#9898b8', fontSize: '16px', marginBottom: '36px' },

  infoCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '22px', padding: '36px', marginBottom: '40px', position: 'relative' as const, overflow: 'hidden' },
  infoCardGlow: { position: 'absolute' as const, top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '300px', height: '200px', background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.06) 0%, transparent 70%)', pointerEvents: 'none' },
  infoTitle: { fontSize: '20px', fontWeight: '800', marginBottom: '28px', textAlign: 'center' as const, color: '#f0f0ff', position: 'relative' as const },

  stepsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', position: 'relative' as const },
  stepCard: { textAlign: 'center' as const, padding: '16px' },
  stepIcon: { width: '48px', height: '48px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' },
  stepTitle: { fontSize: '15px', fontWeight: '700', marginBottom: '6px', color: '#f0f0ff' },
  stepDesc: { fontSize: '13px', color: '#5a5a78', lineHeight: 1.6, margin: 0 },

  section: { marginBottom: '32px' },
  sectionTitle: { fontSize: '20px', fontWeight: '800', marginBottom: '16px', color: '#f0f0ff' },

  emptyState: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '20px', padding: '48px 32px', textAlign: 'center' as const },
  emptyIcon: { fontSize: '48px', marginBottom: '16px', opacity: 0.4 },
  emptyTitle: { fontSize: '20px', fontWeight: '800', marginBottom: '12px', color: '#f0f0ff' },
  emptyDesc: { fontSize: '14px', color: '#9898b8', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 28px' },
  emptyCtas: { display: 'flex', justifyContent: 'center', gap: '14px' },
  ctaPrimary: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', boxShadow: '0 0 20px rgba(249, 115, 22, 0.15)' },
  ctaSecondary: { display: 'inline-flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', color: '#f0f0ff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', border: '1px solid rgba(255, 255, 255, 0.08)' },

  loadingWrap: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '16px', padding: '60px 0' },
  spinner: { width: '32px', height: '32px', border: '3px solid rgba(249, 115, 22, 0.2)', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  loadingText: { color: '#5a5a78', fontSize: '14px' },

  // Two column layout
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: '28px', alignItems: 'start' },
  leftCol: {},

  // Pool selector
  poolSelector: { marginBottom: '20px' },
  poolSelectorLabel: { display: 'block', fontSize: '13px', color: '#5a5a78', marginBottom: '6px' },
  poolSelectorSelect: { width: '100%', background: 'rgba(5, 5, 16, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '12px 16px', color: '#f0f0ff', fontSize: '14px', outline: 'none' },

  // Pool info card
  poolCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '20px', padding: '24px', marginBottom: '20px', position: 'relative' as const, overflow: 'hidden' },
  poolCardGlow: { position: 'absolute' as const, top: '-40px', right: '-40px', width: '200px', height: '200px', background: 'radial-gradient(ellipse, rgba(59, 130, 246, 0.06) 0%, transparent 70%)', pointerEvents: 'none' },
  poolHeader: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', position: 'relative' as const },
  poolTokenImg: { width: '48px', height: '48px', borderRadius: '14px', objectFit: 'cover' as const, boxShadow: '0 0 20px rgba(249, 115, 22, 0.15)' },
  poolTokenIcon: { width: '48px', height: '48px', borderRadius: '14px', background: 'linear-gradient(135deg, #3b82f6, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '16px', color: '#ffffff', flexShrink: 0 },
  poolTokenName: { fontSize: '22px', fontWeight: '800', margin: 0, color: '#f0f0ff' },
  poolTokenSymbol: { fontSize: '13px', color: '#5a5a78' },
  poolStatusBadge: { display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', background: 'rgba(16, 185, 129, 0.08)', padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.15)' },
  poolStatusDot: { width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.5)' },
  poolInfoRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(255, 255, 255, 0.04)', position: 'relative' as const },
  poolInfoLabel: { fontSize: '13px', color: '#5a5a78' },
  poolInfoValue: { fontSize: '13px', fontFamily: 'var(--font-mono)', color: '#9898b8' },

  // Stats grid
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' },
  statCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '18px', textAlign: 'center' as const },
  statLabel: { display: 'block', fontSize: '11px', color: '#5a5a78', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  statValue: { display: 'block', fontSize: '16px', fontWeight: '800', fontFamily: 'var(--font-mono)' },

  // Trade panel (right column)
  tradePanel: { background: 'rgba(15, 15, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '22px', padding: '24px', position: 'sticky' as const, top: '96px', overflow: 'hidden' },
  tradePanelGlow: { position: 'absolute' as const, top: '-50px', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '150px', background: 'radial-gradient(ellipse, rgba(59, 130, 246, 0.08) 0%, transparent 70%)', pointerEvents: 'none' },

  balancesWrap: { display: 'flex', flexDirection: 'column' as const, gap: '6px', marginBottom: '18px' },
  balanceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.04)', position: 'relative' as const },
  balanceLabel: { fontSize: '13px', color: '#5a5a78' },
  balanceValue: { fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: '#3b82f6' },

  tradeTabs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '4px', position: 'relative' as const },
  tradeTabBtn: { background: 'transparent', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', color: '#5a5a78', cursor: 'pointer', transition: 'all 0.2s' },
  tradeTabStake: { background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' },
  tradeTabUnstake: { background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' },

  tradeForm: { position: 'relative' as const },
  tradeLabel: { display: 'block', fontSize: '13px', color: '#5a5a78', marginBottom: '8px' },
  inputGroup: { position: 'relative' as const, marginBottom: '12px' },
  tradeInput: { width: '100%', background: 'rgba(5, 5, 16, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '14px', padding: '16px 60px 16px 18px', color: '#f0f0ff', fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: '700', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', boxSizing: 'border-box' as const },
  inputSuffix: { position: 'absolute' as const, right: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#5a5a78', fontWeight: '600' },
  quickAmounts: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' },
  quickBtn: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#9898b8', padding: '9px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' },
  errorText: { color: '#f43f5e', fontSize: '13px', marginBottom: '8px', padding: '8px 12px', background: 'rgba(244, 63, 94, 0.06)', borderRadius: '8px' },
  tradeBtn: { width: '100%', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '700', color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' as const },

  // Rewards section
  rewardsSection: { marginTop: '20px', padding: '20px', background: 'rgba(16, 185, 129, 0.04)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)', position: 'relative' as const },
  rewardsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' },
  rewardsLabel: { fontSize: '13px', color: '#10b981', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  rewardsValue: { fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: '#f0f0ff' },
  claimBtn: { width: '100%', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: '#ffffff', padding: '14px', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 16px rgba(16, 185, 129, 0.15)' },

  // Contract info
  contractInfo: { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column' as const, gap: '8px', position: 'relative' as const },
  contractRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  contractLabel: { color: '#5a5a78' },
  contractAddress: { fontFamily: 'var(--font-mono)', color: '#9898b8' },

  // Trade Progress
  tradeProgress: { padding: '8px 0' },
  tradeProgressHeader: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '12px', marginBottom: '24px' },
  tradeProgressSpinner: { width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', border: '2px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tradeProgressTitle: { fontSize: '18px', fontWeight: '700', color: '#f0f0ff', margin: 0, textAlign: 'center' as const },
  tradeSteps: { display: 'flex', flexDirection: 'column' as const, gap: '12px', marginBottom: '16px' },
  tradeStepRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.04)' },
  tradeStepCircle: { width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', background: 'rgba(255, 255, 255, 0.05)', color: '#5a5a78', flexShrink: 0, border: '1px solid rgba(255, 255, 255, 0.08)' },
  tradeStepDone: { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 0 8px rgba(16, 185, 129, 0.2)' },
  tradeStepActive: { background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)', boxShadow: '0 0 8px rgba(249, 115, 22, 0.2)' },
  tradeStepError: { background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.3)', boxShadow: '0 0 8px rgba(244, 63, 94, 0.2)' },
  tradeStepLabel: { fontSize: '13px', color: '#9898b8', flex: 1 },
  tradeStepBadge: { fontSize: '11px', color: '#f97316', background: 'rgba(249, 115, 22, 0.1)', padding: '3px 8px', borderRadius: '6px', fontWeight: '600', flexShrink: 0 },
  tradeProgressError: { color: '#f43f5e', fontSize: '13px', padding: '10px 14px', background: 'rgba(244, 63, 94, 0.06)', borderRadius: '10px', border: '1px solid rgba(244, 63, 94, 0.15)', marginBottom: '8px' },
};
