import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? '';

const FIXED_SUPPLY = '1000000000';
const FIXED_SUPPLY_DISPLAY = '1,000,000,000';
const GRADUATION_TARGET_DISPLAY = '0.3 BTC';

const STEP_LABELS: Record<number, string> = {
  1: 'Deploying BondingCurve...',
  2: 'Deploying OP_20 Token...',
  3: 'Linking token to curve...',
};

type Step = 'form' | 'deploying';

interface DeployStatusResponse {
  step: number;
  totalSteps: number;
  stepLabel: string;
  status: 'broadcasting' | 'waiting_confirmation' | 'confirmed' | 'complete' | 'failed' | 'idle';
  tokenAddress: string;
  curveAddress: string;
  error?: string;
  elapsedSec: number;
}

export default function CreateTokenPage() {
  const navigate = useNavigate();
  const { walletAddress } = useWalletConnect();
  const [step, setStep] = useState<Step>('form');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<DeployStatusResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoMode, setLogoMode] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    totalSupply: FIXED_SUPPLY,
    description: '',
    imageUrl: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Poll deploy status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/deploy-status`);
      const data: DeployStatusResponse = await res.json();
      setDeployStatus(data);

      if (data.status === 'complete' && data.tokenAddress) {
        // Stop polling, navigate to token page
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setTimeout(() => navigate(`/token/${data.tokenAddress}`), 1500);
      } else if (data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setDeployError(data.error || 'Deployment failed');
      }
    } catch {
      // ignore fetch errors, keep polling
    }
  }, [navigate]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, SVG, GIF)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be under 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setLogoPreview(dataUrl);

      setIsUploading(true);
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: dataUrl }),
        });
        const json = await res.json();
        if (res.ok && json.url) {
          updateField('imageUrl', json.url);
        } else {
          updateField('imageUrl', dataUrl);
        }
      } catch {
        updateField('imageUrl', dataUrl);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const removeLogo = () => {
    setLogoPreview(null);
    updateField('imageUrl', '');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Start deployment (async - returns immediately, then we poll)
  const handleDeploy = async () => {
    if (!form.name || !form.symbol || !walletAddress) return;

    setStep('deploying');
    setDeployError(null);
    setDeployStatus(null);

    try {
      const res = await fetch(`${BACKEND_URL}/api/tokens/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          imageUrl: form.imageUrl,
          creator: walletAddress,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setDeployError(data.error || 'Failed to start deployment');
        setStep('form');
        return;
      }

      // Start polling for status every 5 seconds
      pollRef.current = setInterval(pollStatus, 5000);
      // Also do an immediate first poll
      pollStatus();
    } catch (error) {
      console.error('Deploy request failed:', error);
      setDeployError(error instanceof Error ? error.message : 'Failed to start deployment');
      setStep('form');
    }
  };

  const currentStep = deployStatus?.step || 0;
  const statusText = deployStatus?.stepLabel || 'Starting deployment...';
  const elapsed = deployStatus?.elapsedSec || 0;
  const elapsedStr = elapsed > 60
    ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
    : `${elapsed}s`;

  return (
    <div style={styles.container}>
      <div style={styles.formSection}>
        <span style={styles.pageTag}>CREATE</span>
        <h1 style={styles.title}>Create Your Token</h1>
        <p style={styles.subtitle}>
          Launch a token with a bonding curve. Early buyers get the best price.
        </p>

        {step === 'form' && (
          <>
            {/* Token Name */}
            <div style={styles.field}>
              <label style={styles.label}>Token Name</label>
              <input
                type="text"
                placeholder="e.g. Bitcoin Cat"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                style={styles.input}
              />
            </div>

            {/* Token Symbol */}
            <div style={styles.field}>
              <label style={styles.label}>Token Symbol</label>
              <input
                type="text"
                placeholder="e.g. BCAT"
                value={form.symbol}
                onChange={(e) => updateField('symbol', e.target.value.toUpperCase().slice(0, 6))}
                style={styles.input}
                maxLength={6}
              />
            </div>

            {/* Description */}
            <div style={styles.field}>
              <label style={styles.label}>Description</label>
              <textarea
                placeholder="What's your token about?"
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                style={styles.textarea}
                rows={3}
              />
            </div>

            {/* Logo Upload */}
            <div style={styles.field}>
              <label style={styles.label}>Token Logo (optional)</label>

              <div style={styles.logoToggle}>
                <button
                  onClick={() => setLogoMode('upload')}
                  style={{
                    ...styles.logoToggleBtn,
                    ...(logoMode === 'upload' ? styles.logoToggleBtnActive : {}),
                  }}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setLogoMode('url')}
                  style={{
                    ...styles.logoToggleBtn,
                    ...(logoMode === 'url' ? styles.logoToggleBtnActive : {}),
                  }}
                >
                  Paste URL
                </button>
              </div>

              {logoMode === 'upload' ? (
                <div>
                  {!logoPreview ? (
                    <div
                      style={styles.dropZone}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleLogoDrop}
                    >
                      <span style={styles.dropIcon}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></span>
                      <span style={styles.dropText}>Click to upload or drag & drop</span>
                      <span style={styles.dropHint}>PNG, JPG, SVG, GIF (max 2MB)</span>
                    </div>
                  ) : (
                    <div style={styles.logoPreviewContainer}>
                      <img src={logoPreview} alt="Token logo preview" style={styles.logoPreviewImg} />
                      {isUploading && <span style={styles.uploadStatus}>Uploading...</span>}
                      <button onClick={removeLogo} style={styles.removeLogoBtn}>Remove</button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="https://example.com/logo.png"
                    value={form.imageUrl.startsWith('data:') ? '' : form.imageUrl}
                    onChange={(e) => {
                      updateField('imageUrl', e.target.value);
                      setLogoPreview(e.target.value || null);
                    }}
                    style={styles.input}
                  />
                  {form.imageUrl && !form.imageUrl.startsWith('data:') && (
                    <div style={styles.urlPreview}>
                      <img
                        src={form.imageUrl}
                        alt="Logo preview"
                        style={styles.urlPreviewImg}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Token Info Note */}
            <div style={styles.infoNote}>
              <div style={styles.infoRow}>
                <span style={styles.infoDot} />
                <span>Supply: <strong style={{ color: '#f0f0ff' }}>{FIXED_SUPPLY_DISPLAY}</strong> tokens</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoDot} />
                <span>Graduation: <strong style={{ color: '#f0f0ff' }}>{GRADUATION_TARGET_DISPLAY}</strong> market cap to DEX</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoDot} />
                <span>Deployment is <strong style={{ color: '#10b981' }}>free</strong> during testnet</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.infoDot} />
                <span>Deployment takes <strong style={{ color: '#f0f0ff' }}>5-15 minutes</strong> (3 block confirmations)</span>
              </div>
            </div>

            {deployError && <div style={styles.errorBox}>{deployError}</div>}

            <button
              onClick={handleDeploy}
              disabled={!form.name || !form.symbol || !walletAddress}
              style={{
                ...styles.deployBtn,
                opacity: !form.name || !form.symbol || !walletAddress ? 0.5 : 1,
              }}
            >
              {!walletAddress ? 'Connect Wallet to Deploy' : 'Deploy Token'}
            </button>
          </>
        )}

        {step === 'deploying' && (
          <div style={styles.deployingSection}>
            <div style={styles.spinner} />
            <h3 style={styles.deployingTitle}>Deploying Your Token</h3>
            <p style={styles.deployingStatus}>{statusText}</p>
            <p style={styles.elapsedTime}>Elapsed: {elapsedStr}</p>

            <div style={styles.deployingSteps}>
              {[1, 2, 3].map((s) => {
                const isActive = currentStep === s;
                const isDone = currentStep > s || (currentStep === s && deployStatus?.status === 'confirmed');
                const isWaiting = isActive && deployStatus?.status === 'waiting_confirmation';
                return (
                  <div key={s} style={{
                    ...styles.deployStep,
                    opacity: currentStep >= s ? 1 : 0.4,
                  }}>
                    <span style={{
                      ...styles.stepNum,
                      background: isDone ? 'rgba(16, 185, 129, 0.15)' : isActive ? 'rgba(249, 115, 22, 0.15)' : 'rgba(255,255,255,0.03)',
                      borderColor: isDone ? 'rgba(16, 185, 129, 0.3)' : isActive ? 'rgba(249, 115, 22, 0.3)' : 'rgba(255,255,255,0.08)',
                      color: isDone ? '#10b981' : isActive ? '#f97316' : '#5a5a78',
                    }}>
                      {isDone ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : s}
                    </span>
                    <div>
                      <span style={{ color: isActive ? '#f0f0ff' : '#9898b8' }}>
                        {STEP_LABELS[s]}
                      </span>
                      {isWaiting && (
                        <span style={styles.waitingBadge}>Waiting for block...</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {deployStatus?.status === 'complete' && (
              <div style={styles.successBox}>
                Deployment complete! Redirecting...
              </div>
            )}

            {deployError && (
              <>
                <div style={styles.errorBox}>{deployError}</div>
                <button
                  onClick={() => { setStep('form'); setDeployError(null); setDeployStatus(null); }}
                  style={styles.backBtn}
                >
                  &larr; Back to form
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Preview */}
      <div style={styles.previewSection}>
        <h3 style={styles.previewTitle}>Preview</h3>
        <div style={styles.previewCard}>
          <div style={styles.previewGlow} />
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" style={styles.previewLogoImg} />
          ) : (
            <div style={styles.previewIcon}>
              {form.symbol ? form.symbol.slice(0, 2) : '??'}
            </div>
          )}
          <h4 style={styles.previewName}>{form.name || 'Your Token'}</h4>
          <span style={styles.previewSymbol}>
            ${form.symbol || 'SYMBOL'}
          </span>
          <div style={styles.previewInfo}>
            <div style={styles.previewRow}>
              <span style={{ color: '#5a5a78' }}>Supply</span>
              <span style={{ color: '#f0f0ff', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{Number(form.totalSupply || 0).toLocaleString()}</span>
            </div>
            <div style={styles.previewRow}>
              <span style={{ color: '#5a5a78' }}>Graduation</span>
              <span style={{ color: '#f97316', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{GRADUATION_TARGET_DISPLAY}</span>
            </div>
          </div>
          {form.description && (
            <p style={styles.previewDesc}>{form.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'grid', gridTemplateColumns: '1fr 380px', gap: '40px', alignItems: 'start' },
  formSection: {},
  pageTag: { display: 'inline-block', fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', color: '#f97316', marginBottom: '8px' },
  title: { fontSize: '36px', fontWeight: '800', marginBottom: '8px', letterSpacing: '-1px', color: '#f0f0ff' },
  subtitle: { color: '#9898b8', fontSize: '16px', marginBottom: '36px' },
  field: { marginBottom: '24px' },
  label: { display: 'block', fontSize: '14px', fontWeight: '600', color: '#f0f0ff', marginBottom: '8px' },
  input: { width: '100%', background: 'rgba(15, 15, 35, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '13px 16px', color: '#f0f0ff', fontSize: '14px', outline: 'none', backdropFilter: 'blur(8px)', transition: 'border-color 0.2s, box-shadow 0.2s' },
  textarea: { width: '100%', background: 'rgba(15, 15, 35, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '12px', padding: '13px 16px', color: '#f0f0ff', fontSize: '14px', outline: 'none', resize: 'vertical' as const, backdropFilter: 'blur(8px)', transition: 'border-color 0.2s, box-shadow 0.2s' },
  deployBtn: { width: '100%', background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#ffffff', border: 'none', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s', marginTop: '8px', boxShadow: '0 0 30px rgba(249, 115, 22, 0.15)' },
  errorBox: { background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '12px', padding: '12px 16px', marginBottom: '12px', color: '#f43f5e', fontSize: '13px' },
  successBox: { background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '12px 16px', marginTop: '16px', color: '#10b981', fontSize: '14px', fontWeight: '600', textAlign: 'center' as const },

  // Deploying step
  deployingSection: { textAlign: 'center' as const, padding: '40px 0' },
  spinner: { width: '48px', height: '48px', border: '3px solid rgba(249, 115, 22, 0.15)', borderTopColor: '#f97316', borderRadius: '50%', margin: '0 auto 24px', animation: 'spin 1s linear infinite' },
  deployingTitle: { fontSize: '22px', fontWeight: '700', color: '#f0f0ff', marginBottom: '8px' },
  deployingStatus: { color: '#f97316', fontSize: '14px', marginBottom: '4px', fontFamily: 'var(--font-mono)' },
  elapsedTime: { color: '#5a5a78', fontSize: '13px', marginBottom: '32px', fontFamily: 'var(--font-mono)' },
  deployingSteps: { display: 'flex', flexDirection: 'column' as const, gap: '16px', textAlign: 'left' as const, maxWidth: '400px', margin: '0 auto' },
  deployStep: { display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', transition: 'opacity 0.3s' },
  stepNum: { width: '28px', height: '28px', borderRadius: '50%', border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0, transition: 'all 0.3s' },
  waitingBadge: { display: 'block', fontSize: '11px', color: '#f97316', fontFamily: 'var(--font-mono)', marginTop: '2px' },
  backBtn: { background: 'transparent', border: 'none', color: '#5a5a78', fontSize: '14px', cursor: 'pointer', padding: '8px 0', marginTop: '8px' },

  // Preview
  previewSection: { position: 'sticky' as const, top: '96px' },
  previewTitle: { fontSize: '13px', fontWeight: '600', marginBottom: '16px', color: '#5a5a78', textTransform: 'uppercase' as const, letterSpacing: '1px' },
  previewCard: { background: 'rgba(15, 15, 35, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '20px', padding: '32px', textAlign: 'center' as const, position: 'relative' as const, overflow: 'hidden' },
  previewGlow: { position: 'absolute' as const, top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '150px', background: 'radial-gradient(ellipse, rgba(249, 115, 22, 0.1) 0%, transparent 70%)', pointerEvents: 'none' },
  previewIcon: { width: '72px', height: '72px', borderRadius: '18px', background: 'linear-gradient(135deg, #f97316, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '22px', color: '#ffffff', margin: '0 auto 20px', position: 'relative' as const, boxShadow: '0 0 30px rgba(249, 115, 22, 0.2)' },
  previewLogoImg: { width: '72px', height: '72px', borderRadius: '18px', objectFit: 'cover' as const, margin: '0 auto 20px', display: 'block', position: 'relative' as const, boxShadow: '0 0 30px rgba(249, 115, 22, 0.2)' },
  previewName: { fontSize: '22px', fontWeight: '800', marginBottom: '4px', color: '#f0f0ff', position: 'relative' as const },
  previewSymbol: { fontSize: '14px', color: '#5a5a78', display: 'block', marginBottom: '24px', position: 'relative' as const },
  previewInfo: { borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '16px', position: 'relative' as const },
  previewRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '14px' },
  previewDesc: { marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '13px', color: '#5a5a78', textAlign: 'left' as const, lineHeight: 1.6, position: 'relative' as const },

  logoToggle: { display: 'flex', gap: '2px', marginBottom: '12px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '4px' },
  logoToggleBtn: { flex: 1, background: 'transparent', border: 'none', padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', color: '#5a5a78', cursor: 'pointer', transition: 'all 0.2s' },
  logoToggleBtnActive: { background: 'rgba(249, 115, 22, 0.1)', color: '#f97316' },
  dropZone: { border: '2px dashed rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '32px 16px', textAlign: 'center' as const, cursor: 'pointer', transition: 'border-color 0.2s', background: 'rgba(15, 15, 35, 0.3)' },
  dropIcon: { display: 'block', fontSize: '32px', marginBottom: '8px', opacity: 0.5 },
  dropText: { display: 'block', fontSize: '14px', color: '#9898b8', marginBottom: '4px' },
  dropHint: { display: 'block', fontSize: '12px', color: '#5a5a78' },
  logoPreviewContainer: { display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(15, 15, 35, 0.5)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' },
  logoPreviewImg: { width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' as const },
  uploadStatus: { fontSize: '12px', color: '#f97316', fontWeight: '500' },
  removeLogoBtn: { marginLeft: 'auto', background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.15)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' },
  urlPreview: { marginTop: '8px', textAlign: 'center' as const },
  urlPreviewImg: { width: '56px', height: '56px', borderRadius: '12px', objectFit: 'cover' as const },
  infoNote: { background: 'rgba(249, 115, 22, 0.04)', border: '1px solid rgba(249, 115, 22, 0.1)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', flexDirection: 'column' as const, gap: '8px', fontSize: '13px', color: '#9898b8' },
  infoRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  infoDot: { width: '5px', height: '5px', borderRadius: '50%', background: '#f97316', flexShrink: 0 },
};
