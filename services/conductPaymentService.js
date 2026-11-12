const {interval:setInterval,timeout:setTimeout}=require('./backgroundJobRuntime');
const db = require('../config/middleware/database'),
  axios = require('axios');
const {
  logAction
} = require('../config/utils/auditLogger');
const {
  createNotification
} = require('../config/utils/notificationService');
function confirmedPayment(payment, submission) {
  return payment?.status === 'success' && payment.reference === submission.payment_reference && payment.currency === 'NGN' && Number(payment.amount) === 500000 && String(payment.customer?.email || '').toLowerCase() === String(submission.payment_email).toLowerCase();
}
async function reconcile(id, userId) {
  const s = (await db.query('SELECT * FROM admin_conduct_submissions WHERE id=$1 AND ($2::int IS NULL OR user_id=$2)', [id, userId || null])).rows[0];
  if (!s) throw Object.assign(new Error('Submission not found'), {
    status: 404
  });
  if (s.status === 'pending_payment') {
    if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error('Payment service is not configured'), {
      status: 503
    });
    const r = await axios.get('https://api.paystack.co/transaction/verify/' + encodeURIComponent(s.payment_reference), {
      headers: {
        Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY
      },
      timeout: 20000
    });
    if (!r.data?.status || !confirmedPayment(r.data.data, s)) throw Object.assign(new Error('Payment is not confirmed. If money was deducted, retry verification rather than paying again.'), {
      status: 409
    });
    const updated = await db.query("UPDATE admin_conduct_submissions SET status='submitted',paid_at=NOW(),submitted_at=NOW() WHERE id=$1 AND status='pending_payment' RETURNING *", [s.id]);
    if (!updated.rows[0]) Object.assign(s, (await db.query('SELECT * FROM admin_conduct_submissions WHERE id=$1', [s.id])).rows[0]);
    if (updated.rows[0]) {
      Object.assign(s, updated.rows[0]);
      await logAction({
        actorId: s.user_id,
        action: 'ADMIN_CONDUCT_SUBMITTED',
        targetType: 'conduct_document',
        targetId: s.document_id
      });
    }
  }
  if (s.status !== 'pending_payment' && !s.notified_at) {
    const staff = await db.query("SELECT id FROM users WHERE (user_type IN ('recruitment_admin','super_admin') OR is_recruitment_admin=TRUE) AND deleted_at IS NULL AND account_suspended_at IS NULL");
    for (const u of staff.rows) await createNotification(u.id, 'admin_conduct', 'Signed Code of Conduct received', 'A paid electronic submission is ready for review.', '/admin/code-of-conduct');
    await createNotification(s.user_id, 'admin_conduct', 'Code of Conduct submitted', 'Your payment was confirmed and Recruitment received your signed document.', '/admin/code-of-conduct');
    await db.query('UPDATE admin_conduct_submissions SET notified_at=NOW() WHERE id=$1', [s.id]);
  }
  return s;
}
function startConductReconciliation() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    const client = await db.connect();
    let locked = false;
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(2046,1) AS locked')).rows[0]?.locked;
      if (!locked) return;
      const rows = await db.query("SELECT id FROM admin_conduct_submissions WHERE (status='pending_payment' AND signed_at>NOW()-INTERVAL '7 days') OR (status<>'pending_payment' AND notified_at IS NULL) ORDER BY last_checked_at ASC NULLS FIRST LIMIT 20");
      for (const row of rows.rows) {
        try {
          await reconcile(row.id);
        } catch (e) {
          if (e.status !== 409) require('../config/utils/logger').warn('Conduct reconciliation will retry', {
            code: e.code || e.status
          });
        } finally {
          await db.query('UPDATE admin_conduct_submissions SET last_checked_at=NOW() WHERE id=$1', [row.id]);
        }
      }
    } catch (e) {
      require('../config/utils/logger').error('Conduct reconciliation failed', {
        code: e.code
      });
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(2046,1)');
      client.release();
      running = false;
    }
  };
  const safeRun = () => run().catch(e => {
    running = false;
    require('../config/utils/logger').error('Conduct recovery database unavailable', {
      code: e.code
    });
  });
  const timer = setInterval(safeRun, 60000);
  timer.unref?.();
  setTimeout(safeRun, 30000).unref?.();
}
module.exports = {
  confirmedPayment,
  reconcile,
  startConductReconciliation
};
