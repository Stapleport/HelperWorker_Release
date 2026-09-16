// 归集决策链纯函数（2026-09-15 自 SelfSweep sweep.js / Executor worker.js 收编，方案 A 第一步）：
// 扫频道余额 → 阈值/分组判定 → 费率解析 → 净额数学。与具体 worker 外壳（榜单拉取、RPC、
// 签名广播、KV/通知）无关的部分在此，可 node --test 直测。
// calldata 编码器**留各仓**（对拍结论 2026-09-15）：SelfSweep encodeImputationall(treasury,
// tokenTasks)（多币打包）与 Executor encodeImputationall(treasury, paths, token)（单币包装）
// 走两份逐字节相同的 Imputations ABI、同一逻辑输入下 viem 输出逐字节一致，但两仓包装签名
// 不同（前者是后者的多币超集），且本库零依赖不引 viem、README L2 分层把 calldata 编码器钉在
// 各 worker 仓——故编码留壳，本模块只管「要不要归、归哪些、净多少」，已编码 data 由壳自产。

// systeminfo 归一（SelfSweep sweep.js 与 Executor worker.js 同款双形态）：费率事实
// （Collect_internal.sol / _calculateFees）1e18 = 100%。viem 对无命名 outputs 解码成数组
// [owner, affiliate, helper, gas_price_reward, router]；有命名时是对象。三费合计供净得率，
// helper/gas_price_reward 单列（Executor helper 奖励现算 / gas_price_reward 硬约束用）。
export function parseSystemInfo(info) {
  const fees = Array.isArray(info)
    ? info
    : [info?.owner_fee, info?.affiliate_fee, info?.helper_fee, info?.gas_price_reward, info?.router];
  const ownerFeeX18 = BigInt(fees[0]);
  const affiliateFeeX18 = BigInt(fees[1]);
  const helperFeeX18 = BigInt(fees[2]);
  const gasPriceRewardX18 = BigInt(fees[3] ?? 0n); // Executor 同款：缺省按 0（不设硬约束）
  return {
    fees,
    ownerFeeX18,
    affiliateFeeX18,
    helperFeeX18,
    gasPriceRewardX18,
    feeSumX18: ownerFeeX18 + affiliateFeeX18 + helperFeeX18,
  };
}

// 净得率数学（SelfSweep sweep.js 同式）：原生币净额 = 总额 × (1e18 − 三费合计) / 1e18。
// imputationall 路径三费都从扫入额里扣；免费额度期内实际更高，按最保守口径做盈利预检。
export function netAfterFees(amountWei, feeSumX18) {
  return (BigInt(amountWei) * (10n ** 18n - BigInt(feeSumX18))) / 10n ** 18n;
}

// 阈值/分组判定（SelfSweep sweep.js 阈值判定段收编）：
//   paths      —— 本轮要打的通道 path（原始大小写，编码时按原样进 calldata）
//   balances   —— gettokensreceiveds → balancesByTokenPath 的 Map<token小写, Map<path小写, BigInt>>
//   thresholds —— Map<token小写, raw BigInt>；human→raw 换算与 ERC20 decimals 读链留在壳
//                 （只给「有余额记录」的币换算，保持原 decimals RPC 触发面不变）
// 返回 Map<token小写, { paths: 达标path[], total }>：只收 balance>0 的通道，total ≥ 阈值
// 且至少一条 path 在场才算达标；输出保持 thresholds 的迭代序（calldata 打包顺序随之前后
// 一致）。纯查 Map，不发任何 RPC。
export function qualifyPaths({ paths, balances, thresholds }) {
  const qualifying = new Map();
  for (const [token, thresholdRaw] of thresholds) {
    const perPath = balances.get(token);
    if (!perPath?.size) continue;
    const hit = [];
    let total = 0n;
    for (const p of paths) {
      const bal = perPath.get(p.toLowerCase()) ?? 0n;
      if (bal > 0n) {
        hit.push(p);
        total += bal;
      }
    }
    if (hit.length && total >= BigInt(thresholdRaw)) qualifying.set(token, { paths: hit, total });
  }
  return qualifying;
}
