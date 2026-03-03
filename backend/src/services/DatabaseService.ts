import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
    private db!: Database.Database;

    init(): void {
        const dbPath = path.join(__dirname, '../../data/oplaunch.db');
        this.db = new Database(dbPath);

        // Enable WAL mode for better concurrent read performance
        this.db.pragma('journal_mode = WAL');

        this.createTables();
        console.log('[DatabaseService] SQLite initialized at', dbPath);
    }

    private createTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_address TEXT NOT NULL,
                curve_address TEXT NOT NULL,
                trade_type TEXT NOT NULL,
                btc_amount TEXT NOT NULL,
                token_amount TEXT NOT NULL,
                trader_address TEXT NOT NULL,
                tx_hash TEXT,
                created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
            );

            CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_address, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_trades_curve ON trades(curve_address, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_trades_trader ON trades(trader_address, created_at DESC);

            CREATE TABLE IF NOT EXISTS holders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_address TEXT NOT NULL,
                holder_address TEXT NOT NULL,
                balance TEXT NOT NULL DEFAULT '0',
                first_buy_at INTEGER NOT NULL,
                last_trade_at INTEGER NOT NULL,
                total_btc_spent TEXT NOT NULL DEFAULT '0',
                total_btc_received TEXT NOT NULL DEFAULT '0',
                trade_count INTEGER NOT NULL DEFAULT 0,
                UNIQUE(token_address, holder_address)
            );

            CREATE INDEX IF NOT EXISTS idx_holders_token ON holders(token_address);
        `);
    }

    getDb(): Database.Database {
        return this.db;
    }

    close(): void {
        if (this.db) this.db.close();
    }
}

export const databaseService = new DatabaseService();
