import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Address,
    Revert,
    StoredAddress,
    StoredBoolean,
    StoredString,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class OpLaunchToken extends OP20 {
    // Storage pointers
    private readonly creatorPointer: u16 = Blockchain.nextPointer;
    private readonly bondingCurvePointer: u16 = Blockchain.nextPointer;
    private readonly graduatedPointer: u16 = Blockchain.nextPointer;
    private readonly descriptionPointer: u16 = Blockchain.nextPointer;
    private readonly imageUrlPointer: u16 = Blockchain.nextPointer;

    // Storage fields - initialized inline
    private creator: StoredAddress = new StoredAddress(this.creatorPointer);
    private bondingCurveAddress: StoredAddress = new StoredAddress(this.bondingCurvePointer);
    private graduated: StoredBoolean = new StoredBoolean(this.graduatedPointer, false);
    private description: StoredString = new StoredString(this.descriptionPointer, 0);
    private imageUrl: StoredString = new StoredString(this.imageUrlPointer, 1);

    constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        const tokenName: string = calldata.readStringWithLength();
        const tokenSymbol: string = calldata.readStringWithLength();
        const maxSupply: u256 = calldata.readU256();
        const decimals: u8 = calldata.readU8();
        const desc: string = calldata.readStringWithLength();
        const img: string = calldata.readStringWithLength();
        const curveAddr: Address = calldata.readAddress();

        this.instantiate(new OP20InitParameters(maxSupply, decimals, tokenName, tokenSymbol, img));

        this.creator.value = Blockchain.tx.sender;
        this.description.value = desc;
        this.imageUrl.value = img;
        this.graduated.value = false;
        this.bondingCurveAddress.value = curveAddr;

        // Mint all tokens to deployer, then transfer to bonding curve
        this._mint(Blockchain.tx.sender, maxSupply);
        this._transfer(Blockchain.tx.sender, curveAddr, maxSupply);
    }

    @method({ name: 'curveAddr', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setBondingCurve(calldata: Calldata): BytesWriter {
        this.onlyDeployer(Blockchain.tx.sender);

        const curveAddr: Address = calldata.readAddress();
        this.bondingCurveAddress.value = curveAddr;

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public setGraduated(calldata: Calldata): BytesWriter {
        const sender = Blockchain.tx.sender;
        const curveAddr = this.bondingCurveAddress.value;

        if (sender !== curveAddr) {
            throw new Revert('Only bonding curve can graduate token');
        }

        this.graduated.value = true;

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method()
    @returns(
        { name: 'creator', type: ABIDataTypes.ADDRESS },
        { name: 'bondingCurve', type: ABIDataTypes.ADDRESS },
        { name: 'isGraduated', type: ABIDataTypes.BOOL },
        { name: 'description', type: ABIDataTypes.STRING },
        { name: 'imageUrl', type: ABIDataTypes.STRING },
    )
    public getTokenMetadata(calldata: Calldata): BytesWriter {
        const creatorAddr = this.creator.value;
        const curveAddr = this.bondingCurveAddress.value;
        const isGraduated = this.graduated.value;
        const desc = this.description.value;
        const img = this.imageUrl.value;

        const writer = new BytesWriter(512);
        writer.writeAddress(creatorAddr);
        writer.writeAddress(curveAddr);
        writer.writeBoolean(isGraduated);
        writer.writeStringWithLength(desc);
        writer.writeStringWithLength(img);
        return writer;
    }
}
