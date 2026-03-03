# CLAUDE.md -- OpLaunch: DeFi Platform on Bitcoin L1

## Project Description
OpLaunch is a full-stack DeFi platform on Bitcoin Layer 1 built with OP_NET. It combines a token launchpad (bonding curve), a DEX swap interface, and a staking dashboard. Users create OP20 tokens that trade on a bonding curve, graduate to a DEX when they reach a target market cap, and can stake tokens to earn rewards.

## Project Structure
```
/oplaunch/
  contracts/       -- Smart contracts (AssemblyScript -> WASM)
    src/
      bonding-curve/    BondingCurve.ts -- Bonding curve pricing + graduation + AMM
      token/            OpLaunchToken.ts -- OP20 token with owner minting
      staking-vault/    StakingVault.ts -- Stake tokens, earn rewards
      token-factory/    TokenFactory.ts -- On-chain token factory
    deploy.ts           -- Deployment script (reads MNEMONIC from backend/.env)
  frontend/        -- React + Vite + TypeScript
    src/
      pages/           Home, Launch, Create, TokenDetail, Swap, Staking
      components/      TradeHistoryTable, HolderList, Header, Footer, Layout
      hooks/           useBondingCurve, useStaking, useTradeHistory, useOP20
      context/         ProviderContext (JSON-RPC provider)
      config/          abis.ts (contract ABIs)
  backend/         -- hyper-express API server
    src/
      routes/          tokens, curves, staking, prices, uploads, escrow, trades
      services/        DeployService, ChainService, DatabaseService, EscrowService, TradeService, CacheService
    data/              tokens.json (token registry), oplaunch.db (SQLite)
    uploads/           User-uploaded token images
  shared/          -- Shared types, constants, ABIs
    types.ts, constants.ts, abis.ts
```

## Deployment
- **Live:** https://oplaunch.cc
- **Server:** Ubuntu 22.04, Nginx reverse proxy, systemd service
- **Backend:** /opt/oplaunch/backend/ (port 3001)
- **Frontend:** /opt/oplaunch/frontend/dist/ (Nginx static)
- **Deploy command:** `sshpass -p '<password>' ssh root@31.42.127.132`

## Package Rules
### ALWAYS Use
- @btc-vision/bitcoin -- Bitcoin library (OP_NET fork)
- @btc-vision/transaction -- Transaction construction and ABI types
- opnet -- OP_NET SDK, provider, contract interaction
- @btc-vision/btc-runtime -- Smart contract runtime (contracts only, "rc" tag)
- @btc-vision/walletconnect -- Wallet connection (frontend)
- hyper-express -- Backend framework
- react, vite -- Frontend framework

### NEVER Use
- bitcoinjs-lib, ecpair, ethers, web3 -- wrong libraries
- express, fastify, koa -- wrong backend framework
- MetaMask, window.ethereum -- wrong wallet

### Package Versions
- All @btc-vision/* packages: use "rc" tag
- opnet: use "rc" tag

## Smart Contract Rules
- Constructor runs on EVERY interaction -- use onDeployment() for init
- SafeMath for ALL u256 arithmetic -- no raw +, -, *, /
- No while loops -- bounded for loops only
- Every storage pointer: unique value via Blockchain.nextPointer
- Owner-only: Revert.ifNotOwner(this, msg.sender)
- No floating-point (f32, f64)

## Frontend Rules
- OPWallet ONLY via @btc-vision/walletconnect
- JSONRpcProvider for reads (https://testnet.opnet.org)
- Signer pattern: `signer: null, mldsaSigner: null` (wallet extension signs)
- VITE_BACKEND_URL: use `?? ''` (NOT `|| 'http://localhost:3001'`) for production compatibility
- useRef for polling functions to avoid stale closures in useCallback
- Dark theme, responsive, TypeScript only

## Backend Rules
- hyper-express ONLY
- JSONRpcProvider from opnet for chain data
- CORS enabled (Access-Control-Allow-Origin: *)
- DeployService deploys contracts via MNEMONIC from .env
- ChainService persists tokens to data/tokens.json
- DatabaseService uses better-sqlite3 for trades/holders
- Keys in .env, .env in .gitignore

## Key Patterns
- Address.fromString() needs hex public key, NOT bech32 P2OP address
- provider.getPublicKeyInfo() unreliable for contract addresses -- store contractPubKey at deploy time
- Polling timeouts: 20 minutes (80 x 15s) for BTC block confirmation (~10-15 min)
- Contract WASM path: backend/dist/services/ -> ../../contracts/build/*.wasm

## Build & Run
```bash
# Contracts
cd contracts && npm install && npm run build

# Backend
cd backend && npm install && npm run build && npm start

# Frontend (dev)
cd frontend && npm install && npm run dev

# Frontend (prod)
VITE_BACKEND_URL="" npm run build
```

## Network
- OP_NET Testnet: https://testnet.opnet.org
- Explorer: https://opscan.org/
- Bech32 HRP: opt
- OP_NET is Bitcoin L1 
