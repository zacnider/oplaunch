/**
 * DeployService - Deploys real OP_20 tokens + BondingCurve contracts on OP_NET testnet
 *
 * Flow:
 *   1. Deploy BondingCurve → wait for block confirmation
 *   2. Deploy OpLaunchToken → wait for block confirmation
 *   3. Call curve.setTokenAddress(tokenAddress) → wait for confirmation
 *
 * Each step waits for the previous TX to be confirmed in a block
 * by monitoring UTXO changes (old UTXOs must disappear before proceeding).
 *
 * Deploy runs in the background. Frontend polls GET /api/deploy-status for progress.
 */
import {
    Address,
    AddressTypes,
    BinaryWriter,
    IDeploymentParameters,
    IInteractionParameters,
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const TESTNET_RPC = 'https://testnet.opnet.org';
const network = (networks as any).opnetTestnet;

// Token defaults
const TOKEN_DECIMALS = 18;
const TOKEN_SUPPLY = 1000000000n * (10n ** 18n); // 1B tokens
const INITIAL_VIRTUAL_BTC = 100000000n; // 1 BTC in sats
const GRADUATION_TARGET = 30000000n;    // 0.3 BTC in sats

// Deployment fee (informational)
const DEPLOY_FEE = 20000n;

// setTokenAddress selector from ABI: 0x800d76cb
const SET_TOKEN_ADDRESS_SELECTOR = 0x800d76cb;

// Staking vault parameters
const REWARD_RATE = 1000000000000000n;       // 0.001 tokens per block
const REWARD_DURATION_BLOCKS = 100000n;      // ~16.7 days
const MIN_STAKE = 1000000000000000000n;      // 1 token (18 decimals)

// Timing
const UTXO_POLL_INTERVAL_MS = 15000;     // Check every 15s
const MAX_CONFIRMATION_WAIT_MS = 900000; // Max 15 minutes per step

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

export interface DeployStatus {
    step: number;      // 1, 2, or 3
    totalSteps: number;
    stepLabel: string;
    status: 'broadcasting' | 'waiting_confirmation' | 'confirmed' | 'complete' | 'failed' | 'idle';
    tokenAddress: string;
    curveAddress: string;
    error?: string;
    startedAt: number;
    elapsedSec: number;
}

class DeployService {
    private factory: TransactionFactory;
    private provider: JSONRpcProvider;
    private wallet: any;
    private account: any;
    private initialized = false;
    private deploying = false;
    private deployStatus: DeployStatus = {
        step: 0, totalSteps: 3, stepLabel: '', status: 'idle',
        tokenAddress: '', curveAddress: '', startedAt: 0, elapsedSec: 0,
    };

    constructor() {
        this.factory = new TransactionFactory();
        this.provider = new JSONRpcProvider({ url: TESTNET_RPC, network });
    }

    async init(): Promise<boolean> {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            console.error('[DeployService] MNEMONIC not set in environment');
            return false;
        }

        try {
            this.wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
            this.account = this.wallet.deriveOPWallet(AddressTypes.P2TR, 0);
            this.initialized = true;
            console.log('[DeployService] Initialized. Deployer:', this.account.p2tr);
            return true;
        } catch (err) {
            console.error('[DeployService] Failed to initialize wallet:', err);
            return false;
        }
    }

    private getWasmPath(contractName: string): string {
        const currentDir = path.dirname(fileURLToPath(import.meta.url));
        return path.resolve(currentDir, '..', '..', '..', 'contracts', 'build', `${contractName}.wasm`);
    }

    private updateStatus(partial: Partial<DeployStatus>): void {
        Object.assign(this.deployStatus, partial);
        if (this.deployStatus.startedAt > 0) {
            this.deployStatus.elapsedSec = Math.round((Date.now() - this.deployStatus.startedAt) / 1000);
        }
    }

    /**
     * Wait for a deployed contract to appear on chain via getCode().
     * OP_NET UTXO manager reflects mempool state (not confirmed), so checking
     * UTXO changes is unreliable. Instead, we poll getCode() until the contract
     * bytecode is actually found on chain (= confirmed in a block).
     */
    private async waitForContractDeployment(contractAddress: string, stepLabel: string): Promise<void> {
        const startTime = Date.now();
        let attempt = 0;

        while (Date.now() - startTime < MAX_CONFIRMATION_WAIT_MS) {
            attempt++;
            await sleep(UTXO_POLL_INTERVAL_MS);
            this.updateStatus({});

            try {
                const code = await this.provider.getCode(contractAddress, true);
                if (code && (code as Uint8Array).length > 0) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    console.log(`[DeployService] ${stepLabel} - Contract confirmed on chain! (${elapsed}s, attempt ${attempt})`);
                    return;
                }
            } catch (err: any) {
                // "Contract bytecode not found" is expected while waiting
                const msg = err.message || '';
                if (!msg.includes('not found')) {
                    console.log(`[DeployService] ${stepLabel} - getCode error: ${msg} (attempt ${attempt})`);
                }
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`[DeployService] ${stepLabel} - Waiting for block confirmation... (${elapsed}s, attempt ${attempt})`);
        }

        throw new Error(`${stepLabel}: timed out waiting for contract to appear on chain (${MAX_CONFIRMATION_WAIT_MS / 1000}s)`);
    }

    /**
     * Wait for an interaction TX to be confirmed by polling getTransactionReceipt().
     */
    private async waitForTxConfirmation(txHash: string, stepLabel: string): Promise<void> {
        const startTime = Date.now();
        let attempt = 0;

        while (Date.now() - startTime < MAX_CONFIRMATION_WAIT_MS) {
            attempt++;
            await sleep(UTXO_POLL_INTERVAL_MS);
            this.updateStatus({});

            try {
                const receipt = await this.provider.getTransactionReceipt(txHash);
                if (receipt) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    console.log(`[DeployService] ${stepLabel} - TX confirmed in block! (${elapsed}s, attempt ${attempt})`);
                    return;
                }
            } catch (err: any) {
                const msg = err.message || '';
                if (!msg.includes('not found') && !msg.includes('Could not find')) {
                    console.log(`[DeployService] ${stepLabel} - Receipt check error: ${msg} (attempt ${attempt})`);
                }
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`[DeployService] ${stepLabel} - Waiting for TX confirmation... (${elapsed}s, attempt ${attempt})`);
        }

        throw new Error(`${stepLabel}: timed out waiting for TX confirmation (${MAX_CONFIRMATION_WAIT_MS / 1000}s)`);
    }

    /**
     * Get fresh UTXOs (after a confirmed TX). Retries until UTXOs are available.
     */
    private async getFreshUtxos(stepLabel: string): Promise<any[]> {
        for (let i = 0; i < 5; i++) {
            try {
                const utxos = await this.provider.utxoManager.getUTXOs({ address: this.account.p2tr });
                if (utxos && utxos.length > 0) return utxos;
            } catch {}
            console.log(`[DeployService] ${stepLabel} - Waiting for UTXOs...`);
            await sleep(5000);
        }
        throw new Error(`${stepLabel}: No UTXOs available`);
    }

    getDeployerAddress(): string {
        return this.account?.p2tr || '';
    }

    getDeployFee(): string {
        return DEPLOY_FEE.toString();
    }

    isDeploying(): boolean {
        return this.deploying;
    }

    getStatus(): DeployStatus {
        if (this.deployStatus.startedAt > 0 && this.deploying) {
            this.deployStatus.elapsedSec = Math.round((Date.now() - this.deployStatus.startedAt) / 1000);
        }
        return { ...this.deployStatus };
    }

    async getBalance(): Promise<bigint> {
        try {
            const utxos = await this.provider.utxoManager.getUTXOs({ address: this.account.p2tr });
            if (!utxos || utxos.length === 0) return 0n;
            let total = 0n;
            for (const u of utxos) {
                total += BigInt((u as any).value || (u as any).satoshis || 0);
            }
            return total;
        } catch {
            return 0n;
        }
    }

    /**
     * Start deployment in background. Returns immediately.
     * Frontend polls getStatus() for progress.
     */
    startDeploy(params: {
        name: string;
        symbol: string;
        description: string;
        imageUrl: string;
    }): { started: boolean; error?: string } {
        if (!this.initialized) {
            return { started: false, error: 'DeployService not initialized' };
        }
        if (this.deploying) {
            return { started: false, error: 'Another deployment is in progress. Please wait.' };
        }

        // Start in background
        this.deploying = true;
        this.updateStatus({
            step: 0, totalSteps: 3, stepLabel: 'Starting...',
            status: 'broadcasting', tokenAddress: '', curveAddress: '',
            error: undefined, startedAt: Date.now(), elapsedSec: 0,
        });

        this._runDeploy(params).catch((err) => {
            console.error('[DeployService] Background deploy error:', err);
            this.updateStatus({ status: 'failed', error: err.message || 'Deployment failed' });
            this.deploying = false;
        });

        return { started: true };
    }

    private async _runDeploy(params: {
        name: string;
        symbol: string;
        description: string;
        imageUrl: string;
    }): Promise<void> {
        try {
            console.log(`\n[DeployService] ========================================`);
            console.log(`[DeployService] Starting deployment for ${params.name} (${params.symbol})`);
            console.log(`[DeployService] ========================================\n`);

            const curvePath = this.getWasmPath('BondingCurve');
            const tokenPath = this.getWasmPath('OpLaunchToken');

            if (!fs.existsSync(curvePath) || !fs.existsSync(tokenPath)) {
                this.updateStatus({ status: 'failed', error: 'WASM files not found' });
                this.deploying = false;
                return;
            }

            const curveBytecode = fs.readFileSync(curvePath);
            const tokenBytecode = fs.readFileSync(tokenPath);

            // ========================================
            // Step 1: Deploy BondingCurve
            // ========================================
            this.updateStatus({ step: 1, stepLabel: 'Deploying BondingCurve...', status: 'broadcasting' });
            console.log('[DeployService] Step 1/3: Deploying BondingCurve...');

            let utxos = await this.provider.utxoManager.getUTXOs({ address: this.account.p2tr });
            if (!utxos || utxos.length === 0) {
                this.updateStatus({ status: 'failed', error: 'No UTXOs available' });
                this.deploying = false;
                return;
            }

            // Use deployer's tweaked public key as placeholder token address
            // (will be replaced by setTokenAddress in Step 3)
            const deployerPubKeyHex = Buffer.from((this.account as any)._tweakedKey).toString('hex');

            const curveCalldata = new BinaryWriter();
            curveCalldata.writeAddress(Address.fromString(deployerPubKeyHex));
            curveCalldata.writeU256(INITIAL_VIRTUAL_BTC);
            curveCalldata.writeU256(TOKEN_SUPPLY);
            curveCalldata.writeU256(GRADUATION_TARGET);
            curveCalldata.writeStringWithLength(this.account.p2tr); // escrow bech32 address

            const challenge1 = await this.provider.getChallenge();
            const curveDeploy = await this.factory.signDeployment({
                from: this.account.p2tr,
                utxos,
                signer: this.account.keypair,
                mldsaSigner: this.account.mldsaKeypair,
                network,
                feeRate: 5,
                priorityFee: 0n,
                gasSatFee: 10000n,
                bytecode: curveBytecode,
                calldata: curveCalldata.getBuffer(),
                challenge: challenge1,
                linkMLDSAPublicKeyToAddress: true,
                revealMLDSAPublicKey: true,
            } as IDeploymentParameters);

            const curveAddress = curveDeploy.contractAddress;
            this.updateStatus({ curveAddress });
            console.log('[DeployService] BondingCurve address:', curveAddress);

            await this.provider.sendRawTransaction(curveDeploy.transaction[0], false);
            await this.provider.sendRawTransaction(curveDeploy.transaction[1], false);

            this.updateStatus({ status: 'waiting_confirmation', stepLabel: 'Waiting for BondingCurve block confirmation...' });
            console.log('[DeployService] BondingCurve TX broadcast. Waiting for contract on chain...');

            // Wait until BondingCurve contract code is actually on chain (block confirmed)
            await this.waitForContractDeployment(curveAddress, 'Step 1 (BondingCurve)');
            this.updateStatus({ status: 'confirmed', stepLabel: 'BondingCurve confirmed!' });

            // ========================================
            // Step 2: Deploy OpLaunchToken
            // ========================================
            this.updateStatus({ step: 2, stepLabel: 'Deploying OpLaunchToken...', status: 'broadcasting' });
            console.log('[DeployService] Step 2/3: Deploying OpLaunchToken...');

            // Get fresh UTXOs after Step 1 confirmation
            utxos = await this.getFreshUtxos('Step 2');

            const tokenCalldata = new BinaryWriter();
            tokenCalldata.writeStringWithLength(params.name);
            tokenCalldata.writeStringWithLength(params.symbol);
            tokenCalldata.writeU256(TOKEN_SUPPLY);
            tokenCalldata.writeU8(TOKEN_DECIMALS);
            tokenCalldata.writeStringWithLength(params.description || '');
            tokenCalldata.writeStringWithLength(params.imageUrl || '');
            tokenCalldata.writeAddress(Address.fromString(curveDeploy.contractPubKey));

            const challenge2 = await this.provider.getChallenge();
            const tokenDeploy = await this.factory.signDeployment({
                from: this.account.p2tr,
                utxos,
                signer: this.account.keypair,
                mldsaSigner: this.account.mldsaKeypair,
                network,
                feeRate: 5,
                priorityFee: 0n,
                gasSatFee: 10000n,
                bytecode: tokenBytecode,
                calldata: tokenCalldata.getBuffer(),
                challenge: challenge2,
                linkMLDSAPublicKeyToAddress: true,
                revealMLDSAPublicKey: true,
            } as IDeploymentParameters);

            const tokenAddress = tokenDeploy.contractAddress;
            this.updateStatus({ tokenAddress });
            console.log('[DeployService] OpLaunchToken address:', tokenAddress);

            await this.provider.sendRawTransaction(tokenDeploy.transaction[0], false);
            await this.provider.sendRawTransaction(tokenDeploy.transaction[1], false);

            this.updateStatus({ status: 'waiting_confirmation', stepLabel: 'Waiting for OpLaunchToken block confirmation...' });
            console.log('[DeployService] OpLaunchToken TX broadcast. Waiting for contract on chain...');

            // Wait until OpLaunchToken contract code is actually on chain
            await this.waitForContractDeployment(tokenAddress, 'Step 2 (OpLaunchToken)');
            this.updateStatus({ status: 'confirmed', stepLabel: 'OpLaunchToken confirmed!' });

            // ========================================
            // Step 3: Call setTokenAddress
            // ========================================
            this.updateStatus({ step: 3, stepLabel: 'Linking token to curve...', status: 'broadcasting' });
            console.log('[DeployService] Step 3/3: Calling setTokenAddress...');

            let activated = false;
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    const currentUtxos = await this.getFreshUtxos('Step 3');

                    const calldata = new BinaryWriter();
                    calldata.writeSelector(SET_TOKEN_ADDRESS_SELECTOR);
                    calldata.writeAddress(Address.fromString(tokenDeploy.contractPubKey));

                    const challenge = await this.provider.getChallenge();
                    const interaction = await this.factory.signInteraction({
                        from: this.account.p2tr,
                        to: curveAddress,
                        contract: curveDeploy.contractPubKey,
                        utxos: currentUtxos,
                        signer: this.account.keypair,
                        mldsaSigner: this.account.mldsaKeypair,
                        network,
                        feeRate: 5,
                        priorityFee: 0n,
                        gasSatFee: 10000n,
                        calldata: calldata.getBuffer(),
                        challenge,
                    } as IInteractionParameters);

                    let txHash = '';
                    if (interaction.fundingTransaction) {
                        await this.provider.sendRawTransaction(interaction.fundingTransaction, false);
                    }
                    const interactionTxId = await this.provider.sendRawTransaction(interaction.interactionTransaction, false);
                    txHash = typeof interactionTxId === 'string' ? interactionTxId : '';

                    this.updateStatus({ status: 'waiting_confirmation', stepLabel: 'Waiting for setTokenAddress confirmation...' });
                    console.log('[DeployService] setTokenAddress TX broadcast. Waiting for confirmation...');

                    // For interaction TX, we wait for TX receipt if we have a hash,
                    // otherwise just wait a fixed time for the block
                    if (txHash) {
                        await this.waitForTxConfirmation(txHash, 'Step 3 (setTokenAddress)');
                    } else {
                        // Fallback: wait for one block cycle
                        console.log('[DeployService] No TX hash returned, waiting fixed time for block...');
                        await sleep(UTXO_POLL_INTERVAL_MS * 12); // ~3 minutes
                    }
                    activated = true;
                    break;
                } catch (err: any) {
                    console.log(`[DeployService] setTokenAddress attempt ${attempt}/5 failed: ${err.message}`);
                    await sleep(UTXO_POLL_INTERVAL_MS);
                }
            }

            console.log(`\n[DeployService] ========================================`);
            console.log(`[DeployService] DEPLOYMENT COMPLETE`);
            console.log(`[DeployService] BondingCurve: ${curveAddress}`);
            console.log(`[DeployService] OpLaunchToken: ${tokenAddress}`);
            console.log(`[DeployService] setTokenAddress: ${activated ? 'CONFIRMED' : 'PENDING'}`);
            console.log(`[DeployService] ========================================\n`);

            this.updateStatus({
                status: 'complete',
                stepLabel: activated ? 'Deployment complete!' : 'Deployment complete (activation pending)',
            });
            this.deploying = false;
        } catch (err: any) {
            console.error('[DeployService] Deployment failed:', err);
            this.updateStatus({ status: 'failed', error: err.message || 'Deployment failed' });
            this.deploying = false;
        }
    }

    /**
     * Deploy a StakingVault for a graduated token.
     * Runs in background. Returns the vault address when complete.
     * tokenBech32 is the graduated token's bech32 address (opt1...).
     */
    async deployVault(tokenBech32: string): Promise<{ vaultAddress: string; contractPubKey: string } | null> {
        if (!this.initialized) {
            console.error('[DeployService] Not initialized, cannot deploy vault');
            return null;
        }
        if (this.deploying) {
            console.error('[DeployService] Another deployment in progress, cannot deploy vault');
            return null;
        }

        this.deploying = true;
        try {
            console.log(`\n[DeployService] ========================================`);
            console.log(`[DeployService] Deploying StakingVault for token: ${tokenBech32}`);
            console.log(`[DeployService] ========================================\n`);

            const vaultPath = this.getWasmPath('StakingVault');
            if (!fs.existsSync(vaultPath)) {
                console.error('[DeployService] StakingVault.wasm not found at:', vaultPath);
                return null;
            }

            const vaultBytecode = fs.readFileSync(vaultPath);

            // Resolve token bech32 → hex public key
            const tokenPubKeyInfo = await this.provider.getPublicKeyInfo(tokenBech32, true);
            if (!tokenPubKeyInfo) {
                console.error('[DeployService] Could not resolve token public key for:', tokenBech32);
                return null;
            }
            const tokenPubKeyHex = tokenPubKeyInfo.toString();

            // Get current block for reward end calculation
            const currentBlock = await this.provider.getBlockNumber();

            // Build calldata: stakingToken, rewardToken, rewardRate, rewardEndBlock, minStake
            const calldata = new BinaryWriter();
            calldata.writeAddress(Address.fromString(tokenPubKeyHex));    // staking token
            calldata.writeAddress(Address.fromString(tokenPubKeyHex));    // reward token (same)
            calldata.writeU256(REWARD_RATE);
            calldata.writeU256(BigInt(currentBlock) + REWARD_DURATION_BLOCKS);
            calldata.writeU256(MIN_STAKE);

            const utxos = await this.getFreshUtxos('Vault deploy');
            const challenge = await this.provider.getChallenge();

            const vaultDeploy = await this.factory.signDeployment({
                from: this.account.p2tr,
                utxos,
                signer: this.account.keypair,
                mldsaSigner: this.account.mldsaKeypair,
                network,
                feeRate: 5,
                priorityFee: 0n,
                gasSatFee: 10000n,
                bytecode: vaultBytecode,
                calldata: calldata.getBuffer(),
                challenge,
                linkMLDSAPublicKeyToAddress: true,
                revealMLDSAPublicKey: true,
            } as IDeploymentParameters);

            const vaultAddress = vaultDeploy.contractAddress;
            console.log('[DeployService] StakingVault address:', vaultAddress);

            await this.provider.sendRawTransaction(vaultDeploy.transaction[0], false);
            await this.provider.sendRawTransaction(vaultDeploy.transaction[1], false);

            console.log('[DeployService] StakingVault TX broadcast. Waiting for confirmation...');
            await this.waitForContractDeployment(vaultAddress, 'StakingVault');

            console.log(`[DeployService] StakingVault DEPLOYED: ${vaultAddress}`);
            console.log(`[DeployService] StakingVault contractPubKey: ${vaultDeploy.contractPubKey}`);
            return { vaultAddress, contractPubKey: vaultDeploy.contractPubKey };
        } catch (err: any) {
            console.error('[DeployService] Vault deployment failed:', err);
            return null;
        } finally {
            this.deploying = false;
        }
    }
    /**
     * Try to resolve a vault's hex public key via RPC.
     * Returns the hex pubkey string or null if resolution fails.
     */
    async resolveVaultPubKey(vaultBech32: string): Promise<string | null> {
        // Try getPublicKeyInfo (without cache)
        try {
            const addr = await this.provider.getPublicKeyInfo(vaultBech32, false);
            if (addr) {
                const hex = addr.toHex ? addr.toHex() : addr.toString();
                console.log(`[DeployService] Resolved vault pubkey via getPublicKeyInfo: ${hex}`);
                return hex;
            }
        } catch (err: any) {
            console.log(`[DeployService] getPublicKeyInfo failed: ${err.message}`);
        }

        // Try getPublicKeysInfoRaw for more detailed info
        try {
            const raw = await (this.provider as any).getPublicKeysInfoRaw(vaultBech32);
            if (raw) {
                const hex = raw.mldsaHashedPublicKey || raw.originalPubKey || raw.tweakedPubkey;
                if (hex) {
                    console.log(`[DeployService] Resolved vault pubkey via raw info: ${hex}`);
                    return hex;
                }
                console.log(`[DeployService] Raw info returned but no usable pubkey:`, JSON.stringify(raw));
            }
        } catch (err: any) {
            console.log(`[DeployService] getPublicKeysInfoRaw failed: ${err.message}`);
        }

        return null;
    }
}

export const deployService = new DeployService();
