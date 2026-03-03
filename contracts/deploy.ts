/**
 * OpLaunch Contract Deployment Script (New Architecture)
 *
 * Flow:
 *   1. Deploy BondingCurve (placeholder tokenAddr = deployer)
 *   2. Deploy OpLaunchToken (curveAddr = real curve address, auto-transfers tokens to curve)
 *   3. Wait for confirmation, then call curve.setTokenAddress(tokenAddr)
 *   4. Deploy StakingVault
 *
 * Usage:
 *   npx tsx deploy.ts
 *
 * Requirements:
 *   - MNEMONIC in .env or ../backend/.env
 *   - Testnet BTC in wallet (get from faucet)
 *   - Built WASM files in ./build/
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(import.meta.dirname || '.', '.env') });
config({ path: resolve(import.meta.dirname || '.', '../backend/.env') });

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

const TESTNET_RPC = 'https://testnet.opnet.org';
const network = (networks as any).opnetTestnet;

// Token parameters
const TOKEN_NAME = 'OpLaunch Test';
const TOKEN_SYMBOL = 'OPLAUNCH';
const TOKEN_DECIMALS: number = 18;
const TOKEN_SUPPLY = 1000000000n * (10n ** 18n); // 1B tokens

// Bonding curve parameters
const INITIAL_VIRTUAL_BTC = 100000000n; // 1 BTC virtual
const GRADUATION_TARGET = 30000000n;    // 0.3 BTC

// Staking parameters
const REWARD_RATE = 1000000000000000n;
const REWARD_DURATION_BLOCKS = 100000n;
const MIN_STAKE = 1000000000000000000n; // 1 token

// setTokenAddress selector
const SET_TOKEN_ADDRESS_SELECTOR = 0x800d76cb;

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

async function main() {
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
        console.error('ERROR: Set MNEMONIC in .env or ../backend/.env');
        process.exit(1);
    }

    console.log('Setting up wallet...');
    const wallet = new Mnemonic(mnemonic, '', network, MLDSASecurityLevel.LEVEL2);
    const account = wallet.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log('Deployer address:', account.p2tr);

    const provider = new JSONRpcProvider({ url: TESTNET_RPC, network });
    const factory = new TransactionFactory();

    // Get UTXOs
    console.log('Fetching UTXOs...');
    const utxos = await provider.utxoManager.getUTXOs({ address: account.p2tr });
    if (!utxos || utxos.length === 0) {
        console.error('No UTXOs found. Get testnet BTC from faucet first.');
        process.exit(1);
    }
    console.log(`Found ${utxos.length} UTXOs`);

    const scriptsDir = import.meta.dirname || '.';

    // ========================================
    // Step 1: Deploy BondingCurve (placeholder token address)
    // ========================================
    console.log('\n--- Step 1: Deploying BondingCurve ---');
    const curveBytecode = fs.readFileSync(path.join(scriptsDir, 'build/BondingCurve.wasm'));

    const curveCalldata = new BinaryWriter();
    curveCalldata.writeAddress(account.p2tr as unknown as Address); // placeholder token address (deployer)
    curveCalldata.writeU256(INITIAL_VIRTUAL_BTC);
    curveCalldata.writeU256(TOKEN_SUPPLY);
    curveCalldata.writeU256(GRADUATION_TARGET);

    const challenge1 = await provider.getChallenge();
    const curveDeploy = await factory.signDeployment({
        from: account.p2tr,
        utxos,
        signer: account.keypair,
        mldsaSigner: account.mldsaKeypair,
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
    console.log('BondingCurve address:', curveAddress);

    await provider.sendRawTransaction(curveDeploy.transaction[0], false);
    console.log('Curve funding TX broadcast');
    await provider.sendRawTransaction(curveDeploy.transaction[1], false);
    console.log('Curve reveal TX broadcast');

    // ========================================
    // Step 2: Deploy OpLaunchToken (with real curveAddress)
    // Token mints all supply to deployer, then auto-transfers to curve
    // ========================================
    console.log('\n--- Step 2: Deploying OpLaunchToken ---');
    const tokenBytecode = fs.readFileSync(path.join(scriptsDir, 'build/OpLaunchToken.wasm'));

    const tokenCalldata = new BinaryWriter();
    tokenCalldata.writeStringWithLength(TOKEN_NAME);
    tokenCalldata.writeStringWithLength(TOKEN_SYMBOL);
    tokenCalldata.writeU256(TOKEN_SUPPLY);
    tokenCalldata.writeU8(TOKEN_DECIMALS);
    tokenCalldata.writeStringWithLength('OpLaunch governance test token');
    tokenCalldata.writeStringWithLength('');
    tokenCalldata.writeAddress(Address.fromString(curveDeploy.contractPubKey)); // curve address for auto-transfer

    const challenge2 = await provider.getChallenge();
    const updatedUtxos1 = curveDeploy.utxos || utxos;
    const tokenDeploy = await factory.signDeployment({
        from: account.p2tr,
        utxos: updatedUtxos1,
        signer: account.keypair,
        mldsaSigner: account.mldsaKeypair,
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
    console.log('OpLaunchToken address:', tokenAddress);

    await provider.sendRawTransaction(tokenDeploy.transaction[0], false);
    console.log('Token funding TX broadcast');
    await provider.sendRawTransaction(tokenDeploy.transaction[1], false);
    console.log('Token reveal TX broadcast');

    // ========================================
    // Step 3: Wait for confirmation, then call setTokenAddress
    // ========================================
    console.log('\n--- Step 3: Waiting for confirmation to call setTokenAddress ---');
    console.log('Waiting 15 seconds for block confirmation...');
    await sleep(15000);

    let activated = false;
    for (let attempt = 1; attempt <= 20; attempt++) {
        try {
            console.log(`Attempt ${attempt}/20: calling setTokenAddress...`);

            const freshUtxos = await provider.utxoManager.getUTXOs({ address: account.p2tr });
            if (!freshUtxos || freshUtxos.length === 0) {
                console.log('No UTXOs yet, waiting...');
                await sleep(10000);
                continue;
            }

            const calldata = new BinaryWriter();
            calldata.writeSelector(SET_TOKEN_ADDRESS_SELECTOR);
            calldata.writeAddress(Address.fromString(tokenDeploy.contractPubKey));

            const challenge = await provider.getChallenge();
            const interaction = await factory.signInteraction({
                from: account.p2tr,
                to: curveAddress,
                contract: curveDeploy.contractPubKey,
                utxos: freshUtxos,
                signer: account.keypair,
                mldsaSigner: account.mldsaKeypair,
                network,
                feeRate: 5,
                priorityFee: 0n,
                gasSatFee: 10000n,
                calldata: calldata.getBuffer(),
                challenge,
            } as IInteractionParameters);

            await provider.sendRawTransaction(interaction.fundingTransaction!, false);
            await provider.sendRawTransaction(interaction.interactionTransaction!, false);
            console.log('setTokenAddress TX broadcast successfully!');
            activated = true;
            break;
        } catch (err: any) {
            console.log(`Attempt ${attempt} failed: ${err.message || err}`);
            if (attempt < 20) {
                console.log('Retrying in 10 seconds...');
                await sleep(10000);
            }
        }
    }

    if (!activated) {
        console.error('WARNING: setTokenAddress failed after 20 attempts.');
        console.error('You may need to call it manually later.');
    }

    // ========================================
    // Step 4: Deploy StakingVault
    // ========================================
    console.log('\n--- Step 4: Deploying StakingVault ---');
    const stakingBytecode = fs.readFileSync(path.join(scriptsDir, 'build/StakingVault.wasm'));

    const currentBlock = await provider.getBlockNumber();
    const stakingCalldata = new BinaryWriter();
    stakingCalldata.writeAddress(Address.fromString(tokenDeploy.contractPubKey));
    stakingCalldata.writeAddress(Address.fromString(tokenDeploy.contractPubKey));
    stakingCalldata.writeU256(REWARD_RATE);
    stakingCalldata.writeU256(BigInt(currentBlock) + REWARD_DURATION_BLOCKS);
    stakingCalldata.writeU256(MIN_STAKE);

    const freshUtxos2 = await provider.utxoManager.getUTXOs({ address: account.p2tr });
    const challenge4 = await provider.getChallenge();
    const stakingDeploy = await factory.signDeployment({
        from: account.p2tr,
        utxos: freshUtxos2 || [],
        signer: account.keypair,
        mldsaSigner: account.mldsaKeypair,
        network,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 10000n,
        bytecode: stakingBytecode,
        calldata: stakingCalldata.getBuffer(),
        challenge: challenge4,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey: true,
    } as IDeploymentParameters);

    console.log('StakingVault address:', stakingDeploy.contractAddress);

    await provider.sendRawTransaction(stakingDeploy.transaction[0], false);
    console.log('Staking funding TX broadcast');
    await provider.sendRawTransaction(stakingDeploy.transaction[1], false);
    console.log('Staking reveal TX broadcast');

    // ========================================
    // Summary
    // ========================================
    console.log('\n========================================');
    console.log('DEPLOYMENT COMPLETE');
    console.log('========================================');
    console.log('BondingCurve (P2OP):', curveAddress);
    console.log('OpLaunchToken (P2OP):', tokenAddress);
    console.log('StakingVault (P2OP):', stakingDeploy.contractAddress);
    console.log('setTokenAddress:', activated ? 'SUCCESS' : 'PENDING');
    console.log('\nUpdate these addresses in your config!');
    console.log('========================================');
}

main().catch((err) => {
    console.error('Deployment failed:', err);
    process.exit(1);
});
