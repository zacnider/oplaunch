import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(import.meta.dirname || '.', '../backend/.env') });

import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { Mnemonic, AddressTypes, MLDSASecurityLevel } from '@btc-vision/transaction';

const network = (networks as any).opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

const mnemonic = process.env.MNEMONIC;
if (!mnemonic) {
    console.error('MNEMONIC not found');
    process.exit(1);
}

const wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
const account = wallet.deriveOPWallet(AddressTypes.P2TR, 0);
console.log('Deployer address:', account.p2tr);

async function main() {
    try {
        const utxos = await provider.utxoManager.getUTXOs({ address: account.p2tr });
        if (!utxos || utxos.length === 0) {
            console.log('\nNO UTXOs! Wallet is EMPTY.');
            console.log('Need testnet BTC from faucet.');
            return;
        }

        let total = 0n;
        for (let i = 0; i < utxos.length; i++) {
            const u = utxos[i] as any;
            const val = BigInt(u.value || u.satoshis || 0);
            console.log(`  UTXO ${i}: ${val} sats`);
            total += val;
        }
        console.log(`\nTotal UTXOs: ${utxos.length}`);
        console.log(`Total balance: ${total} sats (${Number(total) / 100000000} BTC)`);
    } catch (err: any) {
        console.error('Error:', err.message);
    }
}

main();
