// 盈利预检纯数学——跨 worker 同源公式（2026-09-15 自三仓收编归一）：
//   HelperWorker precheck.js evaluateProfit（ceil 版）+ Executor decide.js profitCheck
//   + SelfSweep sweep.js profitCheckNet（后两者原为 floor）。统一取 ceil（「宁可错杀」，
//   更严格更安全）；Executor 的「零奖励拒绝」（expected > 0）语义一并收编。
// 纯函数、不碰网络：node --test 直接覆盖，各 worker 仓以薄适配保自己的参数名/返回形状。
// 合约层兜底语义各有不同（ImputePay withgas 保 helper 不亏 / Imputations 费率链上读），
// 这里只管「链下要不要出手」的统一口径：expected ≥ gas 成本 × buffer/10。

// bufferX10 = 12 即 ×1.2 门槛；ceil(a/10) = (a+9)/10（整数技巧，宁可错杀）。
export function evaluateProfit({ expectedNative, gasUnits, gasPriceWei, bufferX10 = 12n }) {
  const expected = BigInt(expectedNative);
  const costNative = BigInt(gasUnits) * BigInt(gasPriceWei);
  const requiredNative = (costNative * BigInt(bufferX10) + 9n) / 10n;
  return {
    ok: expected > 0n && expected >= requiredNative,
    expected,
    costNative,
    gasCost: costNative,
    requiredNative,
    threshold: requiredNative, // 别名：HelperWorker 历史字段名，与 requiredNative 同值
    margin: expected - costNative,
  };
}

// 行情折算 × bps/10000（默认 95%）——换币路径的滑点保护下限；极端行情被打穿时，
// 由各合约层约束兜底（ImputePay withgas 整笔 revert 保 helper 不亏）。
export function minOutFromQuote(quote, minOutBps = 9500n) {
  return (BigInt(quote) * BigInt(minOutBps)) / 10000n;
}
