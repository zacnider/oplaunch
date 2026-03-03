/**
 * EscrowService - Handles BTC withdrawal from deployer escrow wallet
 *
 * When a user sells tokens, the contract records a pending BTC withdrawal.
 * This service:
 *   1. Queries the contract for the user's pending withdrawal amount
 *   2. Sends BTC from deployer wallet to the user via optionalOutputs
 *   3. Calls markWithdrawalProcessed on the contract to clear the pending amount
 */
import {
    Address,
    ABIDataTypes,
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { BitcoinAbiTypes, getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const TESTNET_RPC = 'https://testnet.opnet.org';
const network = (networks as any).opnetTestnet;

const F = BitcoinAbiTypes.Function;

const BONDING_CURVE_ABI = [
    {
        name: 'getPendingWithdrawal',
        type: F,
        constant: true,
        inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'pendingBtc', type: ABIDataTypes.UINT256 }],
    },
    {
        name: 'markWithdrawalProcessed',
        type: F,
        inputs: [
            { name: 'user', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'getEscrowAddress',
        type: F,
        constant: true,
        inputs: [],
        outputs: [{ name: 'escrowAddress', type: ABIDataTypes.STRING }],
    },
];

class EscrowService {
    private provider: JSONRpcProvider;
    private wallet: any;
    private account: any;
    private initialized = false;
    private processing = new Set<string>(); // track in-flight withdrawals
    private recentlyProcessed = new Map<string, number>(); // cooldown: key → timestamp
    private static COOLDOWN_MS = 600_000; // 10 minutes cooldown after successful withdrawal

    constructor() {
        this.provider = new JSONRpcProvider({ url: TESTNET_RPC, network });
    }

    async init(): Promise<boolean> {
        const mnemonic = process.env.MNEMONIC;
        if (!mnemonic) {
            console.error('[EscrowService] MNEMONIC not set');
            return false;
        }

        try {
            this.wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
            this.account = this.wallet.deriveOPWallet(AddressTypes.P2TR, 0);
            this.initialized = true;
            console.log('[EscrowService] Initialized. Escrow wallet:', this.account.p2tr);
            return true;
        } catch (err) {
            console.error('[EscrowService] Init failed:', err);
            return false;
        }
    }

    /**
     * Resolve a bech32 address to an Address object via RPC.
     * Falls back to Address.fromString(hex) if RPC lookup fails.
     */
    private async resolveAddress(userBech32: string, userPubKeyHex?: string): Promise<Address | null> {
        // Method 1: RPC lookup (force refresh)
        try {
            const addr = await this.provider.getPublicKeyInfo(userBech32, true);
            if (addr) {
                console.log(`[EscrowService] Resolved ${userBech32.slice(0, 16)}... via RPC → toHex=${addr.toHex().slice(0, 20)}...`);
                return addr;
            }
            console.log('[EscrowService] getPublicKeyInfo returned null');
        } catch (err) {
            console.warn('[EscrowService] getPublicKeyInfo failed:', err);
        }
        // Method 2: Fallback to hex public key
        if (userPubKeyHex) {
            try {
                const addr = Address.fromString(userPubKeyHex);
                console.log(`[EscrowService] Fallback fromString(${userPubKeyHex.slice(0, 20)}...) → toHex=${addr.toHex().slice(0, 20)}...`);
                return addr;
            } catch (err) {
                console.error('[EscrowService] Address.fromString failed:', err);
            }
        }
        return null;
    }

    /**
     * Debug method: try all address resolution methods and query pending for each.
     */
    async debugPending(curveAddress: string, userBech32: string, userPubKeyHex: string): Promise<Record<string, unknown>> {
        const results: Record<string, unknown> = { curveAddress, userBech32, userPubKeyHex };

        const contract = getContract(curveAddress, BONDING_CURVE_ABI as any, this.provider, network);

        // Method 1: getPublicKeyInfo (force)
        try {
            const addr = await this.provider.getPublicKeyInfo(userBech32, true);
            if (addr) {
                results.rpcAddr = { toHex: addr.toHex(), toString: addr.toString() };
                try {
                    const r = await (contract as any).getPendingWithdrawal(addr);
                    results.rpcPending = 'error' in r ? { error: r.error } : { amount: (r.properties.pendingBtc as bigint).toString() };
                } catch (e: any) {
                    results.rpcPending = { exception: e.message };
                }
            } else {
                results.rpcAddr = null;
            }
        } catch (e: any) {
            results.rpcAddr = { error: e.message };
        }

        // Method 2: Address.fromString(hex)
        try {
            const addr = Address.fromString(userPubKeyHex);
            results.fromStringAddr = { toHex: addr.toHex(), toString: addr.toString() };
            try {
                const r = await (contract as any).getPendingWithdrawal(addr);
                results.fromStringPending = 'error' in r ? { error: r.error } : { amount: (r.properties.pendingBtc as bigint).toString() };
            } catch (e: any) {
                results.fromStringPending = { exception: e.message };
            }
        } catch (e: any) {
            results.fromStringAddr = { error: e.message };
        }

        // Method 3: Address.fromString without 0x prefix
        const hexNoPre = userPubKeyHex.startsWith('0x') ? userPubKeyHex.slice(2) : userPubKeyHex;
        try {
            const addr = Address.fromString(hexNoPre);
            results.fromStringNoPrefixAddr = { toHex: addr.toHex(), toString: addr.toString() };
            try {
                const r = await (contract as any).getPendingWithdrawal(addr);
                results.fromStringNoPrefixPending = 'error' in r ? { error: r.error } : { amount: (r.properties.pendingBtc as bigint).toString() };
            } catch (e: any) {
                results.fromStringNoPrefixPending = { exception: e.message };
            }
        } catch (e: any) {
            results.fromStringNoPrefixAddr = { error: e.message };
        }

        return results;
    }

    /**
     * Query the pending withdrawal amount for a user on a given curve contract.
     */
    async getPendingWithdrawal(curveAddress: string, userBech32: string, userPubKeyHex?: string): Promise<bigint> {
        try {
            const contract = getContract(
                curveAddress,
                BONDING_CURVE_ABI as any,
                this.provider,
                network,
            );

            const userAddr = await this.resolveAddress(userBech32, userPubKeyHex);
            if (!userAddr) {
                console.error('[EscrowService] Could not resolve user address');
                return 0n;
            }
            console.log(`[EscrowService] getPendingWithdrawal for ${userAddr.toHex().slice(0, 20)}...`);
            const result = await (contract as any).getPendingWithdrawal(userAddr);
            if ('error' in result) {
                console.log('[EscrowService] getPendingWithdrawal error:', (result as any).error);
                return 0n;
            }
            const amount = result.properties.pendingBtc as bigint;
            console.log(`[EscrowService] pendingBtc = ${amount}`);
            return amount;
        } catch (err) {
            console.error('[EscrowService] getPendingWithdrawal exception:', err);
            return 0n;
        }
    }

    /**
     * Process a BTC withdrawal for a user:
     * 1. Check pending amount on chain
     * 2. Send BTC to user + call markWithdrawalProcessed in one TX
     */
    async processWithdrawal(
        curveAddress: string,
        userBech32: string,
        userPubKeyHex: string,
    ): Promise<{ success: boolean; txHash?: string; amount?: string; error?: string }> {
        if (!this.initialized) {
            return { success: false, error: 'EscrowService not initialized' };
        }

        const key = `${curveAddress}:${userBech32}`;
        if (this.processing.has(key)) {
            return { success: false, error: 'Withdrawal already being processed' };
        }

        // Cooldown: prevent double-claim before markWithdrawalProcessed confirms on-chain
        const lastProcessed = this.recentlyProcessed.get(key);
        if (lastProcessed && Date.now() - lastProcessed < EscrowService.COOLDOWN_MS) {
            const remainSec = Math.ceil((EscrowService.COOLDOWN_MS - (Date.now() - lastProcessed)) / 1000);
            return { success: false, error: `Withdrawal recently processed. Please wait ${remainSec}s for on-chain confirmation.` };
        }

        this.processing.add(key);
        try {
            // 1. Resolve user address via RPC (same resolution as Blockchain.tx.sender)
            const userAddr = await this.resolveAddress(userBech32, userPubKeyHex);
            if (!userAddr) {
                return { success: false, error: 'Could not resolve user address' };
            }

            // 2. Query pending amount
            const pendingAmount = await this.getPendingWithdrawal(curveAddress, userBech32, userPubKeyHex);
            if (pendingAmount <= 0n) {
                return { success: false, error: 'No pending withdrawal' };
            }

            console.log(`[EscrowService] Processing withdrawal: ${pendingAmount} sats to ${userBech32}`);

            // 3. Get UTXOs
            const utxos = await this.provider.utxoManager.getUTXOs({ address: this.account.p2tr });
            if (!utxos || utxos.length === 0) {
                return { success: false, error: 'No UTXOs available in escrow wallet' };
            }

            // Check balance
            let balance = 0n;
            for (const u of utxos) {
                balance += BigInt((u as any).value || (u as any).satoshis || 0);
            }
            if (balance < pendingAmount + 20000n) { // need extra for fees
                return { success: false, error: 'Insufficient escrow balance' };
            }

            // 4. Call markWithdrawalProcessed via opnet SDK
            const contract = getContract(
                curveAddress,
                BONDING_CURVE_ABI as any,
                this.provider,
                network,
                this.account.address,
            );

            const sim = await (contract as any).markWithdrawalProcessed(userAddr, pendingAmount);
            if ('error' in sim) {
                return { success: false, error: `Contract call failed: ${sim.error}` };
            }

            // Send the transaction with optionalOutputs to send BTC to user
            const txResult = await sim.sendTransaction({
                signer: this.account.keypair,
                mldsaSigner: this.account.mldsaKeypair,
                refundTo: this.account.p2tr,
                maximumAllowedSatToSpend: 50000n, // gas budget
                network,
                extraOutputs: [
                    { address: userBech32, value: pendingAmount },
                ],
            });

            const txHash = typeof txResult === 'string' ? txResult : '';
            console.log(`[EscrowService] Withdrawal TX sent: ${txHash}, amount: ${pendingAmount} sats`);

            // Mark cooldown to prevent double-claim before on-chain confirmation
            this.recentlyProcessed.set(key, Date.now());

            return {
                success: true,
                txHash,
                amount: pendingAmount.toString(),
            };
        } catch (err: any) {
            console.error('[EscrowService] Withdrawal error:', err);
            return { success: false, error: err.message || 'Withdrawal failed' };
        } finally {
            this.processing.delete(key);
        }
    }
}

export const escrowService = new EscrowService();
