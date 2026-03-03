/**
 * Deploy TokenFactory contract to OP_NET testnet
 *
 * Usage:
 *   MNEMONIC="your twelve words" npx tsx deploy-factory.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname || '.', '.env') });
config({ path: resolve(import.meta.dirname || '.', '../backend/.env') });

import {
    AddressTypes,
    BinaryWriter,
    IDeploymentParameters,
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import * as fs from 'fs';
import * as path from 'path';

const TESTNET_RPC = 'https://testnet.opnet.org';
const network = (networks as any).opnetTestnet;

async function main() {
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('ERROR: Set MNEMONIC environment variable');
        process.exit(1);
    }

    console.log('Setting up wallet...');
    const wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
    const account = wallet.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log('Deployer address:', account.p2tr);

    const provider = new JSONRpcProvider({ url: TESTNET_RPC, network });

    console.log('Fetching UTXOs...');
    const utxos = await provider.utxoManager.getUTXOs({ address: account.p2tr });
    if (!utxos || utxos.length === 0) {
        console.error('No UTXOs found. Get testnet BTC first.');
        process.exit(1);
    }
    console.log(`Found ${utxos.length} UTXOs`);

    const txFactory = new TransactionFactory();

    // Deploy TokenFactory (no constructor args needed)
    console.log('\n--- Deploying TokenFactory ---');
    const scriptsDir = import.meta.dirname || '.';
    const factoryBytecode = fs.readFileSync(
        path.join(scriptsDir, 'build/TokenFactory.wasm'),
    );

    const factoryCalldata = new BinaryWriter();
    // onDeployment reads nothing from calldata, just sets owner = sender

    const challenge = await provider.getChallenge();
    const factoryDeploy = await txFactory.signDeployment({
        from: account.p2tr,
        utxos,
        signer: account.keypair,
        mldsaSigner: account.mldsaKeypair,
        network,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 10000n,
        bytecode: factoryBytecode,
        calldata: factoryCalldata.getBuffer(),
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    } as IDeploymentParameters);

    console.log('TokenFactory address (P2OP):', factoryDeploy.contractAddress);
    console.log('TokenFactory pubkey (0x):', factoryDeploy.contractPubKey);

    await provider.sendRawTransaction(factoryDeploy.transaction[0], false);
    console.log('Factory funding TX broadcast');
    await provider.sendRawTransaction(factoryDeploy.transaction[1], false);
    console.log('Factory reveal TX broadcast');

    console.log('\n========================================');
    console.log('FACTORY DEPLOYMENT COMPLETE');
    console.log('========================================');
    console.log('TokenFactory (P2OP):', factoryDeploy.contractAddress);
    console.log('TokenFactory (0x):', factoryDeploy.contractPubKey);
    console.log('\nUse this address in your frontend config!');
    console.log('========================================');
}

main().catch((err) => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
