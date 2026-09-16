// 意图 schema 与两组 EIP-712 域（m1-spec v2 七字段，成员顺序即合约 struct 顺序）。
// 口径唯一来源：总库 plans/pay-m1-spec.md；与合约 EIP712Upgradeable("ImputePay","1") 逐字一致。
// Kit 只出机制：链 / 合约地址 / 代币名一律由调用方注入，本目录零 IO、零 import.meta.env，
// node --test 与浏览器 / worker 打包（esbuild）均可直跑。

/** @typedef {{ payee: string, payeeAmount: bigint, token: string, maxHelperReward: bigint, chainId: bigint, nonce: bigint, deadline: bigint }} Intent */

/** EIP-712 意图类型（字段顺序 = 合约 Intent struct 顺序，勿动） */
export const INTENT_TYPES = {
  Intent: [
    { name: 'payee', type: 'address' },
    { name: 'payeeAmount', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'maxHelperReward', type: 'uint256' },
    { name: 'chainId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** 事件口径 typehash 原串（合约 INTENT_TYPEHASH 同串；intentHash 的 keccak 输入） */
export const INTENT_TYPEHASH_STRING =
  'Intent(address payee,uint256 payeeAmount,address token,uint256 maxHelperReward,uint256 chainId,uint256 nonce,uint256 deadline)';

/** 意图域：与合约 EIP712Upgradeable("ImputePay","1") 逐字一致；chainId 双保险（域名含 + execute 首行核对） */
export const imputePayDomain = (chainId, verifyingContract) => ({
  name: 'ImputePay',
  version: '1',
  chainId,
  verifyingContract,
});

/** EIP-2612 permit 类型（ spender = ImputePay、value = 总划扣、deadline 与意图共用——SDK/Kit 约定） */
export const permitTypes = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** permit 域：代币自己的 EIP-2612 域（name 从代币合约 `name()` 读，OZ 系 version 固定 "1"） */
export const buildPermitDomain = (tokenName, chainId, token) => ({
  name: tokenName,
  version: '1',
  chainId,
  verifyingContract: token,
});
