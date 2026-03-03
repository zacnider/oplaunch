import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Address,
    Revert,
    StoredAddress,
    StoredU256,
    AddressMemoryMap,
    SafeMath,
    EMPTY_POINTER,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class StakingVault extends OP_NET {
    private static readonly PRECISION: u256 = u256.fromString('1000000000000000000');

    // Storage pointers
    private readonly ownerPointer: u16 = Blockchain.nextPointer;
    private readonly stakingTokenPointer: u16 = Blockchain.nextPointer;
    private readonly rewardTokenPointer: u16 = Blockchain.nextPointer;
    private readonly totalStakedPointer: u16 = Blockchain.nextPointer;
    private readonly rewardRatePointer: u16 = Blockchain.nextPointer;
    private readonly rewardPerTokenStoredPointer: u16 = Blockchain.nextPointer;
    private readonly lastUpdateBlockPointer: u16 = Blockchain.nextPointer;
    private readonly rewardEndBlockPointer: u16 = Blockchain.nextPointer;
    private readonly totalRewardsDistributedPointer: u16 = Blockchain.nextPointer;
    private readonly minStakeAmountPointer: u16 = Blockchain.nextPointer;
    private readonly userStakesPointer: u16 = Blockchain.nextPointer;
    private readonly userRewardPerTokenPaidPointer: u16 = Blockchain.nextPointer;
    private readonly userRewardsPointer: u16 = Blockchain.nextPointer;

    // Storage fields - initialized inline
    private owner: StoredAddress = new StoredAddress(this.ownerPointer);
    private stakingToken: StoredAddress = new StoredAddress(this.stakingTokenPointer);
    private rewardToken: StoredAddress = new StoredAddress(this.rewardTokenPointer);
    private totalStaked: StoredU256 = new StoredU256(this.totalStakedPointer, EMPTY_POINTER);
    private rewardRate: StoredU256 = new StoredU256(this.rewardRatePointer, EMPTY_POINTER);
    private rewardPerTokenStored: StoredU256 = new StoredU256(this.rewardPerTokenStoredPointer, EMPTY_POINTER);
    private lastUpdateBlock: StoredU256 = new StoredU256(this.lastUpdateBlockPointer, EMPTY_POINTER);
    private rewardEndBlock: StoredU256 = new StoredU256(this.rewardEndBlockPointer, EMPTY_POINTER);
    private totalRewardsDistributed: StoredU256 = new StoredU256(this.totalRewardsDistributedPointer, EMPTY_POINTER);
    private minStakeAmount: StoredU256 = new StoredU256(this.minStakeAmountPointer, EMPTY_POINTER);
    private userStakes: AddressMemoryMap = new AddressMemoryMap(this.userStakesPointer);
    private userRewardPerTokenPaid: AddressMemoryMap = new AddressMemoryMap(this.userRewardPerTokenPaidPointer);
    private userRewards: AddressMemoryMap = new AddressMemoryMap(this.userRewardsPointer);

    constructor() {
        super();
    }

    public override onDeployment(calldata: Calldata): void {
        const stakingTokenAddr: Address = calldata.readAddress();
        const rewardTokenAddr: Address = calldata.readAddress();
        const rewardRateValue: u256 = calldata.readU256();
        const rewardEndBlockValue: u256 = calldata.readU256();
        const minStake: u256 = calldata.readU256();

        this.owner.value = Blockchain.tx.sender;
        this.stakingToken.value = stakingTokenAddr;
        this.rewardToken.value = rewardTokenAddr;
        this.rewardRate.value = rewardRateValue;
        this.rewardEndBlock.value = rewardEndBlockValue;
        this.minStakeAmount.value = minStake;
        this.lastUpdateBlock.value = u256.fromU64(Blockchain.block.number);
        this.totalStaked.value = u256.Zero;
        this.rewardPerTokenStored.value = u256.Zero;
        this.totalRewardsDistributed.value = u256.Zero;
    }

    private _lastApplicableBlock(): u256 {
        const currentBlock = u256.fromU64(Blockchain.block.number);
        const endBlock = this.rewardEndBlock.value;

        if (currentBlock < endBlock) {
            return currentBlock;
        }
        return endBlock;
    }

    private _rewardPerToken(): u256 {
        const total = this.totalStaked.value;

        if (total == u256.Zero) {
            return this.rewardPerTokenStored.value;
        }

        const lastBlock = this.lastUpdateBlock.value;
        const applicableBlock = this._lastApplicableBlock();
        const blockDiff = SafeMath.sub(applicableBlock, lastBlock);
        const rewardAccrued = SafeMath.mul(blockDiff, this.rewardRate.value);
        const scaled = SafeMath.mul(rewardAccrued, StakingVault.PRECISION);
        const perToken = SafeMath.div(scaled, total);

        return SafeMath.add(this.rewardPerTokenStored.value, perToken);
    }

    private _earned(account: Address): u256 {
        const stakeAmount = this.userStakes.get(account);
        const currentRewardPerToken = this._rewardPerToken();
        const paidRewardPerToken = this.userRewardPerTokenPaid.get(account);
        const rewardDiff = SafeMath.sub(currentRewardPerToken, paidRewardPerToken);
        const newReward = SafeMath.div(
            SafeMath.mul(stakeAmount, rewardDiff),
            StakingVault.PRECISION,
        );

        return SafeMath.add(this.userRewards.get(account), newReward);
    }

    private _updateReward(account: Address): void {
        this.rewardPerTokenStored.value = this._rewardPerToken();
        this.lastUpdateBlock.value = this._lastApplicableBlock();

        this.userRewards.set(account, this._earned(account));
        this.userRewardPerTokenPaid.set(account, this.rewardPerTokenStored.value);
    }

    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public stake(calldata: Calldata): BytesWriter {
        const amount: u256 = calldata.readU256();

        if (amount == u256.Zero) {
            throw new Revert('Cannot stake zero');
        }

        if (amount < this.minStakeAmount.value) {
            throw new Revert('Amount below minimum stake');
        }

        const sender = Blockchain.tx.sender;
        this._updateReward(sender);

        const currentStake = this.userStakes.get(sender);
        this.userStakes.set(sender, SafeMath.add(currentStake, amount));
        this.totalStaked.value = SafeMath.add(this.totalStaked.value, amount);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public unstake(calldata: Calldata): BytesWriter {
        const amount: u256 = calldata.readU256();
        const sender = Blockchain.tx.sender;

        if (amount == u256.Zero) {
            throw new Revert('Cannot unstake zero');
        }

        const currentStake = this.userStakes.get(sender);
        if (amount > currentStake) {
            throw new Revert('Insufficient staked balance');
        }

        this._updateReward(sender);

        this.userStakes.set(sender, SafeMath.sub(currentStake, amount));
        this.totalStaked.value = SafeMath.sub(this.totalStaked.value, amount);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    @method()
    @returns({ name: 'reward', type: ABIDataTypes.UINT256 })
    public claimRewards(calldata: Calldata): BytesWriter {
        const sender = Blockchain.tx.sender;
        this._updateReward(sender);

        const reward = this.userRewards.get(sender);

        if (reward == u256.Zero) {
            throw new Revert('No rewards to claim');
        }

        this.userRewards.set(sender, u256.Zero);
        this.totalRewardsDistributed.value = SafeMath.add(
            this.totalRewardsDistributed.value,
            reward,
        );

        const writer = new BytesWriter(32);
        writer.writeU256(reward);
        return writer;
    }

    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'stakedAmount', type: ABIDataTypes.UINT256 },
        { name: 'pendingRewards', type: ABIDataTypes.UINT256 },
        { name: 'rewardPerTokenPaid', type: ABIDataTypes.UINT256 },
    )
    public getUserInfo(calldata: Calldata): BytesWriter {
        const user: Address = calldata.readAddress();
        const stakedAmount = this.userStakes.get(user);
        const pendingRewards = this._earned(user);
        const paidPerToken = this.userRewardPerTokenPaid.get(user);

        const writer = new BytesWriter(96);
        writer.writeU256(stakedAmount);
        writer.writeU256(pendingRewards);
        writer.writeU256(paidPerToken);
        return writer;
    }

    @method()
    @returns(
        { name: 'totalStaked', type: ABIDataTypes.UINT256 },
        { name: 'rewardRate', type: ABIDataTypes.UINT256 },
        { name: 'rewardEndBlock', type: ABIDataTypes.UINT256 },
        { name: 'rewardPerTokenStored', type: ABIDataTypes.UINT256 },
    )
    public getPoolInfo(calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(128);
        writer.writeU256(this.totalStaked.value);
        writer.writeU256(this.rewardRate.value);
        writer.writeU256(this.rewardEndBlock.value);
        writer.writeU256(this.rewardPerTokenStored.value);
        return writer;
    }
}
