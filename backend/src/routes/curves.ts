import HyperExpress from 'hyper-express';
import { tradeService } from '../services/TradeService.js';

export function curveRoutes(app: HyperExpress.Server) {
  // Get bonding curve state - reads from chain via frontend hooks
  app.get('/api/curves/:address/state', async (req, res) => {
    try {
      res.json({
        address: req.path_parameters.address,
        message: 'Use frontend hooks to read curve state directly from chain',
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch curve state' });
    }
  });

  // Get recent transactions for a curve
  app.get('/api/curves/:address/transactions', async (req, res) => {
    try {
      const limit = parseInt(req.query_parameters.limit || '50');
      const offset = parseInt(req.query_parameters.offset || '0');
      const result = tradeService.getTradesByCurve(req.path_parameters.address, { limit, offset });
      res.json({ transactions: result.trades, total: result.total });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });
}
