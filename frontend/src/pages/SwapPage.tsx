import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { useBondingCurve, type PoolState } from '../hooks/useBondingCurve';
import { useProvider } from '../context/ProviderContext';
import { useTradeHistory } from '../hooks/useTradeHistory';
import TradeHistoryTable from '../components/TradeHistoryTable';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

interface GraduatedToken {
  tokenId: string;
  curveAddress: string;
  name: string;
  symbol: string;
}

export default function SwapPage() {
  const [searchParams] = useSearchParams();
  const preselectedTokenId = searchParams.get('token');
  const { walletAddress } = useWalletConnect();
  const provider = useProvider();
  const [graduatedTokens, setGraduatedTokens] = useState<GraduatedToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<GraduatedToken | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  // Swap state
  const [direction, setDirection] = useState<'btcToToken' | 'tokenToBtc'>('btcToToken');
  const [inputAmount, setInputAmount] = useState('');
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [txResult, setTxResult] = useState<string | null>(null);
  const [btcBalance, setBtcBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);

  const curveAddr = selectedToken?.curveAddress || '';
  const tokenAddr = selectedToken?.tokenId || '';

  const [pendingBtc, setPendingBtc] = useState<bigint>(0n);
  const [claiming, setClaiming] = useState(false);

  const {
    getPoolState,
    getBalance,
    getPendingWithdrawal,
    claimBtc,
    swapBtcForTokens,
    swapTokensForBtc,
    loading: swapping,
    error,
    setError,
    tradeStatus,
    resetTradeStatus,
  } = useBondingCurve(curveAddr, tokenAddr);

  // Trade history
  const {
    trades, totalTrades: historyTotal, loadingTrades: historyLoading,
    fetchTrades, reportTrade,
  } = useTradeHistory(tokenAddr);

  // Fetch graduated tokens from backend
  useEffect(() => {
    const fetchGraduated = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/tokens-graduated`);
        if (res.ok) {
          const data = await res.json();
          if (data.tokens && data.tokens.length > 0) {
            setGraduatedTokens(data.tokens);
            if (preselectedTokenId) {
              const match = data.tokens.find((t: GraduatedToken) => t.tokenId === preselectedTokenId);
              setSelectedToken(match || data.tokens[0]);
            } else {
              setSelectedToken(data.tokens[0]);
            }
          }
        }
      } catch {
        // Backend not available
      } finally {
        setLoadingTokens(false);
      }
    };
    fetchGraduated();
  }, [preselectedTokenId]);

  // Fetch pool state when token is selected
  useEffect(() => {
    if (!curveAddr) return;
    getPoolState().then(setPoolState);
    const interval = setInterval(() => {
      getPoolState().then(setPoolState);
    }, 15000);
    return () => clearInterval(interval);
  }, [curveAddr, getPoolState]);

  // Fetch BTC balance
  useEffect(() => {
    if (!walletAddress) return;
    provider.getBalance(walletAddress).then(setBtcBalance).catch(() => {});
  }, [walletAddress, provider]);

  // Fetch token balance
  useEffect(() => {
    if (!walletAddress || !tokenAddr) return;
    getBalance().then(setTokenBalance);
  }, [walletAddress, tokenAddr, getBalance]);

  // Fetch pending BTC withdrawal
  useEffect(() => {
    if (!walletAddress || !curveAddr) return;
    getPendingWithdrawal().then(setPendingBtc);
    const interval = setInterval(() => {
      getPendingWithdrawal().then(setPendingBtc);
    }, 15000);
    return () => clearInterval(interval);
  }, [walletAddress, curveAddr, getPendingWithdrawal]);

  // Estimate output
  useEffect(() => {
    if (!inputAmount || !poolState || parseFloat(inputAmount) <= 0) {
      setEstimatedOutput('');
      return;
    }

    try {
      const btcReserve = poolState.poolBtcReserve;
      const tokenReserve = poolState.poolTokenReserve;

      if (btcReserve === 0n || tokenReserve === 0n) {
        setEstimatedOutput('0');
        return;
      }

      if (direction === 'btcToToken') {
        const btcAmount = BigInt(Math.floor(parseFloat(inputAmount) * 1e8));
        const amountWithFee = btcAmount * 997n;
        const numerator = tokenReserve * amountWithFee;
        const denominator = btcReserve * 1000n + amountWithFee;
        const tokensOut = numerator / denominator;
        const formatted = Number(tokensOut) / 1e18;
        setEstimatedOutput(formatted > 0 ? formatted.toFixed(4) : '0');
      } else {
        const tokenAmount = BigInt(Math.floor(parseFloat(inputAmount) * 1e18));
        const amountWithFee = tokenAmount * 997n;
        const numerator = btcReserve * amountWithFee;
        const denominator = tokenReserve * 1000n + amountWithFee;
        const btcOut = numerator / denominator;
        const formatted = Number(btcOut) / 1e8;
        setEstimatedOutput(formatted > 0 ? formatted.toFixed(8) : '0');
      }
    } catch {
      setEstimatedOutput('');
    }
  }, [inputAmount, direction, poolState]);

  const handleSwap = async () => {
    if (!selectedToken || !inputAmount || parseFloat(inputAmount) <= 0 || !walletAddress) return;

    setTxResult(null);
    setError(null);

    try {
      if (direction === 'btcToToken') {
        const btcAmount = BigInt(Math.floor(parseFloat(inputAmount) * 1e8));
        await swapBtcForTokens(btcAmount);
        setTxResult('Swap BTC → Token sent successfully!');
      } else {
        const tokenAmount = BigInt(Math.floor(parseFloat(inputAmount) * 1e18));
        await swapTokensForBtc(tokenAmount);
        setTxResult('Swap Token → BTC sent successfully!');
      }
      // Report trade to backend for history tracking
      reportTrade({
        tokenAddress: tokenAddr,
        curveAddress: curveAddr,
        tradeType: direction === 'btcToToken' ? 'swap_btc_for_tokens' : 'swap_tokens_for_btc',
        btcAmount: direction === 'btcToToken'
          ? BigInt(Math.floor(parseFloat(inputAmount) * 1e8)).toString()
          : '0',
        tokenAmount: direction === 'tokenToBtc'
          ? BigInt(Math.floor(parseFloat(inputAmount) * 1e18)).toString()
          : '0',
        traderAddress: walletAddress,
      });

      setInputAmount('');
      setEstimatedOutput('');
      // Refresh pool state, balances, and pending BTC
      setTimeout(() => {
        getPoolState().then(setPoolState);
        getBalance().then(setTokenBalance);
        getPendingWithdrawal().then(setPendingBtc);
        provider.getBalance(walletAddress).then(setBtcBalance).catch(() => {});
      }, 5000);
    } catch (err: any) {
      setError(err.message || 'Swap failed');
    }
  };

  const handleClaimBtc = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    try {
      const result = await claimBtc();
      if (result) {
        setPendingBtc(0n);
        setTxResult('BTC claimed successfully!');
        setTimeout(() => {
          provider.getBalance(walletAddress).then(setBtcBalance).catch(() => {});
        }, 5000);
      }
    } catch {
      setError('Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  const flipDirection = () => {
    setDirection(d => d === 'btcToToken' ? 'tokenToBtc' : 'btcToToken');
    setInputAmount('');
    setEstimatedOutput('');
  };

  const formatBtcReserve = (sats: bigint) => {
    const val = Number(sats) / 1e8;
    return val.toFixed(8) + ' BTC';
  };

  const formatTokenReserve = (raw: bigint) => {
    const val = Number(raw) / 1e18;
    if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
    return val.toFixed(2);
  };

  if (loadingTokens) {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.swapCard}>
          <h2 style={styles.title}>Swap</h2>
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>
            <h3 style={styles.emptyTitle}>Loading...</h3>
            <p style={styles.emptyDesc}>Checking for graduated tokens...</p>
          </div>
        </div>
      </div>
    );
  }

  if (graduatedTokens.length === 0) {
    return (
      <div style={styles.pageContainer}>
        <div style={styles.swapCard}>
          <h2 style={styles.title}>Swap</h2>
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg></div>
            <h3 style={styles.emptyTitle}>No Graduated Tokens</h3>
            <p style={styles.emptyDesc}>
              Swap is available for tokens that have graduated from their bonding curves.
              When a token collects 0.3 BTC, it graduates and its liquidity moves to an AMM pool.
            </p>
            <Link to="/launch" style={styles.emptyLink}>
              Browse Tokens on Launchpad &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pageContainer}>
      <div style={styles.swapCard}>
        <div style={styles.glow} />

        <div style={styles.header}>
          <h2 style={styles.title}>Swap</h2>
          <span style={styles.ammBadge}>AMM Pool</span>
        </div>

        {/* Token Selector */}
        <div style={styles.tokenPicker}>
          <select
            value={selectedToken?.tokenId || ''}
            onChange={(e) => {
              const t = graduatedTokens.find((tok) => tok.tokenId === e.target.value);
              if (t) setSelectedToken(t);
            }}
            style={styles.tokenSelect}
          >
            {graduatedTokens.map((t) => (
              <option key={t.tokenId} value={t.tokenId}>
                {t.name} ({t.symbol})
              </option>
            ))}
          </select>
        </div>

        {/* Balances */}
        {walletAddress && (
          <div style={styles.balancesWrap}>
            <div style={styles.balanceRow}>
              <span style={styles.balanceLabel}>BTC Balance</span>
              <span style={styles.balanceValue}>{(Number(btcBalance) / 1e8).toFixed(6)} BTC</span>
            </div>
            <div style={styles.balanceRow}>
              <span style={styles.balanceLabel}>{selectedToken?.symbol || 'Token'} Balance</span>
              <span style={styles.balanceValue}>{(Number(tokenBalance) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedToken?.symbol || ''}</span>
            </div>
          </div>
        )}

        {/* Pool Info */}
        {poolState && (
          <div style={styles.poolInfo}>
            <div style={styles.poolInfoItem}>
              <span style={styles.poolLabel}>BTC Reserve</span>
              <span style={styles.poolValue}>{formatBtcReserve(poolState.poolBtcReserve)}</span>
            </div>
            <div style={styles.poolInfoItem}>
              <span style={styles.poolLabel}>Token Reserve</span>
              <span style={styles.poolValue}>{formatTokenReserve(poolState.poolTokenReserve)}</span>
            </div>
            <div style={styles.poolInfoItem}>
              <span style={styles.poolLabel}>Total Swaps</span>
              <span style={styles.poolValue}>{poolState.totalSwaps.toString()}</span>
            </div>
          </div>
        )}

        {tradeStatus.active ? (
          /* Trade progress stepper */
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
                  ? 'Swap Successful!'
                  : tradeStatus.error
                    ? 'Swap Failed'
                    : 'Swapping...'}
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
                  ...styles.swapBtn,
                  ...(tradeStatus.success ? {} : { background: 'linear-gradient(135deg, #5a5a78, #3a3a58)' }),
                  marginTop: '12px',
                }}
              >
                {tradeStatus.success ? 'Done' : 'Back to Swap'}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Swap Input */}
            <div style={styles.swapSection}>
              <div style={styles.inputBox}>
                <div style={styles.inputHeader}>
                  <span style={styles.inputLabel}>You Pay</span>
                  <span style={styles.inputCurrency}>
                    {direction === 'btcToToken' ? 'BTC' : selectedToken?.symbol || 'TOKEN'}
                  </span>
                </div>
                <input
                  type="number"
                  placeholder="0.0"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  style={styles.amountInput}
                  min="0"
                  step="any"
                />
                {/* Quick percentages */}
                <div style={styles.quickAmounts}>
                  {['25%', '50%', '75%', 'Max'].map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        const pct = v === 'Max' ? 1 : parseInt(v) / 100;
                        if (direction === 'btcToToken') {
                          const amt = Number(btcBalance) / 1e8 * pct;
                          setInputAmount(amt > 0 ? amt.toFixed(6) : '0');
                        } else {
                          const amt = Number(tokenBalance) / 1e18 * pct;
                          setInputAmount(amt > 0 ? amt.toFixed(4) : '0');
                        }
                      }}
                      style={styles.quickBtn}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Flip Button */}
              <button onClick={flipDirection} style={styles.flipBtn}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              </button>

              <div style={styles.inputBox}>
                <div style={styles.inputHeader}>
                  <span style={styles.inputLabel}>You Receive (est.)</span>
                  <span style={styles.inputCurrency}>
                    {direction === 'btcToToken' ? selectedToken?.symbol || 'TOKEN' : 'BTC'}
                  </span>
                </div>
                <div style={styles.outputValue}>
                  {estimatedOutput || '0.0'}
                </div>
              </div>
            </div>

            {/* Fee Info */}
            <div style={styles.feeInfo}>
              <span>Fee: 0.3%</span>
              <span>Slippage: Auto</span>
            </div>

            {/* Swap Button */}
            <button
              onClick={handleSwap}
              disabled={swapping || !inputAmount || parseFloat(inputAmount) <= 0 || !walletAddress}
              style={{
                ...styles.swapBtn,
                ...(swapping || !inputAmount || parseFloat(inputAmount) <= 0 || !walletAddress ? styles.swapBtnDisabled : {}),
              }}
            >
              {!walletAddress ? 'Connect Wallet' : swapping ? 'Swapping...' : 'Swap'}
            </button>

            {/* Result / Error */}
            {txResult && (
              <div style={styles.successMsg}>{txResult}</div>
            )}
            {error && (
              <div style={styles.errorMsg}>{error}</div>
            )}
          </>
        )}

        {/* Pending BTC Claim */}
        {walletAddress && pendingBtc > 0n && (
          <div style={styles.pendingWrap}>
            <div style={styles.pendingHeader}>
              <span style={styles.pendingLabel}>Pending BTC Withdrawal</span>
              <span style={styles.pendingAmount}>{(Number(pendingBtc) / 1e8).toFixed(6)} BTC</span>
            </div>
            <button
              onClick={handleClaimBtc}
              disabled={claiming}
              style={{
                ...styles.claimBtn,
                ...(claiming ? styles.swapBtnDisabled : {}),
              }}
            >
              {claiming ? 'Claiming...' : 'Claim BTC'}
            </button>
          </div>
        )}

        <p style={styles.note}>
          Graduated tokens are traded via an on-chain constant product AMM (x*y=k).
        </p>

        {/* Trade History */}
        {tokenAddr && (
          <div style={styles.historySection}>
            <div style={styles.historyHeader}>Trade History</div>
            <TradeHistoryTable
              trades={trades}
              loading={historyLoading}
              tokenSymbol={selectedToken?.symbol || 'TOKEN'}
              onLoadMore={() => fetchTrades(50, trades.length)}
              hasMore={trades.length < historyTotal}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '24px',
  },
  swapCard: {
    width: '100%',
    maxWidth: '480px',
    background: 'rgba(15, 15, 35, 0.6)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '24px',
    padding: '24px',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute' as const,
    top: '-60px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '300px',
    height: '200px',
    background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    position: 'relative' as const,
  },
  title: { fontSize: '22px', fontWeight: '800', color: '#f0f0ff', margin: 0 },
  ammBadge: {
    background: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981',
    padding: '4px 10px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: '600',
    border: '1px solid rgba(16, 185, 129, 0.15)',
  },
  tokenPicker: { marginBottom: '16px' },
  tokenSelect: {
    width: '100%',
    background: 'rgba(5, 5, 16, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '11px 14px',
    color: '#f0f0ff',
    fontSize: '14px',
    fontWeight: '600',
    outline: 'none',
  },
  poolInfo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
    marginBottom: '16px',
    background: 'rgba(5, 5, 16, 0.3)',
    borderRadius: '12px',
    padding: '14px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  poolInfoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  poolLabel: { fontSize: '10px', color: '#5a5a78', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  poolValue: { fontSize: '13px', fontWeight: '700', color: '#f0f0ff', fontFamily: 'var(--font-mono)' },
  swapSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    marginBottom: '12px',
    position: 'relative' as const,
  },
  inputBox: {
    background: 'rgba(5, 5, 16, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '16px',
    padding: '16px',
  },
  inputHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  inputLabel: { fontSize: '12px', color: '#5a5a78' },
  inputCurrency: { fontSize: '12px', fontWeight: '700', color: '#f97316' },
  amountInput: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: '#f0f0ff',
    fontSize: '24px',
    fontWeight: '700',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
  },
  outputValue: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#f0f0ff',
    fontFamily: 'var(--font-mono)',
    opacity: 0.7,
  },
  flipBtn: {
    alignSelf: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(249, 115, 22, 0.1)',
    border: '1px solid rgba(249, 115, 22, 0.2)',
    color: '#f97316',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '-8px auto',
    zIndex: 2,
    position: 'relative' as const,
  },
  feeInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#5a5a78',
    marginBottom: '16px',
    padding: '0 4px',
  },
  swapBtn: {
    width: '100%',
    padding: '16px',
    borderRadius: '14px',
    border: 'none',
    background: 'linear-gradient(135deg, #f97316, #ea580c)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 0 20px rgba(249, 115, 22, 0.15)',
  },
  swapBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  successMsg: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    color: '#10b981',
    fontSize: '13px',
    fontWeight: '600',
    textAlign: 'center' as const,
  },
  errorMsg: {
    marginTop: '12px',
    padding: '12px',
    borderRadius: '10px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  note: {
    textAlign: 'center' as const,
    fontSize: '11px',
    color: '#5a5a78',
    marginTop: '16px',
    marginBottom: 0,
  },
  emptyState: { textAlign: 'center' as const, padding: '40px 16px' },
  emptyIcon: { fontSize: '48px', marginBottom: '16px', opacity: 0.4 },
  emptyTitle: { fontSize: '20px', fontWeight: '800', marginBottom: '12px', color: '#f0f0ff' },
  emptyDesc: { fontSize: '14px', color: '#9898b8', lineHeight: 1.7, marginBottom: '16px' },
  emptyLink: { display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#f97316', fontSize: '14px', fontWeight: '600', textDecoration: 'none' },

  // Balances
  balancesWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginBottom: '12px',
    background: 'rgba(5, 5, 16, 0.3)',
    borderRadius: '12px',
    padding: '12px 14px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
  },
  balanceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: '12px',
    color: '#5a5a78',
  },
  balanceValue: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#f0f0ff',
    fontFamily: 'var(--font-mono)',
  },

  // Quick percentage buttons
  quickAmounts: {
    display: 'flex',
    gap: '6px',
    marginTop: '8px',
  },
  quickBtn: {
    flex: 1,
    padding: '5px 0',
    borderRadius: '8px',
    border: '1px solid rgba(249, 115, 22, 0.15)',
    background: 'rgba(249, 115, 22, 0.06)',
    color: '#f97316',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
  },

  // Trade progress stepper
  tradeProgress: {
    padding: '16px 0',
  },
  tradeProgressHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  tradeProgressSpinner: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(249, 115, 22, 0.1)',
    border: '2px solid rgba(249, 115, 22, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tradeProgressTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#f0f0ff',
    margin: 0,
  },
  tradeSteps: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  tradeStepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  tradeStepCircle: {
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: 'rgba(90, 90, 120, 0.2)',
    border: '2px solid rgba(90, 90, 120, 0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#5a5a78',
    flexShrink: 0,
  },
  tradeStepDone: {
    background: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10b981',
    color: '#10b981',
  },
  tradeStepActive: {
    background: 'rgba(249, 115, 22, 0.15)',
    borderColor: '#f97316',
    color: '#f97316',
  },
  tradeStepError: {
    background: 'rgba(244, 63, 94, 0.15)',
    borderColor: '#f43f5e',
    color: '#f43f5e',
  },
  tradeStepLabel: {
    fontSize: '13px',
    color: '#5a5a78',
  },
  tradeStepBadge: {
    marginLeft: 'auto',
    fontSize: '10px',
    fontWeight: '600',
    color: '#f97316',
    background: 'rgba(249, 115, 22, 0.1)',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  tradeProgressError: {
    marginTop: '12px',
    padding: '10px 12px',
    borderRadius: '10px',
    background: 'rgba(244, 63, 94, 0.1)',
    border: '1px solid rgba(244, 63, 94, 0.2)',
    color: '#f43f5e',
    fontSize: '12px',
    wordBreak: 'break-word' as const,
  },

  // Pending BTC Claim
  pendingWrap: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '14px',
    background: 'rgba(16, 185, 129, 0.06)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
  },
  pendingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  pendingLabel: {
    fontSize: '12px',
    color: '#10b981',
    fontWeight: '600',
  },
  pendingAmount: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#10b981',
    fontFamily: 'var(--font-mono)',
  },
  claimBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(16, 185, 129, 0.15)',
  },

  // Trade History
  historySection: {
    marginTop: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    paddingTop: '16px',
  },
  historyHeader: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#f0f0ff',
    marginBottom: '12px',
  },
};
