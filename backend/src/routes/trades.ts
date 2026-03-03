import HyperExpress from 'hyper-express';
import { tradeService } from '../services/TradeService.js';

export function registerTradeRoutes(app: HyperExpress.Server) {
    // Record a new trade
    app.post('/api/trades', async (req, res) => {
        try {
            const body = await req.json();
            const { tokenAddress, curveAddress, tradeType, btcAmount, tokenAmount, traderAddress, txHash } = body;

            if (!tokenAddress || !curveAddress || !tradeType || !btcAmount || !tokenAmount || !traderAddress) {
                res.status(400).json({ error: 'Missing required fields' });
                return;
            }

            const validTypes = ['buy', 'sell', 'swap_btc_for_tokens', 'swap_tokens_for_btc'];
            if (!validTypes.includes(tradeType)) {
                res.status(400).json({ error: 'Invalid trade type' });
                return;
            }

            const result = tradeService.recordTrade({
                tokenAddress, curveAddress, tradeType, btcAmount, tokenAmount, traderAddress, txHash,
            });

            res.json({ success: true, tradeId: result.id });
        } catch (error) {
            console.error('[trades] POST /api/trades error:', error);
            res.status(500).json({ error: 'Failed to record trade' });
        }
    });

    // Get trades for a token
    app.get('/api/trades/token/:tokenAddress', async (req, res) => {
        try {
            const { tokenAddress } = req.path_parameters;
            const limit = parseInt(req.query_parameters.limit || '20');
            const offset = parseInt(req.query_parameters.offset || '0');
            const result = tradeService.getTradesByToken(tokenAddress, { limit, offset });
            res.json(result);
        } catch (error) {
            console.error('[trades] GET token trades error:', error);
            res.status(500).json({ error: 'Failed to fetch trades' });
        }
    });

    // Get trades for a curve
    app.get('/api/trades/curve/:curveAddress', async (req, res) => {
        try {
            const { curveAddress } = req.path_parameters;
            const limit = parseInt(req.query_parameters.limit || '20');
            const offset = parseInt(req.query_parameters.offset || '0');
            const result = tradeService.getTradesByCurve(curveAddress, { limit, offset });
            res.json(result);
        } catch (error) {
            console.error('[trades] GET curve trades error:', error);
            res.status(500).json({ error: 'Failed to fetch trades' });
        }
    });

    // Get trades for a trader
    app.get('/api/trades/trader/:traderAddress', async (req, res) => {
        try {
            const { traderAddress } = req.path_parameters;
            const limit = parseInt(req.query_parameters.limit || '20');
            const offset = parseInt(req.query_parameters.offset || '0');
            const result = tradeService.getTradesByTrader(traderAddress, { limit, offset });
            res.json(result);
        } catch (error) {
            console.error('[trades] GET trader trades error:', error);
            res.status(500).json({ error: 'Failed to fetch trades' });
        }
    });

    // Get holder list for a token
    app.get('/api/holders/:tokenAddress', async (req, res) => {
        try {
            const { tokenAddress } = req.path_parameters;
            const limit = parseInt(req.query_parameters.limit || '20');
            const offset = parseInt(req.query_parameters.offset || '0');
            const result = tradeService.getHoldersByToken(tokenAddress, { limit, offset });
            res.json(result);
        } catch (error) {
            console.error('[trades] GET holders error:', error);
            res.status(500).json({ error: 'Failed to fetch holders' });
        }
    });

    // Get token stats
    app.get('/api/trades/token/:tokenAddress/stats', async (req, res) => {
        try {
            const { tokenAddress } = req.path_parameters;
            const result = tradeService.getTokenStats(tokenAddress);
            res.json(result);
        } catch (error) {
            console.error('[trades] GET token stats error:', error);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });
}
