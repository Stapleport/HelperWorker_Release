// 验签（helper 侧）：从双签名恢复付方地址。签名不对/消息被改时 viem 会恢复出别的地址，
// 所以「恢复地址 ≠ 预期付方」的判定在调用侧做——意图里没有 payer 字段，恢复值即 payer。
import { recoverTypedDataAddress } from 'viem';
import { INTENT_TYPES, imputePayDomain } from './schema.js';
import { intentMessage } from './intent.js';

/** @typedef {import('./schema.js').Intent} Intent */
/** @typedef {import('./intent.js').ImputePayRef} ImputePayRef */

/**
 * 验签并恢复付方地址。
 * @param {ImputePayRef} cfg
 * @param {Intent} intent
 * @param {string} intentSig
 * @returns {Promise<string>} 付方地址（签名无效时是错误地址而非异常——调用方比对）
 */
export function recoverPayer(cfg, intent, intentSig) {
  return recoverTypedDataAddress({
    domain: imputePayDomain(cfg.chainId, cfg.imputepay),
    types: INTENT_TYPES,
    primaryType: 'Intent',
    message: intentMessage(intent),
    signature: intentSig,
  });
}
