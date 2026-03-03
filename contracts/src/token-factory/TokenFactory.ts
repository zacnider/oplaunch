import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Address,
    Revert,
    StoredU256,
    StoredAddress,
    SafeMath,
    EMPTY_POINTER,
    StoredMapU256,
    encodePointerUnknownLength,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class TokenFactory extends OP_NET {
    // Fixed bonding curve parameters
    private static readonly TOKEN_SUPPLY: u256 = u256.fromString(
        '1000000000000000000000000000',
    ); // 1 billion * 10^18
    private static readonly INITIAL_VIRTUAL_BTC: u256 = u256.fromU64(100000000); // 1 BTC in sats
    private static readonly GRADUATION_TARGET: u256 = u256.fromU64(30000000); // 0.3 BTC in sats

    // Swap fee: 0.3% (3 out of 1000)
    private static readonly SWAP_FEE_NUMERATOR: u256 = u256.fromU32(997);
    private static readonly SWAP_FEE_DENOMINATOR: u256 = u256.fromU32(1000);

    // ---- Global state ----
    private readonly tokenCountPointer: u16 = Blockchain.nextPointer;
    private readonly ownerPointer: u16 = Blockchain.nextPointer;

    private tokenCount: StoredU256 = new StoredU256(this.tokenCountPointer, EMPTY_POINTER);
    private owner: StoredAddress = new StoredAddress(this.ownerPointer);

    // ---- Per-token curve state (tokenId -> u256) via StoredMapU256 ----
    private readonly creatorPointer: u16 = Blockchain.nextPointer;
    private readonly virtualBtcReservePointer: u16 = Blockchain.nextPointer;
    private readonly virtualTokenReservePointer: u16 = Blockchain.nextPointer;
    private readonly kConstantPointer: u16 = Blockchain.nextPointer;
    private readonly realBtcCollectedPointer: u16 = Blockchain.nextPointer;
    private readonly tokensSoldPointer: u16 = Blockchain.nextPointer;
    private readonly tokensRemainingPointer: u16 = Blockchain.nextPointer;
    private readonly totalTradesPointer: u16 = Blockchain.nextPointer;
    private readonly isActivePointer: u16 = Blockchain.nextPointer;
    private readonly isGraduatedPointer: u16 = Blockchain.nextPointer;

    private creatorMap: StoredMapU256 = new StoredMapU256(this.creatorPointer);
    private virtualBtcReserveMap: StoredMapU256 = new StoredMapU256(
        this.virtualBtcReservePointer,
    );
    private virtualTokenReserveMap: StoredMapU256 = new StoredMapU256(
        this.virtualTokenReservePointer,
    );
    private kConstantMap: StoredMapU256 = new StoredMapU256(this.kConstantPointer);
    private realBtcCollectedMap: StoredMapU256 = new StoredMapU256(
        this.realBtcCollectedPointer,
    );
    private tokensSoldMap: StoredMapU256 = new StoredMapU256(this.tokensSoldPointer);
    private tokensRemainingMap: StoredMapU256 = new StoredMapU256(
        this.tokensRemainingPointer,
    );
    private totalTradesMap: StoredMapU256 = new StoredMapU256(this.totalTradesPointer);
    private isActiveMap: StoredMapU256 = new StoredMapU256(this.isActivePointer);
    private isGraduatedMap: StoredMapU256 = new StoredMapU256(this.isGraduatedPointer);

    // ---- Per-token-per-user state (computed 2D keys) ----
    private readonly userBalancesPointer: u16 = Blockchain.nextPointer;
    private readonly userBtcDepositsPointer: u16 = Blockchain.nextPointer;

    // ---- AMM Pool state for graduated tokens ----
    private readonly poolBtcReservePointer: u16 = Blockchain.nextPointer;
    private readonly poolTokenReservePointer: u16 = Blockchain.nextPointer;
    private readonly poolKPointer: u16 = Blockchain.nextPointer;
    private readonly poolTotalSwapsPointer: u16 = Blockchain.nextPointer;

    private poolBtcReserveMap: StoredMapU256 = new StoredMapU256(this.poolBtcReservePointer);
    private poolTokenReserveMap: StoredMapU256 = new StoredMapU256(this.poolTokenReservePointer);
    private poolKMap: StoredMapU256 = new StoredMapU256(this.poolKPointer);
    private poolTotalSwapsMap: StoredMapU256 = new StoredMapU256(this.poolTotalSwapsPointer);

    constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        this.owner.value = Blockchain.tx.sender;
        this.tokenCount.value = u256.Zero;
    }

    // ---- 2D Storage Helpers ----
    private _compute2DKey(pointer: u16, tokenId: u256, user: Address): Uint8Array {
        const writer = new BytesWriter(64);
        writer.writeU256(tokenId);
        writer.writeAddress(user);
        return encodePointerUnknownLength(pointer, writer.getBuffer());
    }

    private _get2D(pointer: u16, tokenId: u256, user: Address): u256 {
        const key = this._compute2DKey(pointer, tokenId, user);
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(key));
    }

    private _set2D(pointer: u16, tokenId: u256, user: Address, value: u256): void {
        const key = this._compute2DKey(pointer, tokenId, user);
        Blockchain.setStorageAt(key, value.toUint8Array(true));
    }

    // ---- Bonding Curve Math (constant product: k = virtualBtc * virtualToken) ----
    private _getTokensForBtc(tokenId: u256, btcAmount: u256): u256 {
        const currentBtcReserve = this.virtualBtcReserveMap.get(tokenId);
        const currentTokenReserve = this.virtualTokenReserveMap.get(tokenId);
        const k = this.kConstantMap.get(tokenId);

        const newBtcReserve = SafeMath.add(currentBtcReserve, btcAmount);
        const newTokenReserve = SafeMath.div(k, newBtcReserve);
        return SafeMath.sub(currentTokenReserve, newTokenReserve);
    }

    private _getBtcForTokens(tokenId: u256, tokenAmount: u256): u256 {
        const currentBtcReserve = this.virtualBtcReserveMap.get(tokenId);
        const currentTokenReserve = this.virtualTokenReserveMap.get(tokenId);
        const k = this.kConstantMap.get(tokenId);

        const newTokenReserve = SafeMath.add(currentTokenReserve, tokenAmount);
        const newBtcReserve = SafeMath.div(k, newTokenReserve);
        return SafeMath.sub(currentBtcReserve, newBtcReserve);
    }

    // ---- Graduation: set up AMM liquidity pool ----
    private _graduateToken(tokenId: u256): void {
        this.isActiveMap.set(tokenId, u256.Zero);
        this.isGraduatedMap.set(tokenId, u256.One);

        // Create AMM pool from collected BTC + remaining tokens
        const poolBtc = this.realBtcCollectedMap.get(tokenId);
        const poolTokens = this.tokensRemainingMap.get(tokenId);

        this.poolBtcReserveMap.set(tokenId, poolBtc);
        this.poolTokenReserveMap.set(tokenId, poolTokens);
        this.poolKMap.set(tokenId, SafeMath.mul(poolBtc, poolTokens));
        this.poolTotalSwapsMap.set(tokenId, u256.Zero);
    }

    // ========== PUBLIC METHODS ==========

    @method()
    @returns({ name: 'tokenId', type: ABIDataTypes.UINT256 })
    public createToken(calldata: Calldata): BytesWriter {
        const tokenId = this.tokenCount.value;
        const supply = TokenFactory.TOKEN_SUPPLY;
        const initialBtc = TokenFactory.INITIAL_VIRTUAL_BTC;

        // Store creator address as u256
        this.creatorMap.set(tokenId, u256.fromUint8ArrayBE(Blockchain.tx.sender));

        // Initialize bonding curve for this token
        this.virtualBtcReserveMap.set(tokenId, initialBtc);
        this.virtualTokenReserveMap.set(tokenId, supply);
        this.kConstantMap.set(tokenId, SafeMath.mul(initialBtc, supply));
        this.realBtcCollectedMap.set(tokenId, u256.Zero);
        this.tokensSoldMap.set(tokenId, u256.Zero);
        this.tokensRemainingMap.set(tokenId, supply);
        this.totalTradesMap.set(tokenId, u256.Zero);
        this.isActiveMap.set(tokenId, u256.One);
        this.isGraduatedMap.set(tokenId, u256.Zero);

        // Increment token count
        this.tokenCount.value = SafeMath.add(tokenId, u256.One);

        const writer = new BytesWriter(32);
        writer.writeU256(tokenId);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'btcAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public buy(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const btcAmount: u256 = calldata.readU256();

        if (this.isActiveMap.get(tokenId) != u256.One) {
            throw new Revert('Token is not active');
        }
        if (btcAmount == u256.Zero) {
            throw new Revert('BTC amount must be greater than zero');
        }

        const tokensOut = this._getTokensForBtc(tokenId, btcAmount);
        const remaining = this.tokensRemainingMap.get(tokenId);

        if (tokensOut > remaining) {
            throw new Revert('Not enough tokens remaining');
        }

        // Update reserves
        this.virtualBtcReserveMap.set(
            tokenId,
            SafeMath.add(this.virtualBtcReserveMap.get(tokenId), btcAmount),
        );
        this.virtualTokenReserveMap.set(
            tokenId,
            SafeMath.sub(this.virtualTokenReserveMap.get(tokenId), tokensOut),
        );

        // Update stats
        this.realBtcCollectedMap.set(
            tokenId,
            SafeMath.add(this.realBtcCollectedMap.get(tokenId), btcAmount),
        );
        this.tokensSoldMap.set(
            tokenId,
            SafeMath.add(this.tokensSoldMap.get(tokenId), tokensOut),
        );
        this.tokensRemainingMap.set(
            tokenId,
            SafeMath.sub(this.tokensRemainingMap.get(tokenId), tokensOut),
        );
        this.totalTradesMap.set(
            tokenId,
            SafeMath.add(this.totalTradesMap.get(tokenId), u256.One),
        );

        // Update user position
        const sender = Blockchain.tx.sender;
        const prevBalance = this._get2D(this.userBalancesPointer, tokenId, sender);
        this._set2D(
            this.userBalancesPointer,
            tokenId,
            sender,
            SafeMath.add(prevBalance, tokensOut),
        );

        const prevDeposit = this._get2D(this.userBtcDepositsPointer, tokenId, sender);
        this._set2D(
            this.userBtcDepositsPointer,
            tokenId,
            sender,
            SafeMath.add(prevDeposit, btcAmount),
        );

        // Check graduation
        if (this.realBtcCollectedMap.get(tokenId) >= TokenFactory.GRADUATION_TARGET) {
            this._graduateToken(tokenId);
        }

        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public sell(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const tokenAmount: u256 = calldata.readU256();

        if (this.isActiveMap.get(tokenId) != u256.One) {
            throw new Revert('Token is not active');
        }
        if (tokenAmount == u256.Zero) {
            throw new Revert('Token amount must be greater than zero');
        }

        // Check user balance
        const sender = Blockchain.tx.sender;
        const userBalance = this._get2D(this.userBalancesPointer, tokenId, sender);
        if (tokenAmount > userBalance) {
            throw new Revert('Insufficient token balance');
        }

        const btcOut = this._getBtcForTokens(tokenId, tokenAmount);
        if (btcOut > this.realBtcCollectedMap.get(tokenId)) {
            throw new Revert('Not enough BTC in reserves');
        }

        // Update reserves
        this.virtualTokenReserveMap.set(
            tokenId,
            SafeMath.add(this.virtualTokenReserveMap.get(tokenId), tokenAmount),
        );
        this.virtualBtcReserveMap.set(
            tokenId,
            SafeMath.sub(this.virtualBtcReserveMap.get(tokenId), btcOut),
        );

        // Update stats
        this.realBtcCollectedMap.set(
            tokenId,
            SafeMath.sub(this.realBtcCollectedMap.get(tokenId), btcOut),
        );
        this.tokensSoldMap.set(
            tokenId,
            SafeMath.sub(this.tokensSoldMap.get(tokenId), tokenAmount),
        );
        this.tokensRemainingMap.set(
            tokenId,
            SafeMath.add(this.tokensRemainingMap.get(tokenId), tokenAmount),
        );
        this.totalTradesMap.set(
            tokenId,
            SafeMath.add(this.totalTradesMap.get(tokenId), u256.One),
        );

        // Update user position
        this._set2D(
            this.userBalancesPointer,
            tokenId,
            sender,
            SafeMath.sub(userBalance, tokenAmount),
        );

        const prevDeposit = this._get2D(this.userBtcDepositsPointer, tokenId, sender);
        if (prevDeposit >= btcOut) {
            this._set2D(
                this.userBtcDepositsPointer,
                tokenId,
                sender,
                SafeMath.sub(prevDeposit, btcOut),
            );
        }

        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    // ========== AMM SWAP METHODS (for graduated tokens) ==========

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'btcAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public swapBtcForTokens(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const btcAmount: u256 = calldata.readU256();

        if (this.isGraduatedMap.get(tokenId) != u256.One) {
            throw new Revert('Token has not graduated');
        }
        if (btcAmount == u256.Zero) {
            throw new Revert('Amount must be greater than zero');
        }

        const poolBtc = this.poolBtcReserveMap.get(tokenId);
        const poolTokens = this.poolTokenReserveMap.get(tokenId);
        const poolK = this.poolKMap.get(tokenId);

        // Apply 0.3% fee: effective input = btcAmount * 997 / 1000
        const btcWithFee = SafeMath.mul(btcAmount, TokenFactory.SWAP_FEE_NUMERATOR);
        const newPoolBtcScaled = SafeMath.add(
            SafeMath.mul(poolBtc, TokenFactory.SWAP_FEE_DENOMINATOR),
            btcWithFee,
        );
        // newPoolTokens = poolK * 1000 / newPoolBtcScaled
        const newPoolTokens = SafeMath.div(
            SafeMath.mul(poolK, TokenFactory.SWAP_FEE_DENOMINATOR),
            newPoolBtcScaled,
        );
        const tokensOut = SafeMath.sub(poolTokens, newPoolTokens);

        if (tokensOut > poolTokens) {
            throw new Revert('Not enough tokens in pool');
        }

        // Update pool reserves
        this.poolBtcReserveMap.set(tokenId, SafeMath.add(poolBtc, btcAmount));
        this.poolTokenReserveMap.set(tokenId, SafeMath.sub(poolTokens, tokensOut));
        this.poolTotalSwapsMap.set(
            tokenId,
            SafeMath.add(this.poolTotalSwapsMap.get(tokenId), u256.One),
        );

        // Credit tokens to user
        const sender = Blockchain.tx.sender;
        const prevBalance = this._get2D(this.userBalancesPointer, tokenId, sender);
        this._set2D(
            this.userBalancesPointer,
            tokenId,
            sender,
            SafeMath.add(prevBalance, tokensOut),
        );

        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public swapTokensForBtc(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const tokenAmount: u256 = calldata.readU256();

        if (this.isGraduatedMap.get(tokenId) != u256.One) {
            throw new Revert('Token has not graduated');
        }
        if (tokenAmount == u256.Zero) {
            throw new Revert('Amount must be greater than zero');
        }

        // Check user balance
        const sender = Blockchain.tx.sender;
        const userBalance = this._get2D(this.userBalancesPointer, tokenId, sender);
        if (tokenAmount > userBalance) {
            throw new Revert('Insufficient token balance');
        }

        const poolBtc = this.poolBtcReserveMap.get(tokenId);
        const poolTokens = this.poolTokenReserveMap.get(tokenId);
        const poolK = this.poolKMap.get(tokenId);

        // Apply 0.3% fee: effective input = tokenAmount * 997 / 1000
        const tokensWithFee = SafeMath.mul(tokenAmount, TokenFactory.SWAP_FEE_NUMERATOR);
        const newPoolTokensScaled = SafeMath.add(
            SafeMath.mul(poolTokens, TokenFactory.SWAP_FEE_DENOMINATOR),
            tokensWithFee,
        );
        const newPoolBtc = SafeMath.div(
            SafeMath.mul(poolK, TokenFactory.SWAP_FEE_DENOMINATOR),
            newPoolTokensScaled,
        );
        const btcOut = SafeMath.sub(poolBtc, newPoolBtc);

        if (btcOut > poolBtc) {
            throw new Revert('Not enough BTC in pool');
        }

        // Update pool reserves
        this.poolTokenReserveMap.set(tokenId, SafeMath.add(poolTokens, tokenAmount));
        this.poolBtcReserveMap.set(tokenId, SafeMath.sub(poolBtc, btcOut));
        this.poolTotalSwapsMap.set(
            tokenId,
            SafeMath.add(this.poolTotalSwapsMap.get(tokenId), u256.One),
        );

        // Debit tokens from user
        this._set2D(
            this.userBalancesPointer,
            tokenId,
            sender,
            SafeMath.sub(userBalance, tokenAmount),
        );

        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    // ========== READ METHODS ==========

    @method({ name: 'tokenId', type: ABIDataTypes.UINT256 })
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
        const tokenId: u256 = calldata.readU256();

        const writer = new BytesWriter(32 * 7 + 2);
        writer.writeU256(this.virtualBtcReserveMap.get(tokenId));
        writer.writeU256(this.virtualTokenReserveMap.get(tokenId));
        writer.writeU256(this.realBtcCollectedMap.get(tokenId));
        writer.writeU256(TokenFactory.GRADUATION_TARGET);
        writer.writeU256(this.tokensSoldMap.get(tokenId));
        writer.writeU256(this.tokensRemainingMap.get(tokenId));
        writer.writeU256(this.totalTradesMap.get(tokenId));
        writer.writeBoolean(this.isActiveMap.get(tokenId) == u256.One);
        writer.writeBoolean(this.isGraduatedMap.get(tokenId) == u256.One);
        return writer;
    }

    @method({ name: 'tokenId', type: ABIDataTypes.UINT256 })
    @returns(
        { name: 'btcReserve', type: ABIDataTypes.UINT256 },
        { name: 'tokenReserve', type: ABIDataTypes.UINT256 },
        { name: 'totalSwaps', type: ABIDataTypes.UINT256 },
    )
    public getPoolState(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();

        const writer = new BytesWriter(32 * 3);
        writer.writeU256(this.poolBtcReserveMap.get(tokenId));
        writer.writeU256(this.poolTokenReserveMap.get(tokenId));
        writer.writeU256(this.poolTotalSwapsMap.get(tokenId));
        return writer;
    }

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getTokenCount(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(32);
        writer.writeU256(this.tokenCount.value);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'user', type: ABIDataTypes.ADDRESS },
    )
    @returns({ name: 'balance', type: ABIDataTypes.UINT256 })
    public balanceOf(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const user: Address = calldata.readAddress();

        const balance = this._get2D(this.userBalancesPointer, tokenId, user);

        const writer = new BytesWriter(32);
        writer.writeU256(balance);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'user', type: ABIDataTypes.ADDRESS },
    )
    @returns(
        { name: 'btcDeposited', type: ABIDataTypes.UINT256 },
        { name: 'tokensBought', type: ABIDataTypes.UINT256 },
    )
    public getUserPosition(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const user: Address = calldata.readAddress();

        const btcDeposited = this._get2D(this.userBtcDepositsPointer, tokenId, user);
        const tokensBought = this._get2D(this.userBalancesPointer, tokenId, user);

        const writer = new BytesWriter(64);
        writer.writeU256(btcDeposited);
        writer.writeU256(tokensBought);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'btcAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'tokensOut', type: ABIDataTypes.UINT256 })
    public getTokensForBtc(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const btcAmount: u256 = calldata.readU256();
        const tokensOut = this._getTokensForBtc(tokenId, btcAmount);

        const writer = new BytesWriter(32);
        writer.writeU256(tokensOut);
        return writer;
    }

    @method(
        { name: 'tokenId', type: ABIDataTypes.UINT256 },
        { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'btcOut', type: ABIDataTypes.UINT256 })
    public getBtcForTokens(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const tokenAmount: u256 = calldata.readU256();
        const btcOut = this._getBtcForTokens(tokenId, tokenAmount);

        const writer = new BytesWriter(32);
        writer.writeU256(btcOut);
        return writer;
    }

    @method({ name: 'tokenId', type: ABIDataTypes.UINT256 })
    @returns({ name: 'creator', type: ABIDataTypes.UINT256 })
    public getTokenCreator(calldata: Calldata): BytesWriter {
        const tokenId: u256 = calldata.readU256();
        const creatorU256 = this.creatorMap.get(tokenId);

        const writer = new BytesWriter(32);
        writer.writeU256(creatorU256);
        return writer;
    }
}
