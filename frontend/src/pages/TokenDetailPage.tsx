import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useBondingCurve, type CurveState } from '../hooks/useBondingCurve';
import { useProvider } from '../context/ProviderContext';
import { useTradeHistory } from '../hooks/useTradeHistory';
import TradeHistoryTable from '../components/TradeHistoryTable';
import HolderList from '../components/HolderList';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

type TradeTab = 'buy' | 'sell';

interface TokenMeta {
  tokenId: string;
  curveAddress: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  creator: string;
  status: string;
}

export default function TokenDetailPage() {
  const { tokenId: tokenAddress } = useParams();
  const { walletAddress } = useWalletConnect();
  const provider = useProvider();
  const [tradeTab, setTradeTab] = useState<TradeTab>('buy');
  const [infoTab, setInfoTab] = useState<'history' | 'holders'>('history');
  const [amount, setAmount] = useState('');
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [curveState, setCurveState] = useState<CurveState | null>(null);
  const [userBalance, setUserBalance] = useState<bigint>(0n);
  const [btcBalance, setBtcBalance] = useState<bigint>(0n);
  const [copied, setCopied] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const graduationNotified = useRef(false);

  // Fetch token metadata from backend (includes curveAddress)
  useEffect(() => {
    if (!tokenAddress) return;
    fetch(`${BACKEND_URL}/api/tokens/${tokenAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && !data.error) setTokenMeta(data);
      })
      .catch(() => {})
      .finally(() => setLoadingState(false));
  }, [tokenAddress]);

  const [pendingBtc, setPendingBtc] = useState<bigint>(0n);

  // Use the bonding curve hook with real contract addresses
  const curveAddr = tokenMeta?.curveAddress || '';
  const {
    getCurveState, buy, sell, getBalance, getPendingWithdrawal, claimBtc,
    loading: tradeLoading, error: tradeError,
    tradeStatus, resetTradeStatus,
  } = useBondingCurve(curveAddr, tokenAddress);

  // Trade history & holders
  const {
    trades, holders, totalTrades: historyTotal, totalHolders,
    loadingTrades, loadingHolders, fetchTrades, fetchHolders, reportTrade,
  } = useTradeHistory(tokenAddress || '');

  // Fetch curve state from chain
  useEffect(() => {
    if (!curveAddr) return;
    getCurveState().then(setCurveState);
  }, [curveAddr, getCurveState]);

  // Auto-notify backend when chain reports graduation
  useEffect(() => {
    if (curveState?.isGraduated && !graduationNotified.current) {
      graduationNotified.current = true;
      fetch(`${BACKEND_URL}/api/tokens/${tokenAddress}/graduate`, { method: 'POST' }).catch(() => {});
    }
  }, [curveState, tokenAddress]);

  // Fetch real OP_20 token balance
  useEffect(() => {
    if (walletAddress && tokenAddress) {
      getBalance().then(setUserBalance);
    }
  }, [walletAddress, tokenAddress, getBalance]);

  // Fetch BTC balance
  useEffect(() => {
    if (!walletAddress) return;
    provider.getBalance(walletAddress).then(setBtcBalance).catch(() => {});
  }, [walletAddress, provider]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Fetch pending BTC withdrawal
  useEffect(() => {
    if (walletAddress && curveAddr) {
      getPendingWithdrawal().then(setPendingBtc);
    }
  }, [walletAddress, curveAddr, getPendingWithdrawal]);

  const progressPercent = curveState
    ? Number((curveState.realBtcCollected * 100n) / (curveState.targetMarketCap || 1n))
    : 0;
  const realBtcCollected = curveState
    ? (Number(curveState.realBtcCollected) / 1e8).toFixed(4)
    : '0';
  const targetMarketCap = curveState
    ? (Number(curveState.targetMarketCap) / 1e8).toFixed(1)
    : '0.3';
  const isActive = curveState ? curveState.isActive : false;
  const isGraduated = curveState ? curveState.isGraduated : false;
  const totalTrades = curveState ? curveState.totalTrades.toString() : '0';

  const handleTrade = async () => {
    if (!amount || !walletAddress) return;
    try {
      if (tradeTab === 'buy') {
        const sats = BigInt(Math.floor(parseFloat(amount) * 1e8));
        await buy(sats);
      } else {
        const tokenAmount = BigInt(Math.floor(parseFloat(amount) * 1e18));
        await sell(tokenAmount);
        // Refresh pending withdrawal after sell
        getPendingWithdrawal().then(setPendingBtc);
      }
      // Report trade to backend for history tracking
      const satsUsed = tradeTab === 'buy'
        ? BigInt(Math.floor(parseFloat(amount) * 1e8)).toString()
        : '0';
      const tokensUsed = tradeTab === 'sell'
        ? BigInt(Math.floor(parseFloat(amount) * 1e18)).toString()
        : '0';
      reportTrade({
        tokenAddress: tokenAddress || '',
        curveAddress: curveAddr,
        tradeType: tradeTab,
        btcAmount: satsUsed,
        tokenAmount: tokensUsed,
        traderAddress: walletAddress,
      });

      setAmount('');
      getCurveState().then(setCurveState);
      getBalance().then(setUserBalance);
      provider.getBalance(walletAddress).then(setBtcBalance).catch(() => {});
    } catch (err) {
      console.error('Trade failed:', err);
    }
  };

  const [claiming, setClaiming] = useState(false);
  const handleClaimBtc = async () => {
    if (!walletAddress || claiming) return;
    setClaiming(true);
    try {
      const result = await claimBtc();
      if (result) {
        setPendingBtc(0n);
      }
    } catch (err) {
      console.error('Claim failed:', err);
    } finally {
      setClaiming(false);
    }
  };

  const tokenName = tokenMeta?.name || `Token`;
  const tokenSymbol = tokenMeta?.symbol || 'TOKEN';
  const userBalanceDisplay = (Number(userBalance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const btcBalanceDisplay = (Number(btcBalance) / 1e8).toFixed(6);

  return (
    <div style={styles.container}>
      {/* Left: Token Info + Chart */}
      <div style={styles.mainContent}>
        <div style={styles.tokenHeader}>
          <div style={styles.tokenHeaderLeft}>
            {tokenMeta?.imageUrl ? (
              <img src={tokenMeta.imageUrl} alt={tokenName} style={styles.tokenIconImg} />
            ) : (
              <div style={styles.tokenIcon}>
                {tokenSymbol.slice(0, 2)}
              </div>
            )}
            <div>
              <h1 style={styles.tokenName}>{tokenName}</h1>
              <span style={styles.tokenSymbol}>${tokenSymbol}</span>
              <div style={styles.addressCopyRow}>
                <button
                  onClick={() => tokenAddress && copyToClipboard(tokenAddress, 'token')}
                  style={styles.addressCopyBtn}
                  title={tokenAddress || ''}
                >
                  <span style={styles.addressCopyLabel}>Token:</span>
                  <span style={styles.addressCopyValue}>
                    {tokenAddress ? `${tokenAddress.slice(0, 10)}...${tokenAddress.slice(-4)}` : '--'}
                  </span>
                  <span style={styles.addressCopyIcon}>{copied === 'token' ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  onClick={() => curveAddr && copyToClipboard(curveAddr, 'curve')}
                  style={styles.addressCopyBtn}
                  title={curveAddr || ''}
                >
                  <span style={styles.addressCopyLabel}>Curve:</span>
                  <span style={styles.addressCopyValue}>
                    {curveAddr ? `${curveAddr.slice(0, 10)}...${curveAddr.slice(-4)}` : '--'}
                  </span>
                  <span style={styles.addressCopyIcon}>{copied === 'curve' ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
          <div style={styles.statusBadge}>
            <span style={{
              ...styles.statusDot,
              background: isGraduated ? '#a855f7' : isActive ? '#10b981' : '#5a5a78',
              boxShadow: isActive ? '0 0 8px rgba(16,185,129,0.5)' : 'none',
            }} />
            <span style={{
              ...styles.statusText,
              color: isGraduated ? '#a855f7' : isActive ? '#10b981' : '#5a5a78',
            }}>
              {isActive ? 'Active' : isGraduated ? 'Graduated' : loadingState ? '...' : 'Inactive'}
            </span>
          </div>
        </div>

        {tokenMeta?.description && (
          <p style={styles.description}>{tokenMeta.description}</p>
        )}

        {/* Graduation Banner */}
        {isGraduated && (
          <div style={styles.graduationBanner}>
            <div style={styles.graduationGlow} />
            <div style={styles.graduationContent}>
              <div style={styles.graduationIcon}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></div>
              <div>
                <h3 style={styles.graduationTitle}>Token Graduated!</h3>
                <p style={styles.graduationDesc}>
                  This token has completed its bonding curve and liquidity has been added to the DEX pool.
                  You can now swap this token on the DEX.
                </p>
              </div>
            </div>
            <Link to={`/swap?token=${tokenAddress}`} style={styles.graduationSwapBtn}>
              Swap on DEX &rarr;
            </Link>
          </div>
        )}

        {/* Progress to Graduation */}
        <div style={styles.progressSection}>
          <div style={styles.progressHeader}>
            <span style={styles.progressTitle}>Bonding Curve Progress</span>
            <span style={styles.progressPercent}>{progressPercent}%</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.min(progressPercent, 100)}%`,
              }}
            />
          </div>
          <div style={styles.progressInfo}>
            <span>{realBtcCollected} BTC collected</span>
            <span>Target: {targetMarketCap} BTC</span>
          </div>
        </div>

        {/* Chart */}
        <div style={styles.chartContainer}>
          <div style={styles.chartHeader}>
            <span style={styles.chartTitle}>Price Chart</span>
            <span style={styles.chartSubtext}>Bonding curve visualization</span>
          </div>
          <svg width="100%" height="140" viewBox="0 0 600 140">
            <defs>
              <linearGradient id="detailChartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="detailChartStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <polygon
              fill="url(#detailChartGrad)"
              points="0,120 50,115 100,105 150,100 200,88 250,72 300,66 350,56 400,48 450,42 500,34 550,28 600,24 600,140 0,140"
            />
            <polyline
              fill="none"
              stroke="url(#detailChartStroke)"
              strokeWidth="2.5"
              strokeLinecap="round"
              points="0,120 50,115 100,105 150,100 200,88 250,72 300,66 350,56 400,48 450,42 500,34 550,28 600,24"
            />
          </svg>
        </div>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          {[
            { label: 'BTC Collected', value: realBtcCollected, color: '#f97316' },
            { label: 'Target', value: `${targetMarketCap} BTC`, color: '#3b82f6' },
            { label: 'Total Trades', value: totalTrades, color: '#a855f7' },
            { label: 'Status', value: isGraduated ? 'Graduated' : isActive ? 'Active' : 'Inactive', color: isGraduated ? '#a855f7' : '#10b981' },
          ].map((stat) => (
            <div key={stat.label} style={styles.statCard}>
              <span style={styles.statLabel}>{stat.label}</span>
              <span style={{ ...styles.statValue, color: stat.color }}>{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Trade History / Holders Tabs */}
        <div style={styles.infoSection}>
          <div style={styles.infoTabs}>
            <button
              onClick={() => setInfoTab('history')}
              style={{
                ...styles.infoTabBtn,
                ...(infoTab === 'history' ? styles.infoTabActive : {}),
              }}
            >
              Trade History
            </button>
            <button
              onClick={() => setInfoTab('holders')}
              style={{
                ...styles.infoTabBtn,
                ...(infoTab === 'holders' ? styles.infoTabActive : {}),
              }}
            >
              Holders {totalHolders > 0 ? `(${totalHolders})` : ''}
            </button>
          </div>
          <div style={styles.infoContent}>
            {infoTab === 'history' ? (
              <TradeHistoryTable
                trades={trades}
                loading={loadingTrades}
                tokenSymbol={tokenSymbol}
                onLoadMore={() => fetchTrades(50, trades.length)}
                hasMore={trades.length < historyTotal}
              />
            ) : (
              <HolderList
                holders={holders}
                loading={loadingHolders}
                tokenSymbol={tokenSymbol}
                totalSupply={curveState ? (curveState.tokensSold + curveState.tokensRemaining).toString() : undefined}
                onLoadMore={() => fetchHolders(50, holders.length)}
                hasMore={holders.length < totalHolders}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right: Trade Panel */}
      <div style={styles.tradePanel}>
        <div style={styles.tradePanelGlow} />

        {/* User Balances */}
        {walletAddress && (
          <div style={styles.balancesWrap}>
            <div style={styles.balanceRow}>
              <span style={styles.balanceLabel}>BTC Balance</span>
              <span style={styles.balanceValue}>{btcBalanceDisplay} BTC</span>
            </div>
            <div style={styles.balanceRow}>
              <span style={styles.balanceLabel}>{tokenSymbol} Balance</span>
              <span style={styles.balanceValue}>{userBalanceDisplay} {tokenSymbol}</span>
            </div>
          </div>
        )}

        {/* Pending BTC Withdrawal */}
        {walletAddress && pendingBtc > 0n && (
          <div style={styles.pendingRow}>
            <div style={styles.pendingInfo}>
              <span style={styles.pendingLabel}>Pending BTC</span>
              <span style={styles.pendingAmount}>
                {(Number(pendingBtc) / 1e8).toFixed(6)} BTC
              </span>
            </div>
            <button
              onClick={handleClaimBtc}
              disabled={claiming || tradeLoading}
              style={{
                ...styles.claimBtn,
                ...(claiming ? { opacity: 0.6, cursor: 'not-allowed' } : {}),
              }}
            >
              {claiming ? 'Claiming...' : 'Claim BTC'}
            </button>
          </div>
        )}

        {isGraduated ? (
          /* Graduated: Redirect to DEX */
          <div style={styles.graduatedPanel}>
            <div style={styles.graduatedIconWrap}>
              <span style={styles.graduatedIcon}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg></span>
            </div>
            <h3 style={styles.graduatedPanelTitle}>Graduated to DEX</h3>
            <p style={styles.graduatedPanelDesc}>
              This token has completed its bonding curve. Trading now happens on the DEX with AMM liquidity.
            </p>
            <Link to={`/swap?token=${tokenAddress}`} style={styles.graduatedSwapLink}>
              Swap {tokenSymbol} on DEX &rarr;
            </Link>
          </div>
        ) : tradeStatus.active ? (
          /* Trade in progress: Show stepper */
          <div style={styles.tradeProgress}>
            <div style={styles.tradeProgressHeader}>
              <div style={{
                ...styles.tradeProgressSpinner,
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
              <h3 style={styles.tradeProgressTitle}>
                {tradeStatus.success
                  ? (tradeStatus.type === 'buy' ? 'Buy Successful!' : 'Sell Successful!')
                  : tradeStatus.error
                    ? 'Transaction Failed'
                    : tradeStatus.type === 'buy'
                      ? 'Buying Tokens...'
                      : 'Selling Tokens...'}
              </h3>
            </div>

            <div style={styles.tradeSteps}>
              {tradeStatus.steps.map((step, i) => (
                <div key={i} style={styles.tradeStepRow}>
                  <div style={{
                    ...styles.tradeStepCircle,
                    ...(step.status === 'done' ? styles.tradeStepDone : {}),
                    ...(step.status === 'active' ? styles.tradeStepActive : {}),
                    ...(step.status === 'error' ? styles.tradeStepError : {}),
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
                    ...styles.tradeStepLabel,
                    color: step.status === 'done' ? '#10b981'
                      : step.status === 'active' ? '#f97316'
                      : step.status === 'error' ? '#f43f5e'
                      : '#5a5a78',
                    fontWeight: step.status === 'active' ? '600' : '400',
                  }}>
                    {step.label}
                  </span>
                  {step.status === 'active' && (
                    <span style={styles.tradeStepBadge}>Processing...</span>
                  )}
                </div>
              ))}
            </div>

            {tradeStatus.error && (
              <div style={styles.tradeProgressError}>
                {tradeStatus.error}
              </div>
            )}

            {(tradeStatus.success || tradeStatus.error) && (
              <button
                onClick={resetTradeStatus}
                style={{
                  ...styles.tradeBtn,
                  background: tradeStatus.success
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #5a5a78, #3a3a58)',
                  marginTop: '16px',
                }}
              >
                {tradeStatus.success ? 'Done' : 'Back to Trade'}
              </button>
            )}
          </div>
        ) : (
          /* Active: Show buy/sell */
          <>
            <div style={styles.tradeTabs}>
              <button
                onClick={() => setTradeTab('buy')}
                style={{
                  ...styles.tradeTabBtn,
                  ...(tradeTab === 'buy' ? styles.tradeTabBuy : {}),
                }}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeTab('sell')}
                style={{
                  ...styles.tradeTabBtn,
                  ...(tradeTab === 'sell' ? styles.tradeTabSell : {}),
                }}
              >
                Sell
              </button>
            </div>

            <div style={styles.tradeForm}>
              <label style={styles.tradeLabel}>
                {tradeTab === 'buy' ? 'BTC Amount' : 'Token Amount'}
              </label>
              <div style={styles.inputGroup}>
                <input
                  type="text"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={styles.tradeInput}
                />
                <span style={styles.inputSuffix}>
                  {tradeTab === 'buy' ? 'BTC' : tokenSymbol}
                </span>
              </div>

              {/* Quick amounts */}
              <div style={styles.quickAmounts}>
                {['25%', '50%', '75%', 'Max'].map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      const pct = v === 'Max' ? 1 : parseInt(v) / 100;
                      if (tradeTab === 'buy') {
                        const btcAmt = Number(btcBalance) / 1e8 * pct;
                        setAmount(btcAmt > 0 ? btcAmt.toFixed(6) : '0');
                      } else {
                        const tokenAmt = Number(userBalance) / 1e18 * pct;
                        setAmount(tokenAmt > 0 ? tokenAmt.toFixed(4) : '0');
                      }
                    }}
                    style={styles.quickBtn}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {tradeError && (
                <div style={styles.errorText}>
                  {tradeError}
                </div>
              )}

              <button
                onClick={handleTrade}
                disabled={tradeLoading || !amount || !walletAddress || !isActive}
                style={{
                  ...styles.tradeBtn,
                  background:
                    tradeTab === 'buy'
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                  boxShadow:
                    tradeTab === 'buy'
                      ? '0 0 20px rgba(16, 185, 129, 0.15)'
                      : '0 0 20px rgba(244, 63, 94, 0.15)',
                  opacity: tradeLoading || !amount || !walletAddress || !isActive ? 0.5 : 1,
                }}
              >
                {!walletAddress
                  ? 'Connect Wallet'
                  : !isActive
                    ? 'Curve Not Active'
                    : tradeLoading
                      ? 'Processing...'
                      : tradeTab === 'buy'
                        ? `Buy ${tokenSymbol}`
                        : `Sell ${tokenSymbol}`}
              </button>
            </div>
          </>
        )}

        {/* Contract info */}
        <div style={styles.contractInfo}>
          <div style={styles.contractRow}>
            <span style={styles.contractLabel}>Token</span>
            <span style={styles.contractAddress}>
              {tokenAddress ? `${tokenAddress.slice(0, 12)}...${tokenAddress.slice(-6)}` : '—'}
            </span>
          </div>
          <div style={styles.contractRow}>
            <span style={styles.contractLabel}>Curve</span>
            <span style={styles.contractAddress}>
              {curveAddr ? `${curveAddr.slice(0, 12)}...${curveAddr.slice(-6)}` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'grid', gridTemplateColumns: '1fr 400px', gap: '28px', alignItems: 'start' },
  mainContent: {},

  tokenHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' },
  tokenHeaderLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  tokenIcon: { width: '60px', height: '60px', borderRadius: '16px', background: 'linear-gradient(135deg, #f97316, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '20px', color: '#ffffff', flexShrink: 0, boxShadow: '0 0 24px rgba(249, 115, 22, 0.2)' },
  tokenIconImg: { width: '60px', height: '60px', borderRadius: '16px', objectFit: 'cover' as const, flexShrink: 0, boxShadow: '0 0 24px rgba(249, 115, 22, 0.2)' },
  tokenName: { fontSize: '30px', fontWeight: '800', margin: 0, letterSpacing: '-0.5px', color: '#f0f0ff' },
  tokenSymbol: { fontSize: '14px', color: '#5a5a78', display: 'block' },
  addressCopyRow: { display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' as const },
  addressCopyBtn: { display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '3px 8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '11px', color: '#9898b8' },
  addressCopyLabel: { color: '#5a5a78', fontWeight: '600' },
  addressCopyValue: { fontFamily: 'var(--font-mono)', color: '#9898b8' },
  addressCopyIcon: { color: '#f97316', fontWeight: '600', marginLeft: '4px' },
  statusBadge: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', padding: '10px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  statusText: { fontSize: '14px', fontWeight: '600' },

  description: { fontSize: '15px', color: '#9898b8', marginBottom: '24px', lineHeight: 1.7, background: 'rgba(15, 15, 35, 0.3)', padding: '16px 20px', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.04)' },

  progressSection: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', padding: '24px', marginBottom: '20px' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '12px' },
  progressTitle: { fontSize: '14px', fontWeight: '700', color: '#f0f0ff' },
  progressPercent: { fontSize: '14px', fontWeight: '800', color: '#f97316', fontFamily: 'var(--font-mono)' },
  progressBar: { height: '6px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' },
  progressFill: { height: '100%', borderRadius: '3px', background: 'linear-gradient(90deg, #f97316, #a855f7)', transition: 'width 0.3s' },
  progressInfo: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#5a5a78' },

  chartContainer: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', padding: '24px', marginBottom: '20px' },
  chartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  chartTitle: { fontSize: '16px', fontWeight: '700', color: '#f0f0ff' },
  chartSubtext: { fontSize: '13px', color: '#5a5a78' },

  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' },
  statCard: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '14px', padding: '18px', textAlign: 'center' as const },
  statLabel: { display: 'block', fontSize: '11px', color: '#5a5a78', marginBottom: '6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  statValue: { fontSize: '18px', fontWeight: '800', fontFamily: 'var(--font-mono)' },

  tradePanel: { background: 'rgba(15, 15, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '22px', padding: '24px', position: 'sticky' as const, top: '96px', overflow: 'hidden' },
  tradePanelGlow: { position: 'absolute' as const, top: '-50px', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '150px', background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.08) 0%, transparent 70%)', pointerEvents: 'none' },

  balancesWrap: { display: 'flex', flexDirection: 'column' as const, gap: '6px', marginBottom: '18px' },
  balanceRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.04)', position: 'relative' as const },
  balanceLabel: { fontSize: '13px', color: '#5a5a78' },
  balanceValue: { fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: '#f97316' },

  tradeTabs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '20px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '4px', position: 'relative' as const },
  tradeTabBtn: { background: 'transparent', border: 'none', padding: '10px', borderRadius: '8px', fontSize: '14px', fontWeight: '700', color: '#5a5a78', cursor: 'pointer', transition: 'all 0.2s' },
  tradeTabBuy: { background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' },
  tradeTabSell: { background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e' },

  tradeForm: { position: 'relative' as const },
  tradeLabel: { display: 'block', fontSize: '13px', color: '#5a5a78', marginBottom: '8px' },
  inputGroup: { position: 'relative' as const, marginBottom: '12px' },
  tradeInput: { width: '100%', background: 'rgba(5, 5, 16, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '14px', padding: '16px 60px 16px 18px', color: '#f0f0ff', fontSize: '20px', fontFamily: 'var(--font-mono)', fontWeight: '700', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' },
  inputSuffix: { position: 'absolute' as const, right: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#5a5a78', fontWeight: '600' },
  quickAmounts: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' },
  quickBtn: { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)', color: '#9898b8', padding: '9px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' },
  errorText: { color: '#f43f5e', fontSize: '13px', marginBottom: '8px', padding: '8px 12px', background: 'rgba(244, 63, 94, 0.06)', borderRadius: '8px' },
  tradeBtn: { width: '100%', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '700', color: '#ffffff', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' as const },

  contractInfo: { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column' as const, gap: '8px', position: 'relative' as const },
  contractRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  contractLabel: { color: '#5a5a78' },
  contractAddress: { fontFamily: 'var(--font-mono)', color: '#9898b8' },

  // Pending Withdrawal
  pendingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', padding: '14px 18px', background: 'rgba(249, 115, 22, 0.06)', borderRadius: '14px', border: '1px solid rgba(249, 115, 22, 0.15)', position: 'relative' as const },
  pendingInfo: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  pendingLabel: { fontSize: '12px', color: '#f97316', fontWeight: '600', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  pendingAmount: { fontSize: '16px', fontWeight: '700', fontFamily: 'var(--font-mono)', color: '#f0f0ff' },
  claimBtn: { background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: '#ffffff', padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 16px rgba(249, 115, 22, 0.2)' },

  // Trade Progress
  tradeProgress: { padding: '8px 0' },
  tradeProgressHeader: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '12px', marginBottom: '24px' },
  tradeProgressSpinner: { width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(249, 115, 22, 0.1)', border: '2px solid rgba(249, 115, 22, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
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

  // Graduation Banner
  graduationBanner: { background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(249, 115, 22, 0.08))', border: '1px solid rgba(168, 85, 247, 0.2)', borderRadius: '18px', padding: '24px', marginBottom: '20px', position: 'relative' as const, overflow: 'hidden' },
  graduationGlow: { position: 'absolute' as const, top: '-30px', right: '-30px', width: '200px', height: '200px', background: 'radial-gradient(ellipse, rgba(168, 85, 247, 0.1) 0%, transparent 70%)', pointerEvents: 'none' },
  graduationContent: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', position: 'relative' as const },
  graduationIcon: { fontSize: '36px', flexShrink: 0 },
  graduationTitle: { fontSize: '18px', fontWeight: '800', color: '#a855f7', margin: '0 0 4px' },
  graduationDesc: { fontSize: '14px', color: '#9898b8', margin: 0, lineHeight: 1.6 },
  graduationSwapBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#ffffff', padding: '12px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', textDecoration: 'none', boxShadow: '0 0 20px rgba(168, 85, 247, 0.2)', position: 'relative' as const },

  // Trade History / Holders Info Section
  infoSection: { background: 'rgba(15, 15, 35, 0.5)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '18px', overflow: 'hidden' },
  infoTabs: { display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' },
  infoTabBtn: { flex: 1, background: 'transparent', border: 'none', padding: '14px 20px', fontSize: '13px', fontWeight: '600', color: '#5a5a78', cursor: 'pointer', transition: 'all 0.2s', borderBottom: '2px solid transparent' },
  infoTabActive: { color: '#f97316', borderBottom: '2px solid #f97316', background: 'rgba(249, 115, 22, 0.04)' },
  infoContent: { padding: '0', maxHeight: '400px', overflowY: 'auto' as const },

  // Graduated Trade Panel
  graduatedPanel: { textAlign: 'center' as const, padding: '20px 0' },
  graduatedIconWrap: { width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(249, 115, 22, 0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid rgba(168, 85, 247, 0.2)' },
  graduatedIcon: { fontSize: '28px' },
  graduatedPanelTitle: { fontSize: '18px', fontWeight: '800', color: '#a855f7', marginBottom: '8px' },
  graduatedPanelDesc: { fontSize: '14px', color: '#9898b8', lineHeight: 1.6, marginBottom: '20px' },
  graduatedSwapLink: { display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#ffffff', padding: '14px 28px', borderRadius: '14px', fontSize: '15px', fontWeight: '700', textDecoration: 'none', boxShadow: '0 0 24px rgba(168, 85, 247, 0.2)', transition: 'all 0.2s' },
};
