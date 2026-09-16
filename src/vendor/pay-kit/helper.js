// helper 通道：提交与回执等待。任何实现 /intents 语义的 helper 都能接（本板 HelperWorker 即参考实现）。
import { createPublicClient, http, parseAbiItem } from 'viem';

/** @typedef {import('./intent.js').ImputePayRef} ImputePayRef */

/** PaymentExecuted 事件（对账主键 intentHash；helper 实得 = helperNativeOut） */
export const PAYMENT_EXECUTED = parseAbiItem(
  'event PaymentExecuted(bytes32 indexed intentHash, address indexed payer, address indexed payee, address token, uint256 payeeAmount, address helper, uint256 helperNativeOut, uint256 gasUsed)',
);

/** @typedef {{ status: 'executed'|'dry-run'|'queued'|'rejected', intentHash?: string, txHash?: string, reason?: string, [k: string]: unknown }} HelperAck */

/**
 * 提交给 helper（POST /intents，batch=true 时 /intents/batch）；token 为可选的共享密钥。
 * fetchImpl 可注入（worker 环境测试用）。
 */
export async function submitToHelper(
  baseUrl,
  payload,
  { token, batch = false, fetchImpl = fetch } = {},
) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/intents${batch ? '/batch' : ''}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!res.ok && !body.status) throw new Error(`helper ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/** @typedef {{ intentHash: string, payer: string, payee: string, token: string, payeeAmount: bigint, helper: string, helperNativeOut: bigint, gasUsed: bigint, txHash: string, blockNumber: bigint }} ExecutionReceipt */

/**
 * 等待某意图被执行（轮询链上 PaymentExecuted 事件；demo/联盟链体量从 0 扫，
 * 主网量级请传 fromBlock 收窄）。超时返回 null。
 */
export async function waitForExecution(
  cfg,
  intentHashValue,
  { timeoutMs = 120_000, pollMs = 4_000, fromBlock = 0n } = {},
) {
  const client = createPublicClient({ transport: http(cfg.rpcUrl) });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = await client.getLogs({
      address: cfg.imputepay,
      event: PAYMENT_EXECUTED,
      args: { intentHash: intentHashValue },
      fromBlock,
    });
    if (logs.length) {
      const l = logs[logs.length - 1];
      const a = l.args;
      return {
        intentHash: a.intentHash,
        payer: a.payer,
        payee: a.payee,
        token: a.token,
        payeeAmount: a.payeeAmount,
        helper: a.helper,
        helperNativeOut: a.helperNativeOut,
        gasUsed: a.gasUsed,
        txHash: l.transactionHash,
        blockNumber: l.blockNumber,
      };
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return null;
}
