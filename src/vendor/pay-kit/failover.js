// 自提交兜底 + helper 容灾编排。
// 付端的可用性叙事根基：helper 是无许可市场，机器永远保有自己的提交路径——
// helper 全挂时自己广播 execute()（自当 helper，奖励归自己），协议不依赖任何第三方活着。
import { parseAbi, encodeFunctionData } from 'viem';
import { submitToHelper } from './helper.js';

/** execute 入口签名字段（与合约逐字一致；完整 ABI 是各仓 registry 数据不入 kit） */
const EXECUTE_ABI = parseAbi([
  'struct Intent { address payee; uint256 payeeAmount; address token; uint256 maxHelperReward; uint256 chainId; uint256 nonce; uint256 deadline; }',
  'function execute(Intent intent, bytes intentSig, bytes permitSig, uint256 minNativeOut) payable',
]);

/**
 * 自提交兜底的 execute() calldata。
 * @param {{ payee: string, payeeAmount: bigint, token: string, maxHelperReward: bigint, chainId: bigint, nonce: bigint, deadline: bigint }} intent
 * @param {{ intentSig: string, permitSig: string, minNativeOut?: bigint }} sigs
 */
export function encodeExecuteData(intent, { intentSig, permitSig, minNativeOut = 0n }) {
  return encodeFunctionData({
    abi: EXECUTE_ABI,
    functionName: 'execute',
    args: [intent, intentSig, permitSig, minNativeOut],
  });
}

/**
 * helper 容灾编排：按顺序轮试 helper 列表，第一个接受的即返回；
 * 全部失败时返回结构化失败清单 + 自提交材料（若调用方传入 self），
 * 机器拿 executeData 走自己的钱包广播即可（自当 helper，奖励归自己）。
 *
 * @param {string[]} baseUrls helper 列表（顺序即优先级）
 * @param {Record<string, unknown>} payload POST /intents 的 body（chainId/intent/intentSig/permitSig）
 * @param {{ token?: string, batch?: boolean, fetchImpl?: typeof fetch,
 *           self?: { intent: object, intentSig: string, permitSig: string, minNativeOut?: bigint } }} opts
 * @returns {Promise<{ ok: boolean, via?: string, ack?: object,
 *           attempts: Array<{ helper: string, ok: boolean, error?: string }>,
 *           self?: { executeData: string } | null }>}
 */
export async function submitWithFailover(baseUrls, payload, { token, batch = false, fetchImpl = fetch, self = null } = {}) {
  const attempts = [];
  for (const base of baseUrls) {
    try {
      const ack = await submitToHelper(base, payload, { token, batch, fetchImpl });
      if (ack.status === 'rejected') {
        attempts.push({ helper: base, ok: false, error: ack.reason ?? 'rejected' });
        continue;
      }
      return { ok: true, via: base, ack, attempts, self: null };
    } catch (e) {
      attempts.push({ helper: base, ok: false, error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  return {
    ok: false,
    attempts,
    self: self
      ? { executeData: encodeExecuteData(self.intent, { intentSig: self.intentSig, permitSig: self.permitSig, minNativeOut: self.minNativeOut }) }
      : null,
  };
}
