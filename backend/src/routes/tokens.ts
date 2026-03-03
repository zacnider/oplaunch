import HyperExpress from 'hyper-express';
import { chainService, type TokenInfo } from '../services/ChainService.js';
import { deployService } from '../services/DeployService.js';

export function tokenRoutes(app: HyperExpress.Server) {
  // Get deployer info (address + fee + balance + status)
  app.get('/api/deploy-info', async (req, res) => {
    try {
      const address = deployService.getDeployerAddress();
      const fee = deployService.getDeployFee();
      const balance = await deployService.getBalance();
      const busy = deployService.isDeploying();
      res.json({
        deployerAddress: address,
        deployFee: fee,
        deployerBalance: balance.toString(),
        isDeploying: busy,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get deploy info' });
    }
  });

  // Start deploying a new real OP_20 token + BondingCurve (async - returns immediately)
  app.post('/api/tokens/deploy', async (req, res) => {
    let body: {
      name: string;
      symbol: string;
      description?: string;
      imageUrl?: string;
      creator?: string;
    };
    try {
      body = await req.json();
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { name, symbol, description, imageUrl, creator } = body;
    if (!name || !symbol) {
      return res.status(400).json({ error: 'name and symbol are required' });
    }

    // Store creator for later registration
    (deployService as any)._pendingCreator = creator || deployService.getDeployerAddress();
    (deployService as any)._pendingMeta = { name, symbol, description: description || '', imageUrl: imageUrl || '' };

    const result = deployService.startDeploy({
      name,
      symbol,
      description: description || '',
      imageUrl: imageUrl || '',
    });

    if (!result.started) {
      return res.status(409).json({ error: result.error });
    }

    res.json({ success: true, message: 'Deployment started. Poll GET /api/deploy-status for progress.' });
  });

  // Poll deployment status
  app.get('/api/deploy-status', async (req, res) => {
    const status = deployService.getStatus();

    // If deployment just completed, register the token
    if (status.status === 'complete' && status.tokenAddress && status.curveAddress) {
      const existing = await chainService.getToken(status.tokenAddress);
      if (!existing) {
        const meta = (deployService as any)._pendingMeta || {};
        const tokenInfo: TokenInfo = {
          tokenId: status.tokenAddress,
          curveAddress: status.curveAddress,
          name: meta.name || 'Unknown',
          symbol: meta.symbol || '???',
          totalSupply: '1000000000',
          decimals: 18,
          description: meta.description || '',
          imageUrl: meta.imageUrl || '',
          creator: (deployService as any)._pendingCreator || deployService.getDeployerAddress(),
          createdAt: Date.now(),
          status: 'active',
          progressPercent: 0,
        };
        chainService.addToken(tokenInfo);
      }
    }

    res.json(status);
  });

  // Register a token manually (legacy endpoint)
  app.post('/api/tokens/register', async (req, res) => {
    let body: {
      tokenId: string;
      curveAddress?: string;
      name: string;
      symbol: string;
      description?: string;
      imageUrl?: string;
      creator?: string;
    };
    try {
      body = await req.json();
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const { tokenId, name, symbol, description, imageUrl, creator, curveAddress } = body;
    if (!tokenId || !name || !symbol) {
      return res.status(400).json({ error: 'tokenId, name, and symbol are required' });
    }

    const tokenInfo: TokenInfo = {
      tokenId,
      curveAddress: curveAddress || '',
      name,
      symbol,
      totalSupply: '1000000000',
      decimals: 18,
      description: description || '',
      imageUrl: imageUrl || '',
      creator: creator || '',
      createdAt: Date.now(),
      status: 'active',
      progressPercent: 0,
    };

    chainService.addToken(tokenInfo);
    res.json({ success: true, token: tokenInfo });
  });

  // List all tokens
  app.get('/api/tokens', async (req, res) => {
    try {
      const status = req.query_parameters.status;
      const search = req.query_parameters.search;
      const limit = parseInt(req.query_parameters.limit || '20');
      const offset = parseInt(req.query_parameters.offset || '0');

      const result = await chainService.getTokens({ status, search, limit, offset });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tokens' });
    }
  });

  // Get single token by tokenId (contract address)
  app.get('/api/tokens/:tokenId', async (req, res) => {
    try {
      const token = await chainService.getToken(req.path_parameters.tokenId);
      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch token' });
    }
  });

  // Trending tokens
  app.get('/api/tokens-trending', async (req, res) => {
    try {
      const tokens = await chainService.getTrendingTokens();
      res.json({ tokens });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch trending tokens' });
    }
  });

  // Graduated tokens
  app.get('/api/tokens-graduated', async (req, res) => {
    try {
      const tokens = await chainService.getGraduatedTokens();
      res.json({ tokens });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch graduated tokens' });
    }
  });

  // Graduate a token and deploy its StakingVault
  app.post('/api/tokens/:tokenId/graduate', async (req, res) => {
    try {
      const { tokenId } = req.path_parameters;
      const token = await chainService.getToken(tokenId);
      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }

      // Skip if already graduated with vault
      if (token.status === 'graduated' && token.vaultAddress) {
        return res.json({ success: true, message: 'Already graduated', vaultAddress: token.vaultAddress });
      }

      const success = chainService.graduateToken(tokenId);
      if (!success) {
        return res.status(500).json({ error: 'Failed to update token status' });
      }

      // Deploy vault in background
      res.json({ success: true, message: `Token ${tokenId} graduated. Vault deployment starting...` });

      deployService.deployVault(tokenId).then((result) => {
        if (result) {
          chainService.updateTokenVault(tokenId, result.vaultAddress, result.contractPubKey);
          console.log(`[Graduation] Vault deployed for ${tokenId}: ${result.vaultAddress} (pubkey: ${result.contractPubKey})`);
        } else {
          console.error(`[Graduation] Vault deployment failed for ${tokenId}`);
        }
      }).catch((err) => {
        console.error(`[Graduation] Vault deployment error for ${tokenId}:`, err);
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to graduate token' });
    }
  });
}
