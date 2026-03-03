import { cache } from './CacheService.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface TokenInfo {
  tokenId: string;          // Token contract address (P2OP)
  curveAddress: string;     // BondingCurve contract address
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  description: string;
  imageUrl: string;
  creator: string;
  createdAt: number;
  status: 'deploying' | 'active' | 'graduated';
  progressPercent?: number;
  vaultAddress?: string;    // StakingVault address (set after graduation deploy)
  vaultPubKey?: string;     // StakingVault hex public key (for Address.fromString)
}

// Persistent JSON file path
const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_PATH = resolve(__dirname, '../../data/tokens.json');

function loadStore(): TokenInfo[] {
  try {
    if (existsSync(STORE_PATH)) {
      const raw = readFileSync(STORE_PATH, 'utf-8');
      const tokens = JSON.parse(raw) as TokenInfo[];
      // Filter out old invalid entries (no curveAddress or numeric tokenId)
      return tokens.filter(
        (t) => t.curveAddress && t.tokenId && t.tokenId.startsWith('opt1'),
      );
    }
  } catch {
    // Corrupted file, start fresh
  }
  return [];
}

function saveStore(tokens: TokenInfo[]): void {
  try {
    const dir = dirname(STORE_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STORE_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
  } catch (err) {
    console.error('[ChainService] Failed to save tokens:', err);
  }
}

// Load from disk on startup
const tokensStore: TokenInfo[] = loadStore();

export class ChainService {
  addToken(token: TokenInfo): void {
    const existing = tokensStore.find((t) => t.tokenId === token.tokenId);
    if (!existing) {
      tokensStore.push(token);
      cache.clear();
      saveStore(tokensStore);
    }
  }

  updateTokenStatus(tokenId: string, status: 'deploying' | 'active' | 'graduated'): boolean {
    const token = tokensStore.find((t) => t.tokenId === tokenId);
    if (!token) return false;
    token.status = status;
    if (status === 'graduated') token.progressPercent = 100;
    cache.clear();
    saveStore(tokensStore);
    return true;
  }

  async getTokens(filters?: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tokens: TokenInfo[]; total: number }> {
    const cacheKey = `tokens:${JSON.stringify(filters)}`;
    const cached = cache.get<{ tokens: TokenInfo[]; total: number }>(cacheKey);
    if (cached) return cached;

    let result = [...tokensStore];

    if (filters?.status) {
      result = result.filter((t) => t.status === filters.status);
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.symbol.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => b.createdAt - a.createdAt);

    const total = result.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 20;
    result = result.slice(offset, offset + limit);

    const response = { tokens: result, total };
    cache.set(cacheKey, response, 15);
    return response;
  }

  async getToken(tokenId: string): Promise<TokenInfo | null> {
    const cacheKey = `token:${tokenId}`;
    const cached = cache.get<TokenInfo>(cacheKey);
    if (cached) return cached;

    const token = tokensStore.find((t) => t.tokenId === tokenId) || null;
    if (token) cache.set(cacheKey, token, 30);
    return token;
  }

  async getTrendingTokens(): Promise<TokenInfo[]> {
    return tokensStore
      .filter((t) => t.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getGraduatedTokens(): Promise<TokenInfo[]> {
    return tokensStore.filter((t) => t.status === 'graduated');
  }

  graduateToken(tokenId: string): boolean {
    return this.updateTokenStatus(tokenId, 'graduated');
  }

  updateTokenVault(tokenId: string, vaultAddress: string, vaultPubKey?: string): boolean {
    const token = tokensStore.find((t) => t.tokenId === tokenId);
    if (!token) return false;
    token.vaultAddress = vaultAddress;
    if (vaultPubKey) token.vaultPubKey = vaultPubKey;
    cache.clear();
    saveStore(tokensStore);
    return true;
  }
}

export const chainService = new ChainService();
