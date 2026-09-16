// @stapleport/pay-kit 出口：付端协议口径正典（Web_kit/WorkerKit 同款源码直发形态）。
// 机器侧最小闭环四步：buildIntent → signPermit + signIntent（双签，签完即可下线）→
// submitToHelper（任何 helper 都行）→ waitForExecution。
// helper 侧：normalizeIntent 收敛形状 → recoverPayer 验签 → intentHash 对账。
export {
  INTENT_TYPES,
  INTENT_TYPEHASH_STRING,
  imputePayDomain,
  permitTypes,
  buildPermitDomain,
} from './schema.js';
export {
  buildIntent,
  intentMessage,
  intentToArgs,
  intentHash,
  serializeIntent,
  normalizeIntent,
} from './intent.js';
export { signIntent, signPermit } from './sign.js';
export { recoverPayer } from './verify.js';
export { PAYMENT_EXECUTED, submitToHelper, waitForExecution } from './helper.js';
export { encodeExecuteData, submitWithFailover } from './failover.js';
