import HyperExpress from 'hyper-express';
import { chainService } from '../services/ChainService.js';
import { deployService } from '../services/DeployService.js';

export function stakingRoutes(app: HyperExpress.Server) {
  // List staking pools (one pool per graduated token with a deployed vault)
  app.get('/api/staking/pools', async (req, res) => {
    try {
      const graduated = await chainService.getGraduatedTokens();
      const pools = graduated.map((t: any) => ({
        vaultAddress: t.vaultAddress || '',
        vaultPubKey: t.vaultPubKey || '',
        stakingTokenAddress: t.tokenId,
        rewardTokenAddress: t.tokenId,
        tokenName: t.name,
        tokenSymbol: t.symbol,
        curveAddress: t.curveAddress,
        imageUrl: t.imageUrl || '',
        status: t.vaultAddress ? 'active' : 'deploying',
      }));
      res.json({ pools });
    } catch (error) {
      console.error('[staking] GET pools error:', error);
      res.status(500).json({ error: 'Failed to fetch staking pools' });
    }
  });

  // Get single pool by vault address
  app.get('/api/staking/pools/:address', async (req, res) => {
    try {
      const vaultAddr = req.path_parameters.address;
      const graduated = await chainService.getGraduatedTokens();
      const token = graduated.find((t: any) => t.vaultAddress === vaultAddr);
      if (token) {
        return res.json({
          vaultAddress: (token as any).vaultAddress,
          vaultPubKey: (token as any).vaultPubKey || '',
          stakingTokenAddress: token.tokenId,
          rewardTokenAddress: token.tokenId,
          tokenName: token.name,
          tokenSymbol: token.symbol,
          curveAddress: token.curveAddress,
          imageUrl: (token as any).imageUrl || '',
          status: 'active',
        });
      }
      return res.status(404).json({ error: 'Pool not found' });
    } catch (error) {
      console.error('[staking] GET pool error:', error);
      res.status(500).json({ error: 'Failed to fetch pool' });
    }
  });

  // Resolve missing vault public keys via RPC
  app.post('/api/staking/resolve-pubkeys', async (req, res) => {
    try {
      const graduated = await chainService.getGraduatedTokens();
      const missing = graduated.filter((t: any) => t.vaultAddress && !t.vaultPubKey);
      let resolved = 0;
      for (const token of missing) {
        const pubKey = await deployService.resolveVaultPubKey(token.vaultAddress!);
        if (pubKey) {
          chainService.updateTokenVault(token.tokenId, token.vaultAddress!, pubKey);
          resolved++;
        }
      }
      res.json({ total: missing.length, resolved });
    } catch (error) {
      console.error('[staking] POST resolve-pubkeys error:', error);
      res.status(500).json({ error: 'Failed to resolve vault pubkeys' });
    }
  });

  // Redeploy vault for a graduated token (replaces old broken vault)
  app.post('/api/staking/redeploy-vault/:tokenId', async (req, res) => {
    try {
      const token = await chainService.getToken(req.path_parameters.tokenId);
      if (!token) {
        return res.status(404).json({ error: 'Token not found' });
      }
      if (token.status !== 'graduated') {
        return res.status(400).json({ error: 'Token not graduated' });
      }
      if (deployService.isDeploying()) {
        return res.status(409).json({ error: 'Another deployment in progress' });
      }

      console.log(`[staking] Redeploying vault for ${token.name} (${token.tokenId})`);
      const result = await deployService.deployVault(token.tokenId);
      if (result) {
        chainService.updateTokenVault(token.tokenId, result.vaultAddress, result.contractPubKey);
        return res.json({
          success: true,
          vaultAddress: result.vaultAddress,
          vaultPubKey: result.contractPubKey,
        });
      }
      return res.status(500).json({ error: 'Vault deployment failed' });
    } catch (error) {
      console.error('[staking] POST redeploy-vault error:', error);
      res.status(500).json({ error: 'Failed to redeploy vault' });
    }
  });

  // Platform-wide staking stats
  app.get('/api/staking/stats', async (req, res) => {
    try {
      const graduated = await chainService.getGraduatedTokens();
      const activePools = graduated.filter((t: any) => t.vaultAddress);
      res.json({
        totalPools: activePools.length,
        totalGraduated: graduated.length,
      });
    } catch (error) {
      console.error('[staking] GET stats error:', error);
      res.status(500).json({ error: 'Failed to fetch staking stats' });
    }
  });
}
