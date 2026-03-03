import { ABIDataTypes } from '@btc-vision/transaction';
import { BitcoinAbiTypes } from 'opnet';

const F = BitcoinAbiTypes.Function;

// OP_20 Standard Token ABI
export const OP20_ABI = [
  {
    name: 'balanceOf',
    type: F,
    constant: true,
    inputs: [{ name: 'owner', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'balance', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'increaseAllowance',
    type: F,
    inputs: [
      { name: 'spender', type: ABIDataTypes.ADDRESS },
      { name: 'amount', type: ABIDataTypes.UINT256 },
    ],
    outputs: [],
  },
  {
    name: 'allowance',
    type: F,
    constant: true,
    inputs: [
      { name: 'owner', type: ABIDataTypes.ADDRESS },
      { name: 'spender', type: ABIDataTypes.ADDRESS },
    ],
    outputs: [{ name: 'remaining', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'transfer',
    type: F,
    inputs: [
      { name: 'to', type: ABIDataTypes.ADDRESS },
      { name: 'amount', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  {
    name: 'totalSupply',
    type: F,
    constant: true,
    inputs: [],
    outputs: [{ name: 'supply', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'name',
    type: F,
    constant: true,
    inputs: [],
    outputs: [{ name: 'name', type: ABIDataTypes.STRING }],
  },
  {
    name: 'symbol',
    type: F,
    constant: true,
    inputs: [],
    outputs: [{ name: 'symbol', type: ABIDataTypes.STRING }],
  },
  {
    name: 'decimals',
    type: F,
    constant: true,
    inputs: [],
    outputs: [{ name: 'decimals', type: ABIDataTypes.UINT8 }],
  },
];

// OpLaunchToken metadata ABI (extends OP_20)
export const TOKEN_METADATA_ABI = [
  {
    name: 'getTokenMetadata',
    type: F,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'creator', type: ABIDataTypes.ADDRESS },
      { name: 'bondingCurve', type: ABIDataTypes.ADDRESS },
      { name: 'isGraduated', type: ABIDataTypes.BOOL },
      { name: 'description', type: ABIDataTypes.STRING },
      { name: 'imageUrl', type: ABIDataTypes.STRING },
    ],
  },
  {
    name: 'setBondingCurve',
    type: F,
    inputs: [{ name: 'curveAddr', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
];

// BondingCurve ABI
export const BONDING_CURVE_ABI = [
  {
    name: 'buy',
    type: F,
    payable: true,
    inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'tokensOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'sell',
    type: F,
    inputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'btcOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getCurveState',
    type: F,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'virtualBtcReserve', type: ABIDataTypes.UINT256 },
      { name: 'virtualTokenReserve', type: ABIDataTypes.UINT256 },
      { name: 'realBtcCollected', type: ABIDataTypes.UINT256 },
      { name: 'targetMarketCap', type: ABIDataTypes.UINT256 },
      { name: 'tokensSold', type: ABIDataTypes.UINT256 },
      { name: 'tokensRemaining', type: ABIDataTypes.UINT256 },
      { name: 'totalTrades', type: ABIDataTypes.UINT256 },
      { name: 'isActive', type: ABIDataTypes.BOOL },
      { name: 'isGraduated', type: ABIDataTypes.BOOL },
    ],
  },
  {
    name: 'getTokensForBtc',
    type: F,
    constant: true,
    inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'tokensOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getBtcForTokens',
    type: F,
    constant: true,
    inputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'btcOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getUserPosition',
    type: F,
    constant: true,
    inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
    outputs: [
      { name: 'btcDeposited', type: ABIDataTypes.UINT256 },
      { name: 'tokensBought', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'setTokenAddress',
    type: F,
    inputs: [{ name: 'tokenAddr', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  // AMM Pool methods (post-graduation)
  {
    name: 'swapBtcForTokens',
    type: F,
    payable: true,
    inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'tokensOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'swapTokensForBtc',
    type: F,
    inputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'btcOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getPoolState',
    type: F,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'poolBtcReserve', type: ABIDataTypes.UINT256 },
      { name: 'poolTokenReserve', type: ABIDataTypes.UINT256 },
      { name: 'poolK', type: ABIDataTypes.UINT256 },
      { name: 'totalSwaps', type: ABIDataTypes.UINT256 },
      { name: 'isGraduated', type: ABIDataTypes.BOOL },
    ],
  },
  // Escrow methods
  {
    name: 'getEscrowAddress',
    type: F,
    constant: true,
    inputs: [],
    outputs: [{ name: 'escrowAddress', type: ABIDataTypes.STRING }],
  },
  {
    name: 'getPendingWithdrawal',
    type: F,
    constant: true,
    inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'pendingBtc', type: ABIDataTypes.UINT256 }],
  },
];

export const STAKING_VAULT_ABI = [
  {
    name: 'stake',
    type: F,
    inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  {
    name: 'unstake',
    type: F,
    inputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
  },
  {
    name: 'claimRewards',
    type: F,
    inputs: [],
    outputs: [{ name: 'reward', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getUserInfo',
    type: F,
    constant: true,
    inputs: [{ name: 'user', type: ABIDataTypes.ADDRESS }],
    outputs: [
      { name: 'stakedAmount', type: ABIDataTypes.UINT256 },
      { name: 'pendingRewards', type: ABIDataTypes.UINT256 },
      { name: 'rewardPerTokenPaid', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'getPoolInfo',
    type: F,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'totalStaked', type: ABIDataTypes.UINT256 },
      { name: 'rewardRate', type: ABIDataTypes.UINT256 },
      { name: 'rewardEndBlock', type: ABIDataTypes.UINT256 },
    ],
  },
];
