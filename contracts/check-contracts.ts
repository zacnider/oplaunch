/**
 * Quick contract state checker
 * Checks if deployed contracts are alive and responding
 */
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { BinaryWriter } from '@btc-vision/transaction';

const network = (networks as any).opnetTestnet;
const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network });

// Base contracts (deployed via deploy.ts)
const BASE_CURVE = 'opt1sqrfvjaqayxk96w4lzlgwstwn0pgq9gmlkga4yuav';
const BASE_TOKEN = 'opt1sqrcc5hazp76q9rg8d8frfq0sk62vgcag2gkeqa9t';

// Op Donut (deployed via DeployService)
const DONUT_TOKEN = 'opt1sqp5c6rxm5qf7knru685lp5lv3gftxzda75fztlyn';
const DONUT_CURVE = 'opt1sqpf5jgjd9v6p0zjtr57wa9ukwas40wkfdu2y379y';

// Selectors
const GET_CURVE_STATE = 0x1e94b53f;

async function checkContract(name: string, address: string, selector: number) {
    try {
        console.log(`\n--- Checking ${name} (${address}) ---`);

        const calldata = new BinaryWriter();
        calldata.writeSelector(selector);

        const result = await provider.simulateInteraction({
            to: address,
            calldata: calldata.getBuffer(),
        });

        console.log(`  Status: OK`);
        console.log(`  Result:`, result);
        return true;
    } catch (err: any) {
        console.log(`  Status: FAILED`);
        console.log(`  Error:`, err.message || err);
        return false;
    }
}

async function checkContractExists(name: string, address: string) {
    try {
        console.log(`\n--- Checking if ${name} exists (${address}) ---`);
        const code = await provider.getCode(address);
        if (code && code.length > 0) {
            console.log(`  Bytecode: EXISTS (${code.length} bytes)`);
            return true;
        } else {
            console.log(`  Bytecode: NOT FOUND`);
            return false;
        }
    } catch (err: any) {
        console.log(`  Error:`, err.message || err);
        return false;
    }
}

async function main() {
    console.log('=== Contract State Checker ===\n');

    // Check if contracts exist on-chain
    await checkContractExists('Base BondingCurve', BASE_CURVE);
    await checkContractExists('Base OpLaunchToken', BASE_TOKEN);
    await checkContractExists('Donut Token', DONUT_TOKEN);
    await checkContractExists('Donut Curve', DONUT_CURVE);

    // Try to call getCurveState on the curves
    await checkContract('Base BondingCurve getCurveState', BASE_CURVE, GET_CURVE_STATE);
    await checkContract('Donut Curve getCurveState', DONUT_CURVE, GET_CURVE_STATE);
}

main().catch(console.error);
