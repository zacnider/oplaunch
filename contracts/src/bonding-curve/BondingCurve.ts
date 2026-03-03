import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Address,
    Revert,
    StoredAddress,
    StoredBoolean,
    StoredU256,
    StoredString,
    AddressMemoryMap,
    SafeMath,
    TransferHelper,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class BondingCurve extends OP_NET {
    // Storage pointers
    private readonly ownerPointer: u16 = Blockchain.nextPointer;
    private readonly tokenAddressPointer: u16 = Blockchain.nextPointer;
    private readonly virtualBtcReservePointer: u16 = Blockchain.nextPointer;
    private readonly virtualTokenReservePointer: u16 = Blockchain.nextPointer;
    private readonly kConstantPointer: u16 = Blockchain.nextPointer;
    private readonly realBtcCollectedPointer: u16 = Blockchain.nextPointer;
    private readonly targetMarketCapPointer: u16 = Blockchain.nextPointer;
    private readonly isActivePointer: u16 = Blockchain.nextPointer;
    private readonly isGraduatedPointer: u16 = Blockchain.nextPointer;
    private readonly tokensSoldPointer: u16 = Blockchain.nextPointer;
    private readonly tokensRemainingPointer: u16 = Blockchain.nextPointer;
    private readonly totalTradesPointer: u16 = Blockchain.nextPointer;
    private readonly userBtcDepositsPointer: u16 = Blockchain.nextPointer;
    private readonly userTokensPurchasedPointer: u16 = Blockchain.nextPointer;

    // Escrow storage pointers
    private readonly escrowAddressPointer: u16 = Blockchain.nextPointer;
    private readonly pendingWithdrawalsPointer: u16 = Blockchain.nextPointer;

    // AMM Pool storage pointers (used after graduation)
    private readonly poolBtcReservePointer: u16 = Blockchain.nextPointer;
    private readonly poolTokenReservePointer: u16 = Blockchain.nextPointer;
    private readonly poolKPointer: u16 = Blockchain.nextPointer;
    private readonly totalSwapsPointer: u16 = Blockchain.nextPointer;

    // Storage fields - initialized inline
    private owner: StoredAddress = new StoredAddress(this.ownerPointer);
    private tokenAddress: StoredAddress = new StoredAddress(this.tokenAddressPointer);
    private virtualBtcReserve: StoredU256 = new StoredU256(this.virtualBtcReservePointer, EMPTY_POINTER);
    private virtualTokenReserve: StoredU256 = new StoredU256(this.virtualTokenReservePointer, EMPTY_POINTER);
    private kConstant: StoredU256 = new StoredU256(this.kConstantPointer, EMPTY_POINTER);
    private realBtcCollected: StoredU256 = new StoredU256(this.realBtcCollectedPointer, EMPTY_POINTER);
    private targetMarketCap: StoredU256 = new StoredU256(this.targetMarketCapPointer, EMPTY_POINTER);
    private isActive: StoredBoolean = new StoredBoolean(this.isActivePointer, false);
    private isGraduated: StoredBoolean = new StoredBoolean(this.isGraduatedPointer, false);
    private tokensSold: StoredU256 = new StoredU256(this.tokensSoldPointer, EMPTY_POINTER);
    private tokensRemaining: StoredU256 = new StoredU256(this.tokensRemainingPointer, EMPTY_POINTER);
    private totalTrades: StoredU256 = new StoredU256(this.totalTradesPointer, EMPTY_POINTER);
    private userBtcDeposits: AddressMemoryMap = new AddressMemoryMap(this.userBtcDepositsPointer);
    private userTokensPurchased: AddressMemoryMap = new AddressMemoryMap(this.userTokensPurchasedPointer);

    // Escrow storage
    private escrowAddress: StoredString = new StoredString(this.escrowAddressPointer, 0);
    private pendingWithdrawals: AddressMemoryMap = new AddressMemoryMap(this.pendingWithdrawalsPointer);

    // AMM Pool storage (post-graduation)
    private poolBtcReserve: StoredU256 = new StoredU256(this.poolBtcReservePointer, EMPTY_POINTER);
    private poolTokenReserve: StoredU256 = new StoredU256(this.poolTokenReservePointer, EMPTY_POINTER);
    private poolK: StoredU256 = new StoredU256(this.poolKPointer, EMPTY_POINTER);
    private totalSwaps: StoredU256 = new StoredU256(this.totalSwapsPointer, EMPTY_POINTER);

    constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        const tokenAddr: Address = calldata.readAddress();
        const initialVirtualBtc: u256 = calldata.readU256();
        const totalTokenSupply: u256 = calldata.readU256();
        const targetCap: u256 = calldata.readU256();
        const escrowAddr: string = calldata.readStringWithLength();

        this.owner.value = Blockchain.tx.sender;
        this.tokenAddress.value = tokenAddr;
        this.virtualBtcReserve.value = initialVirtualBtc;
        this.virtualTokenReserve.value = totalTokenSupply;
        this.kConstant.value = SafeMath.mul(initialVirtualBtc, totalTokenSupply);
        this.targetMarketCap.value = targetCap;
        this.realBtcCollected.value = u256.Zero;
        this.isActive.value = true;
        this.isGraduated.value = false;
        this.tokensSold.value = u256.Zero;
        this.tokensRemaining.value = totalTokenSupply;
        this.totalTrades.value = u256.Zero;
        this.escrowAddress.value = escrowAddr;
    }

    private _getTokensForBtc(btcAmount: u256): u256 {
        const currentBtcReserve = this.virtualBtcReserve.value;
        const currentTokenReserve = this.virtualTokenReserve.value;
        const k = this.kConstant.value;

        const newBtcReserve = SafeMath.add(currentBtcReserve, btcAmount);
        const newTokenReserve = SafeMath.div(k, newBtcReserve);
        const tokensOut = SafeMath.sub(currentTokenReserve, newTokenReserve);

        return tokensOut;
    }

    private _getBtcForTokens(tokenAmount: u256): u256 {
        const currentBtcReserve = this.virtualBtcReserve.value;
        const currentTokenReserve = this.virtualTokenReserve.value;
        const k = this.kConstant.value;

        const newTokenReserve = SafeMath.add(currentTokenReserve, tokenAmount);
        const newBtcReserve = SafeMath.div(k, newTokenReserve);
        const btcOut = SafeMath.sub(currentBtcReserve, newBtcReserve);

        return btcOut;
    }

    private _graduate(): void {
        // Initialize AMM pool with collected BTC and remaining tokens
        const btcForPool: u256 = this.realBtcCollected.value;
        const tokensForPool: u256 = this.tokensRemaining.value;

        this.poolBtcReserve.value = btcForPool;
        this.poolTokenReserve.value = tokensForPool;
        this.poolK.value = SafeMath.mul(btcForPool, tokensForPool);
        this.totalSwaps.value = u256.Zero;

        this.isActive.value = false;
        this.isGraduated.value = true;
    }

    @payable
    @method({ name: 'btcAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public buy(calldata: Calldata): BytesWriter {
        if (!this.isActive.value) {
            throw new Revert('Curve is not active');
        }
        if (this.isGraduated.value) {
            throw new Revert('Token has graduated');
        }

        const btcAmount: u256 = calldata.readU256();

        if (btcAmount == u256.Zero) {
            throw new Revert('BTC amount must be greater than zero');
        }

        // Verify BTC payment to escrow address in TX outputs
        const outputs = Blockchain.tx.outputs;
        const escrow = this.escrowAddress.value;
        let totalToEscrow: u256 = u256.Zero;
        for (let i: i32 = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to !== null && output.to == escrow) {
                totalToEscrow = SafeMath.add(totalToEscrow, u256.fromU64(output.value));
            }
        }
        if (totalToEscrow < btcAmount) {
            throw new Revert('Insufficient BTC payment to escrow');
        }

        const tokensOut: u256 = this._getTokensForBtc(btcAmount);

        if (tokensOut > this.tokensRemaining.value) {
            throw new Revert('Not enough tokens remaining');
        }

        this.virtualBtcReserve.value = SafeMath.add(this.virtualBtcReserve.value, btcAmount);
        this.virtualTokenReserve.value = SafeMath.sub(this.virtualTokenReserve.value, tokensOut);

        this.realBtcCollected.value = SafeMath.add(this.realBtcCollected.value, btcAmount);
        this.tokensSold.value = SafeMath.add(this.tokensSold.value, tokensOut);
        this.tokensRemaining.value = SafeMath.sub(this.tokensRemaining.value, tokensOut);
        this.totalTrades.value = SafeMath.add(this.totalTrades.value, u256.One);

        const sender = Blockchain.tx.sender;
        const prevDeposit = this.userBtcDeposits.get(sender);
        this.userBtcDeposits.set(sender, SafeMath.add(prevDeposit, btcAmount));

        const prevTokens = this.userTokensPurchased.get(sender);
        this.userTokensPurchased.set(sender, SafeMath.add(prevTokens, tokensOut));

        // Real OP_20 transfer: send tokens from this contract to the buyer
        TransferHelper.transfer(this.tokenAddress.value, sender, tokensOut);

        if (this.realBtcCollected.value >= this.targetMarketCap.value) {
            this._graduate();
        }

        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public sell(calldata: Calldata): BytesWriter {
        if (!this.isActive.value) {
            throw new Revert('Curve is not active');
        }
        if (this.isGraduated.value) {
            throw new Revert('Token has graduated');
        }

        const tokenAmount: u256 = calldata.readU256();

        if (tokenAmount == u256.Zero) {
            throw new Revert('Token amount must be greater than zero');
        }

        const sender = Blockchain.tx.sender;

        // Real OP_20 transfer: take tokens from seller back to this contract
        // User must have called token.approve(curveAddress, tokenAmount) beforehand
        TransferHelper.transferFrom(
            this.tokenAddress.value,
            sender,
            Blockchain.contractAddress,
            tokenAmount,
        );

        const btcOut: u256 = this._getBtcForTokens(tokenAmount);

        if (btcOut > this.realBtcCollected.value) {
            throw new Revert('Not enough BTC in reserves');
        }

        this.virtualTokenReserve.value = SafeMath.add(this.virtualTokenReserve.value, tokenAmount);
        this.virtualBtcReserve.value = SafeMath.sub(this.virtualBtcReserve.value, btcOut);

        this.realBtcCollected.value = SafeMath.sub(this.realBtcCollected.value, btcOut);
        this.tokensSold.value = SafeMath.sub(this.tokensSold.value, tokenAmount);
        this.tokensRemaining.value = SafeMath.add(this.tokensRemaining.value, tokenAmount);
        this.totalTrades.value = SafeMath.add(this.totalTrades.value, u256.One);

        const prevDeposit = this.userBtcDeposits.get(sender);
        if (prevDeposit >= btcOut) {
            this.userBtcDeposits.set(sender, SafeMath.sub(prevDeposit, btcOut));
        }

        const prevTokens = this.userTokensPurchased.get(sender);
        if (prevTokens >= tokenAmount) {
            this.userTokensPurchased.set(sender, SafeMath.sub(prevTokens, tokenAmount));
        }

        // Record pending BTC withdrawal for the seller
        const prevPending = this.pendingWithdrawals.get(sender);
        this.pendingWithdrawals.set(sender, SafeMath.add(prevPending, btcOut));

        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    @method()
    @returns(
        { name: 'virtualBtcReserve', type: ABIDataTypes.UINT256 },
        { name: 'virtualTokenReserve', type: ABIDataTypes.UINT256 },
        { name: 'realBtcCollected', type: ABIDataTypes.UINT256 },
        { name: 'targetMarketCap', type: ABIDataTypes.UINT256 },
        { name: 'tokensSold', type: ABIDataTypes.UINT256 },
        { name: 'tokensRemaining', type: ABIDataTypes.UINT256 },
        { name: 'totalTrades', type: ABIDataTypes.UINT256 },
        { name: 'isActive', type: ABIDataTypes.BOOL },
        { name: 'isGraduated', type: ABIDataTypes.BOOL },
    )
    public getCurveState(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32 * 7 + 2);
        writer.writeU256(this.virtualBtcReserve.value);
        writer.writeU256(this.virtualTokenReserve.value);
        writer.writeU256(this.realBtcCollected.value);
        writer.writeU256(this.targetMarketCap.value);
        writer.writeU256(this.tokensSold.value);
        writer.writeU256(this.tokensRemaining.value);
        writer.writeU256(this.totalTrades.value);
        writer.writeBoolean(this.isActive.value);
        writer.writeBoolean(this.isGraduated.value);
        return writer;
    }

    @method({ name: 'btcAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public getTokensForBtc(calldata: Calldata): BytesWriter {
        const btcAmount: u256 = calldata.readU256();
        const tokensOut = this._getTokensForBtc(btcAmount);
        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public getBtcForTokens(calldata: Calldata): BytesWriter {
        const tokenAmount: u256 = calldata.readU256();
        const btcOut = this._getBtcForTokens(tokenAmount);
        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    @method({ name: 'tokenAddr', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setTokenAddress(calldata: Calldata): BytesWriter {
        const sender = Blockchain.tx.sender;
        if (sender !== this.owner.value) {
            throw new Revert('Only owner can set token address');
        }

        const tokenAddr: Address = calldata.readAddress();
        this.tokenAddress.value = tokenAddr;

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'btcDeposited', type: ABIDataTypes.UINT256 },
        { name: 'tokensBought', type: ABIDataTypes.UINT256 },
    )
    public getUserPosition(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();
        const btcDeposited = this.userBtcDeposits.get(user);
        const tokensBought = this.userTokensPurchased.get(user);

        const writer = new BytesWriter(64);
        writer.writeU256(btcDeposited);
        writer.writeU256(tokensBought);
        return writer;
    }

    // ========================================
    // AMM Pool Methods (post-graduation)
    // Constant product: x * y = k
    // Fee: 0.3% (30 basis points)
    // ========================================

    @payable
    @method({ name: 'btcAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public swapBtcForTokens(calldata: Calldata): BytesWriter {
        if (!this.isGraduated.value) {
            throw new Revert('Token has not graduated yet');
        }

        const btcAmount: u256 = calldata.readU256();
        if (btcAmount == u256.Zero) {
            throw new Revert('BTC amount must be greater than zero');
        }

        // Verify BTC payment to escrow address in TX outputs
        const outputs = Blockchain.tx.outputs;
        const escrow = this.escrowAddress.value;
        let totalToEscrow: u256 = u256.Zero;
        for (let i: i32 = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.to !== null && output.to == escrow) {
                totalToEscrow = SafeMath.add(totalToEscrow, u256.fromU64(output.value));
            }
        }
        if (totalToEscrow < btcAmount) {
            throw new Revert('Insufficient BTC payment to escrow');
        }

        const btcReserve: u256 = this.poolBtcReserve.value;
        const tokenReserve: u256 = this.poolTokenReserve.value;

        // Apply 0.3% fee: effective input = btcAmount * 997 / 1000
        const FEE_NUMERATOR: u256 = u256.fromU64(997);
        const FEE_DENOMINATOR: u256 = u256.fromU64(1000);
        const btcAmountWithFee: u256 = SafeMath.mul(btcAmount, FEE_NUMERATOR);

        // tokensOut = (tokenReserve * btcAmountWithFee) / (btcReserve * 1000 + btcAmountWithFee)
        const numerator: u256 = SafeMath.mul(tokenReserve, btcAmountWithFee);
        const denominator: u256 = SafeMath.add(
            SafeMath.mul(btcReserve, FEE_DENOMINATOR),
            btcAmountWithFee,
        );
        const tokensOut: u256 = SafeMath.div(numerator, denominator);

        if (tokensOut == u256.Zero) {
            throw new Revert('Insufficient output amount');
        }
        if (tokensOut >= tokenReserve) {
            throw new Revert('Not enough tokens in pool');
        }

        // Update pool reserves
        this.poolBtcReserve.value = SafeMath.add(btcReserve, btcAmount);
        this.poolTokenReserve.value = SafeMath.sub(tokenReserve, tokensOut);
        this.totalSwaps.value = SafeMath.add(this.totalSwaps.value, u256.One);

        // Transfer tokens from contract to buyer
        const sender = Blockchain.tx.sender;
        TransferHelper.transfer(this.tokenAddress.value, sender, tokensOut);

        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public swapTokensForBtc(calldata: Calldata): BytesWriter {
        if (!this.isGraduated.value) {
            throw new Revert('Token has not graduated yet');
        }

        const tokenAmount: u256 = calldata.readU256();
        if (tokenAmount == u256.Zero) {
            throw new Revert('Token amount must be greater than zero');
        }

        const btcReserve: u256 = this.poolBtcReserve.value;
        const tokenReserve: u256 = this.poolTokenReserve.value;

        // Take tokens from seller (must have approved first)
        const sender = Blockchain.tx.sender;
        TransferHelper.transferFrom(
            this.tokenAddress.value,
            sender,
            Blockchain.contractAddress,
            tokenAmount,
        );

        // Apply 0.3% fee: effective input = tokenAmount * 997 / 1000
        const FEE_NUMERATOR: u256 = u256.fromU64(997);
        const FEE_DENOMINATOR: u256 = u256.fromU64(1000);
        const tokenAmountWithFee: u256 = SafeMath.mul(tokenAmount, FEE_NUMERATOR);

        // btcOut = (btcReserve * tokenAmountWithFee) / (tokenReserve * 1000 + tokenAmountWithFee)
        const numerator: u256 = SafeMath.mul(btcReserve, tokenAmountWithFee);
        const denominator: u256 = SafeMath.add(
            SafeMath.mul(tokenReserve, FEE_DENOMINATOR),
            tokenAmountWithFee,
        );
        const btcOut: u256 = SafeMath.div(numerator, denominator);

        if (btcOut == u256.Zero) {
            throw new Revert('Insufficient output amount');
        }
        if (btcOut >= btcReserve) {
            throw new Revert('Not enough BTC in pool');
        }

        // Update pool reserves
        this.poolBtcReserve.value = SafeMath.sub(btcReserve, btcOut);
        this.poolTokenReserve.value = SafeMath.add(tokenReserve, tokenAmount);
        this.totalSwaps.value = SafeMath.add(this.totalSwaps.value, u256.One);

        // Record pending BTC withdrawal for the seller (same as sell())
        const prevPending = this.pendingWithdrawals.get(sender);
        this.pendingWithdrawals.set(sender, SafeMath.add(prevPending, btcOut));

        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    @method()
    @returns(
        { name: 'poolBtcReserve', type: ABIDataTypes.UINT256 },
        { name: 'poolTokenReserve', type: ABIDataTypes.UINT256 },
        { name: 'poolK', type: ABIDataTypes.UINT256 },
        { name: 'totalSwaps', type: ABIDataTypes.UINT256 },
        { name: 'isGraduated', type: ABIDataTypes.BOOL },
    )
    public getPoolState(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32 * 4 + 1);
        writer.writeU256(this.poolBtcReserve.value);
        writer.writeU256(this.poolTokenReserve.value);
        writer.writeU256(this.poolK.value);
        writer.writeU256(this.totalSwaps.value);
        writer.writeBoolean(this.isGraduated.value);
        return writer;
    }

    // ========================================
    // Escrow Methods
    // ========================================

    @view
    @method()
    @returns({ name: 'escrowAddress', type: ABIDataTypes.STRING })
    public getEscrowAddress(calldata: Calldata): BytesWriter {
        const addr = this.escrowAddress.value;
        const writer = new BytesWriter(4 + addr.length);
        writer.writeStringWithLength(addr);
        return writer;
    }

    @view
    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'pendingBtc', type: ABIDataTypes.UINT256 })
    public getPendingWithdrawal(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();
        const pending = this.pendingWithdrawals.get(user);
        const writer = new BytesWriter(32);
        writer.writeU256(pending);
        return writer;
    }

    @method(
        { name: 'user', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public markWithdrawalProcessed(calldata: Calldata): BytesWriter {
        const sender = Blockchain.tx.sender;
        if (sender !== this.owner.value) {
            throw new Revert('Only owner can mark withdrawals');
        }

        const user: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        const pending = this.pendingWithdrawals.get(user);
        if (pending < amount) {
            throw new Revert('Amount exceeds pending withdrawal');
        }

        this.pendingWithdrawals.set(user, SafeMath.sub(pending, amount));

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }
}
