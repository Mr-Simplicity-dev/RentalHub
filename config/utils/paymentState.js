// Paystack success webhooks may complete only payments that are still pending.
// Failed, refunded and completed payments are terminal for this webhook path.
const ELIGIBLE_SUCCESS_STATUSES = new Set(['pending']);

const canCompleteFromSuccessWebhook = (status) => (
  ELIGIBLE_SUCCESS_STATUSES.has(String(status || '').trim().toLowerCase())
);

module.exports = { ELIGIBLE_SUCCESS_STATUSES, canCompleteFromSuccessWebhook };
