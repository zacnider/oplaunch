import HyperExpress from 'hyper-express';

export function priceRoutes(app: HyperExpress.Server) {
  // Price history for a token - will be populated from chain events
  app.get('/api/prices/:address/history', async (req, res) => {
    try {
      const interval = req.query_parameters.interval || '1h';
      res.json({
        tokenAddress: req.path_parameters.address,
        interval,
        data: [],
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch price history' });
    }
  });

  // Current price for a token - read from bonding curve on chain
  app.get('/api/prices/:address/current', async (req, res) => {
    try {
      res.json({
        tokenAddress: req.path_parameters.address,
        price: '0',
        updatedAt: Date.now(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch current price' });
    }
  });
}
