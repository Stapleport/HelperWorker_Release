// estimateGas/eth_call 预检与 gas 口径——跨 worker 同源语义（2026-09-15 自三仓收编归一）：
//   Bridge lib/tx.js sendTx（正典口径：estimate 异常回落 DEFAULT_GAS + eth_call 复现 revert
//   原因 + gasPrice 零值兜底 + 预估值 ×1.2 广播上限；2026-09-15 起 Bridge tx.js 已接回本模块）
//   SelfSweep sweep.js（真实 calldata 估 gas，失败即弃单）
//   HelperWorker execute.js（viem simulateContract / estimateContractGas，失败抛 SettleError
//   不回落——合约必 revert 的单不该用 defaultGas 硬发，属有意语义，仅收编 ×1.2 上限口径）
//   Executor worker.js（估 gas 失败跳组）。
// 联盟链坑（Bridge NOTES 2026-09-13，stapleport 78753 初代）：baseFee≈0 链上节点模拟会把
// tx.gasprice 当 0，eth_estimateGas 有假阴性历史——回落 defaultGas 前先用 eth_call 模拟甄别。
// 纯函数化：RPC 传输一律 rpcCall(method, params) 参数注入（裸 fetch rpc / viem client.request
// / 测试 stub 皆可），本模块不摸 env、不发 fetch、不 console。

// 广播口径的 gas 上限：预估值 × headroomX10/10（默认 ×1.2，Bridge/HelperWorker 同款，
// 与 profit.js bufferX10 同一套 ×N/10 记法）。预检/盈利口径仍用预估值原值；
// 整数除法与 Bridge 的 (gas×120)/100 同值。
export function gasWithHeadroom(gas, headroomX10 = 12n) {
  return (BigInt(gas) * BigInt(headroomX10)) / 10n;
}

// 零 baseFee 链（联盟链初代）eth_gasPrice 可能给出 0：legacy 零价 tx 直接无效，兜底 1 wei
// （Bridge sendTx 同款）。
export function effectiveGasPrice(gasPriceWei, floor = 1n) {
  const p = BigInt(gasPriceWei);
  return p > 0n ? p : BigInt(floor);
}

// 回执状态口径（SelfSweep settlePending 同款）：status '0x1' 确认 / '0x0' 回滚，
// 其余（null 回执、RPC 抖动、异常 status）一律在途。
export function receiptStatus(receipt) {
  const s = receipt?.status;
  if (s === '0x1' || s === '0x01') return 'confirmed';
  if (s === '0x0' || s === '0x00') return 'reverted';
  return 'pending';
}

// 热钱包余量预检（SelfSweep/Executor 同款）：余额 ≥ 本单 gas 成本 × reserveX 倍预留
//（给后续单与重试留量）。
export function gasReserveOk(walletBalanceWei, costWei, reserveX = 1n) {
  return BigInt(walletBalanceWei) >= BigInt(costWei) * BigInt(reserveX);
}

// eth_call 全流程模拟（HelperWorker simulateContract 同语义的裸 RPC 版）：签名/白名单/
// 余额/allowance 不够……合约会 revert 的都在这里现形。不 throw，返回
// { ok: true, result } | { ok: false, error }，决策与日志留给壳。
export async function simulateCall(rpcCall, tx, blockTag = 'latest') {
  const params = [{ ...tx, value: tx.value ?? '0x0' }, blockTag];
  try {
    return { ok: true, result: await rpcCall('eth_call', params) };
  } catch (error) {
    return { ok: false, error };
  }
}

// 主入口：eth_estimateGas 预检，异常回落 defaultGas + eth_call 模拟甄别（Bridge sendTx 口径）。
// tx = { from?, to, data, value? }；rpcCall(method, params) → result 由调用方注入。
// 不 throw、不 log，返回：
//   {
//     gas: BigInt,     // 最终采用的 gas：预估值（可 ×headroom）或 defaultGas（回落不加 headroom）
//     source: 'estimated' | 'fallback' | 'default',   // skipEstimate=true 时为 'default'
//     estimateError: Error | null,
//     simulate: null | { ok: true, result } | { ok: false, error },  // 仅回落路径跑 eth_call
//   }
// 消费形态：Bridge 忽略 simulate 仅作诊断日志；SelfSweep 用 simulate.ok 甄别「真 revert 弃单
// vs 联盟链估 gas 假阴性放行」。
export async function gasPrecheck({
  rpcCall,
  tx,
  defaultGas = 600000n,
  headroomX10 = null, // null = 预估值原值（SelfSweep 现口径）；12n = ×1.2（Bridge/HelperWorker 口径）
  skipEstimate = false, // Bridge tx.skipEstimate：跳过估算直接 defaultGas
  blockTag = 'latest',
}) {
  if (skipEstimate) {
    return { gas: BigInt(defaultGas), source: 'default', estimateError: null, simulate: null };
  }
  const txParams = { from: tx.from, to: tx.to, data: tx.data, value: tx.value ?? '0x0' };
  try {
    const estimated = BigInt(await rpcCall('eth_estimateGas', [txParams]));
    return {
      gas: headroomX10 == null ? estimated : gasWithHeadroom(estimated, headroomX10),
      source: 'estimated',
      estimateError: null,
      simulate: null,
    };
  } catch (estimateError) {
    const simulate = await simulateCall(rpcCall, txParams, blockTag);
    return { gas: BigInt(defaultGas), source: 'fallback', estimateError, simulate };
  }
}
