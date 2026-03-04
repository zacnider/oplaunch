import HyperExpress from 'hyper-express';
import dotenv from 'dotenv';
import { tokenRoutes } from './routes/tokens.js';
import { curveRoutes } from './routes/curves.js';
import { stakingRoutes } from './routes/staking.js';
import { priceRoutes } from './routes/prices.js';
import { uploadRoutes } from './routes/uploads.js';
import { escrowRoutes } from './routes/escrow.js';
import { registerTradeRoutes } from './routes/trades.js';
import { deployService } from './services/DeployService.js';
import { escrowService } from './services/EscrowService.js';
import { databaseService } from './services/DatabaseService.js';
import { chainService } from './services/ChainService.js';

dotenv.config();

const app = new HyperExpress.Server({
  max_body_length: 10 * 1024 * 1024, // 10MB — base64 images can be large
});
const PORT = parseInt(process.env.PORT || '3001');

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).send('');
  }
  next();
});

// Initialize database
databaseService.init();

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    network: process.env.NETWORK || 'testnet',
    uptime: process.uptime(),
  });
});

// Routes
tokenRoutes(app);
curveRoutes(app);
stakingRoutes(app);
priceRoutes(app);
uploadRoutes(app);
escrowRoutes(app);
registerTradeRoutes(app);

// Initialize deploy service and escrow service
deployService.init().then(async (ok) => {
  if (ok) {
    console.log('DeployService initialized with deployer wallet');
    // Resolve missing vault public keys for graduated tokens
    const graduated = await chainService.getGraduatedTokens();
    const missing = graduated.filter((t) => t.vaultAddress && !t.vaultPubKey);
    if (missing.length > 0) {
      console.log(`[Startup] Resolving ${missing.length} missing vault public key(s)...`);
      for (const token of missing) {
        const pubKey = await deployService.resolveVaultPubKey(token.vaultAddress!);
        if (pubKey) {
          chainService.updateTokenVault(token.tokenId, token.vaultAddress!, pubKey);
          console.log(`[Startup] Resolved vault pubkey for ${token.symbol}: ${pubKey.slice(0, 16)}...`);
        } else {
          console.warn(`[Startup] Could not resolve vault pubkey for ${token.symbol} (${token.vaultAddress})`);
        }
      }
    }
  } else {
    console.warn('DeployService not initialized (MNEMONIC missing). Token deployment disabled.');
  }
});

escrowService.init().then((ok) => {
  if (ok) {
    console.log('EscrowService initialized with escrow wallet');
  } else {
    console.warn('EscrowService not initialized (MNEMONIC missing). Escrow withdrawals disabled.');
  }
});

app.listen(PORT).then(() => {
  console.log(`OpLaunch API running on http://localhost:${PORT}`);
  console.log(`Network: ${process.env.NETWORK || 'testnet'}`);
});
