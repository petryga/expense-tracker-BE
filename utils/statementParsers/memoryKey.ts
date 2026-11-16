// The merchant key for merchant memory (PLANS.md, decision 3): processor and
// wallet prefixes stripped, then the first two words of letters, so store
// numbers and glued-on cities mostly fall away.
//   "AplPay FD *STATE PERMITS 7SPRINGFIELD IL" -> "STATE PERMITS"
//
// The same rule as AI/eval/merchant.py, which the eval measured memory with.
// Change both together, or the eval stops describing what the app does.
// (Refund pairing uses the coarser merchantKey in merchant.ts.)
const PREFIX = /^(?:APLPAY|FD|SQ|TST|SP|PAYPAL|BT|DD|IC)\b\s*\*?\s*/;

export const memoryKey = (description: string): string => {
  let text = description.toUpperCase();
  for (;;) {
    const stripped = text.replace(PREFIX, '');
    if (stripped === text) break;
    text = stripped;
  }
  return (text.match(/[A-Z]{2,}/g) ?? []).slice(0, 2).join(' ');
};
