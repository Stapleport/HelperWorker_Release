// 双签名（机器侧）：permit（EIP-2612）+ 意图（EIP-712）。签完即可下线——无许可协议的根基。
// 浏览器里的钱包签名不走本模块（wallet 的 signTypedData 自带域），前端只用 schema/intent 的纯函数部分。
import { createPublicClient, http } from 'viem';
import { INTENT_TYPES, imputePayDomain, permitTypes, buildPermitDomain } from './schema.js';
import { intentMessage } from './intent.js';

/** @typedef {import('./schema.js').Intent} Intent */
/** @typedef {import('./intent.js').ImputePayRef} ImputePayRef */

/**
 * 意图签名（EIP-712，域含 chainId + verifyingContract）。
 * @param {import('viem/accounts').PrivateKeyAccount} account
 * @param {ImputePayRef} cfg
 * @param {Intent} intent
 * @returns {Promise<string>} 65 字节 rsv 签名（viem Hex）
 */
export async function signIntent(account, cfg, intent) {
  return account.signTypedData({
    domain: imputePayDomain(cfg.chainId, cfg.imputepay),
    types: INTENT_TYPES,
    primaryType: 'Intent',
    message: intentMessage(intent),
  });
}

/** @typedef {{ permitSig: string, deadline: bigint, nonce: bigint }} PermitBundle */
/** @typedef {ImputePayRef & { token: string, tokenName: string, value: bigint, rpcUrl?: string, deadline: bigint }} PermitInput */

/**
 * permit 签名（EIP-2612）：spender = ImputePay、value = 总划扣（payeeAmount + maxHelperReward）、
 * deadline 与意图共用（Kit 约定，省一段 calldata）。tokenName 从代币合约 `name()` 读出后由调用方
 * 传入（本函数只发 nonces 一次读），OZ 系 permit 域 version 固定 "1"。
 *
 * @param {import('viem/accounts').PrivateKeyAccount} account
 * @param {PermitInput} cfg
 * @returns {Promise<PermitBundle>}
 */
export async function signPermit(account, cfg) {
  const client = createPublicClient({ transport: http(cfg.rpcUrl) });
  const permitNonce = await client.readContract({
    address: cfg.token,
    abi: [{ name: 'nonces', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'nonces',
    args: [account.address],
  });
  const deadline = cfg.deadline;
  const permitSig = await account.signTypedData({
    domain: buildPermitDomain(cfg.tokenName, cfg.chainId, cfg.token),
    types: permitTypes,
    primaryType: 'Permit',
    message: { owner: account.address, spender: cfg.imputepay, value: cfg.value, nonce: permitNonce, deadline },
  });
  return { permitSig, deadline, nonce: permitNonce };
}
