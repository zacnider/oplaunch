import HyperExpress from 'hyper-express';
import { escrowService } from '../services/EscrowService.js';

export function escrowRoutes(app: HyperExpress.Server) {
    // Get pending withdrawal amount for a user
    // :userAddress can be bech32 (opt1...) or hex public key
    app.get('/api/escrow/pending/:curveAddress/:userAddress', async (req, res) => {
        try {
            const { curveAddress, userAddress } = req.path_parameters;
            const pending = await escrowService.getPendingWithdrawal(curveAddress, userAddress);
            res.json({
                curveAddress,
                pendingBtc: pending.toString(),
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to get pending withdrawal' });
        }
    });

    // Debug: test all address resolution methods
    app.get('/api/escrow/debug/:curveAddress/:bech32/:hex', async (req, res) => {
        try {
            const { curveAddress, bech32, hex } = req.path_parameters;
            const result = await escrowService.debugPending(curveAddress, bech32, hex);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Process a BTC withdrawal
    app.post('/api/escrow/withdraw', async (req, res) => {
        try {
            const body = await req.json();
            const { curveAddress, userBech32, userPubKeyHex } = body;

            if (!curveAddress || !userBech32 || !userPubKeyHex) {
                res.status(400).json({ error: 'Missing curveAddress, userBech32, or userPubKeyHex' });
                return;
            }

            const result = await escrowService.processWithdrawal(curveAddress, userBech32, userPubKeyHex);
            if (result.success) {
                res.json(result);
            } else {
                res.status(400).json(result);
            }
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Withdrawal failed' });
        }
    });
}
