import { databaseService } from './DatabaseService.js';

export interface TradeInput {
    tokenAddress: string;
    curveAddress: string;
    tradeType: 'buy' | 'sell' | 'swap_btc_for_tokens' | 'swap_tokens_for_btc';
    btcAmount: string;
    tokenAmount: string;
    traderAddress: string;
    txHash?: string;
}

export interface TradeRow {
    id: number;
    token_address: string;
    curve_address: string;
    trade_type: string;
    btc_amount: string;
    token_amount: string;
    trader_address: string;
    tx_hash: string | null;
    created_at: number;
}

export interface HolderRow {
    token_address: string;
    holder_address: string;
    balance: string;
    first_buy_at: number;
    last_trade_at: number;
    total_btc_spent: string;
    total_btc_received: string;
    trade_count: number;
}

class TradeService {
    recordTrade(trade: TradeInput): { id: number } {
        const db = databaseService.getDb();
        const now = Date.now();

        // Duplicate prevention: same trader+token+type within 60s
        const recent = db.prepare(`
            SELECT id FROM trades
            WHERE trader_address = ? AND token_address = ? AND trade_type = ?
            AND created_at > ?
            LIMIT 1
        `).get(trade.traderAddress, trade.tokenAddress, trade.tradeType, now - 60000) as any;

        if (recent) {
            return { id: recent.id };
        }

        const result = db.prepare(`
            INSERT INTO trades (token_address, curve_address, trade_type, btc_amount, token_amount, trader_address, tx_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            trade.tokenAddress,
            trade.curveAddress,
            trade.tradeType,
            trade.btcAmount,
            trade.tokenAmount,
            trade.traderAddress,
            trade.txHash || null,
            now,
        );

        this.updateHolder(
            trade.tokenAddress,
            trade.traderAddress,
            trade.tradeType,
            trade.btcAmount,
            trade.tokenAmount,
            now,
        );

        return { id: Number(result.lastInsertRowid) };
    }

    private updateHolder(
        tokenAddress: string,
        holderAddress: string,
        tradeType: string,
        btcAmount: string,
        tokenAmount: string,
        now: number,
    ): void {
        const db = databaseService.getDb();
        const existing = db.prepare(
            `SELECT * FROM holders WHERE token_address = ? AND holder_address = ?`,
        ).get(tokenAddress, holderAddress) as HolderRow | undefined;

        const isBuy = tradeType === 'buy' || tradeType === 'swap_btc_for_tokens';

        if (existing) {
            const prevBalance = BigInt(existing.balance);
            const prevBtcSpent = BigInt(existing.total_btc_spent);
            const prevBtcReceived = BigInt(existing.total_btc_received);

            let newBalance: bigint;
            let newBtcSpent: bigint;
            let newBtcReceived: bigint;

            if (isBuy) {
                newBalance = prevBalance + BigInt(tokenAmount);
                newBtcSpent = prevBtcSpent + BigInt(btcAmount);
                newBtcReceived = prevBtcReceived;
            } else {
                const sellAmount = BigInt(tokenAmount);
                newBalance = prevBalance > sellAmount ? prevBalance - sellAmount : 0n;
                newBtcSpent = prevBtcSpent;
                newBtcReceived = prevBtcReceived + BigInt(btcAmount);
            }

            db.prepare(`
                UPDATE holders
                SET balance = ?, last_trade_at = ?, total_btc_spent = ?, total_btc_received = ?, trade_count = trade_count + 1
                WHERE token_address = ? AND holder_address = ?
            `).run(
                newBalance.toString(),
                now,
                newBtcSpent.toString(),
                newBtcReceived.toString(),
                tokenAddress,
                holderAddress,
            );
        } else {
            const balance = isBuy ? tokenAmount : '0';
            const btcSpent = isBuy ? btcAmount : '0';
            const btcReceived = isBuy ? '0' : btcAmount;

            db.prepare(`
                INSERT INTO holders (token_address, holder_address, balance, first_buy_at, last_trade_at, total_btc_spent, total_btc_received, trade_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `).run(tokenAddress, holderAddress, balance, now, now, btcSpent, btcReceived);
        }
    }

    getTradesByToken(
        tokenAddress: string,
        opts: { limit?: number; offset?: number } = {},
    ): { trades: TradeRow[]; total: number } {
        const db = databaseService.getDb();
        const limit = opts.limit || 20;
        const offset = opts.offset || 0;

        const total = (db.prepare(
            `SELECT COUNT(*) as count FROM trades WHERE token_address = ?`,
        ).get(tokenAddress) as any).count;

        const trades = db.prepare(
            `SELECT * FROM trades WHERE token_address = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        ).all(tokenAddress, limit, offset) as TradeRow[];

        return { trades, total };
    }

    getTradesByCurve(
        curveAddress: string,
        opts: { limit?: number; offset?: number } = {},
    ): { trades: TradeRow[]; total: number } {
        const db = databaseService.getDb();
        const limit = opts.limit || 20;
        const offset = opts.offset || 0;

        const total = (db.prepare(
            `SELECT COUNT(*) as count FROM trades WHERE curve_address = ?`,
        ).get(curveAddress) as any).count;

        const trades = db.prepare(
            `SELECT * FROM trades WHERE curve_address = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        ).all(curveAddress, limit, offset) as TradeRow[];

        return { trades, total };
    }

    getTradesByTrader(
        traderAddress: string,
        opts: { limit?: number; offset?: number } = {},
    ): { trades: TradeRow[]; total: number } {
        const db = databaseService.getDb();
        const limit = opts.limit || 20;
        const offset = opts.offset || 0;

        const total = (db.prepare(
            `SELECT COUNT(*) as count FROM trades WHERE trader_address = ?`,
        ).get(traderAddress) as any).count;

        const trades = db.prepare(
            `SELECT * FROM trades WHERE trader_address = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        ).all(traderAddress, limit, offset) as TradeRow[];

        return { trades, total };
    }

    getHoldersByToken(
        tokenAddress: string,
        opts: { limit?: number; offset?: number } = {},
    ): { holders: HolderRow[]; total: number } {
        const db = databaseService.getDb();
        const limit = opts.limit || 20;
        const offset = opts.offset || 0;

        const total = (db.prepare(
            `SELECT COUNT(*) as count FROM holders WHERE token_address = ? AND balance != '0'`,
        ).get(tokenAddress) as any).count;

        // Sort by balance descending (cast to integer for numeric sort)
        const holders = db.prepare(`
            SELECT * FROM holders
            WHERE token_address = ? AND balance != '0'
            ORDER BY CAST(balance AS INTEGER) DESC
            LIMIT ? OFFSET ?
        `).all(tokenAddress, limit, offset) as HolderRow[];

        return { holders, total };
    }

    getTokenStats(tokenAddress: string): {
        totalTrades: number;
        totalBtcVolume: string;
        holderCount: number;
    } {
        const db = databaseService.getDb();

        const tradeStats = db.prepare(`
            SELECT COUNT(*) as total_trades, COALESCE(SUM(CAST(btc_amount AS INTEGER)), 0) as total_volume
            FROM trades WHERE token_address = ?
        `).get(tokenAddress) as any;

        const holderCount = (db.prepare(
            `SELECT COUNT(*) as count FROM holders WHERE token_address = ? AND balance != '0'`,
        ).get(tokenAddress) as any).count;

        return {
            totalTrades: tradeStats.total_trades,
            totalBtcVolume: String(tradeStats.total_volume),
            holderCount,
        };
    }
}

export const tradeService = new TradeService();
