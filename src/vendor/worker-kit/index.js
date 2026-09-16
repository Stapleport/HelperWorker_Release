// 公共件出口：消费方统一 `import { … } from '@stapleport/worker-kit'`。
// 新增模块在此 re-export；保持零依赖（workerd/浏览器双环境可用，WebCrypto/viem 之外的
// 依赖进来自带打包体积税——免费档 cron CPU 10ms，能不进就不进）。
export { evaluateProfit, minOutFromQuote } from './profit.js';
export {
  gasPrecheck,
  simulateCall,
  gasWithHeadroom,
  effectiveGasPrice,
  receiptStatus,
  gasReserveOk,
} from './precheck.js';
export { parseSystemInfo, netAfterFees, qualifyPaths } from './sweep-core.js';
