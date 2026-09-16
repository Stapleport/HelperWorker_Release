// 意图构造 / 编码 / 口径 hash / 形状收敛。纯函数，零 IO。
import { keccak256, toHex, encodeAbiParameters, isAddress } from 'viem';
import { INTENT_TYPEHASH_STRING } from './schema.js';

/** @typedef {import('./schema.js').Intent} Intent */

/** @typedef {{ chainId: bigint, imputepay: string }} ImputePayRef */

/**
 * 组装意图；nonce/deadline 缺省时自动补（nonce 用时间戳低位——链上重跑免撞 nonce 位图，
 * deadline 默认 1 小时）。
 *
 * @param {{ payee: string, payeeAmount: bigint, token: string, maxHelperReward: bigint, chainId?: bigint, nonce?: bigint, deadline?: bigint }} input
 * @param {ImputePayRef} cfg
 * @param {{ now?: number, ttlSeconds?: number }} [opts]
 * @returns {Intent}
 */
export function buildIntent(input, cfg, { now = Date.now(), ttlSeconds = 3600 } = {}) {
  return {
    payee: input.payee,
    payeeAmount: input.payeeAmount,
    token: input.token,
    maxHelperReward: input.maxHelperReward,
    chainId: cfg.chainId,
    nonce: input.nonce ?? BigInt(now) % 4294967296n,
    deadline: input.deadline ?? BigInt(Math.floor(now / 1000) + ttlSeconds),
  };
}

/** EIP-712 typed-data 的 message 体（具名七字段；顺序无关，口径由 types 决定） */
export const intentMessage = (intent) => ({
  payee: intent.payee,
  payeeAmount: intent.payeeAmount,
  token: intent.token,
  maxHelperReward: intent.maxHelperReward,
  chainId: intent.chainId,
  nonce: intent.nonce,
  deadline: intent.deadline,
});

/** 合约 execute/executeBatch 的 struct 实参顺序（= Intent 成员声明顺序） */
export const intentToArgs = (intent) => [
  intent.payee,
  intent.payeeAmount,
  intent.token,
  intent.maxHelperReward,
  intent.chainId,
  intent.nonce,
  intent.deadline,
];

/**
 * intentHash（事件口径 struct hash，规格 §1.2/§3）：keccak(abi.encode(TYPEHASH, 七字段))。
 * 注意不是 EIP-712 digest（不含域分隔）——链上 PaymentExecuted 事件带的、回执对账用的都是它。
 */
export function intentHash(intent) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' },
        { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' },
      ],
      [keccak256(toHex(INTENT_TYPEHASH_STRING)), ...intentToArgs(intent)],
    ),
  );
}

/**
 * 意图 → JSON 安全对象（bigint 全部字符串化）；传输 / KV 队列存取用，
 * 读回时走 normalizeIntent 收敛。
 * @returns {Record<string,string>}
 */
export function serializeIntent(intent) {
  return {
    payee: intent.payee,
    payeeAmount: String(intent.payeeAmount),
    token: intent.token,
    maxHelperReward: String(intent.maxHelperReward),
    chainId: String(intent.chainId),
    nonce: String(intent.nonce),
    deadline: String(intent.deadline),
  };
}

/**
 * JSON 传输里 uint 以字符串/数字到达 —— 收敛成 bigint 并做形状校验（协议规则在此一道把关）。
 * 返回 { intent } 或 { error }；chainId 传入时额外核对跨链错配。
 */
export function normalizeIntent(raw, { chainId } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'intent 必须是对象' };
  const uint = (k) => {
    try {
      const v = BigInt(raw[k]);
      return v >= 0n ? v : null;
    } catch {
      return null;
    }
  };
  const fields = {
    payeeAmount: uint('payeeAmount'),
    maxHelperReward: uint('maxHelperReward'),
    chainId: uint('chainId'),
    nonce: uint('nonce'),
    deadline: uint('deadline'),
  };
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) return { error: `intent.${k} 不是非负整数` };
  }
  if (!isAddress(raw.payee) || !isAddress(raw.token)) {
    return { error: 'intent.payee / intent.token 地址非法' };
  }
  if (fields.payeeAmount === 0n) return { error: 'payeeAmount 必须大于 0' };
  // 合约 execute 首行即 revert（maxHelperReward 禁 0），端口层提前拦
  if (fields.maxHelperReward === 0n) return { error: 'maxHelperReward 禁止 0' };
  const intent = {
    payee: raw.payee,
    payeeAmount: fields.payeeAmount,
    token: raw.token,
    maxHelperReward: fields.maxHelperReward,
    chainId: fields.chainId,
    nonce: fields.nonce,
    deadline: fields.deadline,
  };
  if (chainId != null && intent.chainId !== BigInt(chainId)) {
    return { error: `chainId 错配：意图签的是 ${intent.chainId}，请求目标是 ${chainId}` };
  }
  return { intent };
}
