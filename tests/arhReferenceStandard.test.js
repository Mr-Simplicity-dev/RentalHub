// ARH reference standard: every NEW reference carries the ARH prefix, legacy
// references keep working forever, receipt/document numbers are keyed by the
// immutable record id, payout receipts name the withdrawal (never the
// recipient), and the receipt endpoints enforce ownership.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_arh_reference_standard';

const db = require('../config/middleware/database');
const mailer = require('../config/utils/mailer');
const referenceGenerator = require('../config/utils/referenceGenerator');
const receiptFormat = require('../config/utils/receiptFormat');
const {
  resolveWithdrawalId,
  sendUserPayoutReceipt,
  sendAgentPayoutReceipt,
  sendAdminPayoutReceipt,
  sendReceiptForPayment,
  buildReceiptData,
  loadReceiptContext,
} = require('../config/utils/paymentReceipt');

const withMockedDb = async (handler, run) => {
  const original = db.query;
  db.query = async (sql, params = []) => handler(String(sql), params) || { rows: [] };
  try {
    return await run();
  } finally {
    db.query = original;
  }
};

const withCapturedEmails = async (run) => {
  const original = mailer.sendEmail;
  const sent = [];
  mailer.sendEmail = async (payload) => {
    sent.push(payload);
    return { success: true };
  };
  try {
    await run(sent);
  } finally {
    mailer.sendEmail = original;
  }
};

const makePayment = (over = {}) => ({
  id: 123,
  user_id: 5,
  payment_type: 'wallet_funding',
  amount: 5000,
  currency: 'NGN',
  payment_status: 'completed',
  payment_method: 'paystack',
  payment_channel: 'card',
  transaction_reference: 'ARH_WALLET_123_1792312345678',
  created_at: new Date('2026-10-18T11:27:00Z'),
  property_id: null,
  ...over,
});

const standardPaymentHandler = (payment) => (sql) => {
  if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [payment] };
  if (/FROM users WHERE id = \$1/.test(sql)) {
    return { rows: [{ email: 'payer@example.test', full_name: 'Payer One' }] };
  }
  return { rows: [] };
};

// ── Reference generation ──────────────────────────────────────────────────────

test('every NEW generated reference carries the ARH platform prefix', () => {
  assert.match(referenceGenerator.buildReference('RENT', 184, 1792312345678), /^ARH_RENT_184_1792312345678$/);
  assert.equal(referenceGenerator.buildReference('WALLET', 12), 'ARH_WALLET_12');
  assert.match(referenceGenerator.agentWithdrawalReference(92), /^ARH_AGW_92_\d+$/);
  assert.match(referenceGenerator.walletWithdrawalReference(91), /^ARH_WLW_91_\d+$/);
  assert.match(referenceGenerator.stateAdminWithdrawalReference(37), /^ARH_SAW_37_\d+$/);
  assert.equal(referenceGenerator.payoutRetryReference('AGW', 92, 1), 'ARH_AGW_92_R1');
  assert.equal(referenceGenerator.payoutRetryReference('SAW', 37, 2), 'ARH_SAW_37_R2');
  assert.equal(referenceGenerator.buildHyphenReference('RCPT', '000184'), 'ARH-RCPT-000184');
  assert.equal(referenceGenerator.PLATFORM_PREFIX, 'ARH');
});

test('legacy (pre-ARH) references remain accepted by the matching helpers', () => {
  assert.equal(referenceGenerator.matchesPrefix('AGW_91_1792312345678', 'AGW'), true);
  assert.equal(referenceGenerator.matchesPrefix('ARH_AGW_91_1792312345678', 'AGW'), true);
  assert.equal(referenceGenerator.matchesPrefix('WLW_12', 'WLW'), true);
  assert.equal(referenceGenerator.matchesPrefix('SAW_37', 'SAW'), true);
  assert.equal(referenceGenerator.matchesPrefix('RENT_184_1', 'AGW'), false);
  assert.equal(referenceGenerator.isApplicationReference('RH-APP-ABC123'), true);
  assert.equal(referenceGenerator.isApplicationReference('ARH-APP-ABC123'), true);
  assert.equal(referenceGenerator.isApplicationReference('APP-ABC123'), false);
  assert.equal(referenceGenerator.isRecruitmentPaymentReference('RH_CR_1_2'), true);
  assert.equal(referenceGenerator.isRecruitmentPaymentReference('ARH_CR_1_2'), true);
  assert.equal(referenceGenerator.isRecruitmentPaymentReference('CR_1_2'), false);
});

test('receipt/document numbers are ARH-prefixed and keyed by the record id', () => {
  assert.equal(referenceGenerator.paymentReceiptNumber(123), 'ARH-RCPT-000123');
  assert.equal(referenceGenerator.savingsReceiptNumber(7), 'ARH-RCPT-SAV-000007');
  assert.equal(referenceGenerator.userPayoutReceiptNumber(184), 'ARH-WDR-000184');
  assert.equal(referenceGenerator.agentPayoutReceiptNumber(91), 'ARH-AG-PAY-000091');
  assert.equal(referenceGenerator.adminPayoutReceiptNumber(37), 'ARH-SAW-PAY-000037');
});

// ── Payout receipt id resolution ──────────────────────────────────────────────

test('payout receipt numbers identify the withdrawal, never the recipient', () => {
  const userKinds = ['WLW', 'WDR'];
  assert.equal(resolveWithdrawalId(184, '', userKinds), 184);
  assert.equal(resolveWithdrawalId(undefined, 'ARH_WLW_91_1792312345678', userKinds), 91);
  assert.equal(resolveWithdrawalId(undefined, 'WLW_91_1792312345678', userKinds), 91);
  assert.equal(resolveWithdrawalId(undefined, 'ARH_WDR_REJ_57', userKinds), 57);
  assert.equal(resolveWithdrawalId(undefined, 'ARH_WLW_91_R1', userKinds), 91);
  assert.equal(resolveWithdrawalId(undefined, 'ARH_AGW_92_R1', ['AGW', 'AG']), 92);
  assert.equal(resolveWithdrawalId(undefined, 'SAW_37_TS', ['SAW']), 37);

  // Same payout re-delivered → identical number (deterministic).
  const first = referenceGenerator.userPayoutReceiptNumber(
    resolveWithdrawalId(undefined, 'ARH_WLW_91_1792312345678', userKinds)
  );
  const second = referenceGenerator.userPayoutReceiptNumber(
    resolveWithdrawalId(undefined, 'ARH_WLW_91_9999999999999', userKinds)
  );
  assert.equal(first, second);
  assert.equal(first, 'ARH-WDR-000091');
});

// ── Receipt formatting helpers ────────────────────────────────────────────────

test('receipt helpers mask accounts, humanize status/method and use West Africa Time', () => {
  assert.equal(receiptFormat.maskAccountNumber('0123456789'), '••••••6789');
  assert.equal(receiptFormat.formatNigerianDateTime('2026-10-18T11:27:00Z'), '18 October 2026, 12:27 PM WAT');
  assert.equal(receiptFormat.receiptStatus('completed'), 'PAID');
  assert.equal(receiptFormat.receiptStatus('pending'), 'PENDING');
  assert.equal(receiptFormat.humanizeStatus('processed'), 'Processed');
  assert.equal(receiptFormat.paymentMethodLine('paystack', 'card'), 'Paystack — Card');
});

// ── Payout receipt emails ─────────────────────────────────────────────────────

test('user payout receipt email is actually sent, ARH-numbered and account-masked', async () => {
  await withMockedDb(
    (sql) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'jane@example.test', full_name: 'Jane Doe' }] };
      }
      return { rows: [] };
    },
    async () => {
      await withCapturedEmails(async (sent) => {
        const result = await sendUserPayoutReceipt({
          userId: 5,
          withdrawalId: 184,
          amount: 15000,
          bankName: 'Access Bank',
          accountNumber: '0123456789',
          accountName: 'Jane Doe',
          reference: 'ARH_WLW_184_1792312345678',
          status: 'processed',
        });

        assert.equal(result.success, true);
        assert.equal(sent.length, 1);
        assert.match(sent[0].subject, /ARH-WDR-000184/);
        assert.match(sent[0].html, /•{6}6789/);
        assert.doesNotMatch(sent[0].html, /0123456789/);
        assert.match(sent[0].html, /Processed/);
        assert.match(sent[0].html, /computer-generated receipt/);
        assert.match(sent[0].html, /ARH_WLW_184_1792312345678/);
      });
    }
  );
});

test('agent payout receipt email uses ARH-AG-PAY and the withdrawal reference', async () => {
  await withMockedDb(
    (sql) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'agent@example.test', full_name: 'Agent A' }] };
      }
      if (/FROM agent_commission_ledger/.test(sql)) {
        return { rows: [{ source: 'agent_access_fee', amount: 5000 }] };
      }
      return { rows: [] };
    },
    async () => {
      await withCapturedEmails(async (sent) => {
        const result = await sendAgentPayoutReceipt({
          agentUserId: 9,
          withdrawalId: 91,
          amount: 5000,
          reference: 'ARH_AGW_91_1792312345678',
        });

        assert.equal(result.success, true);
        assert.match(sent[0].subject, /ARH-AG-PAY-000091/);
        assert.match(sent[0].html, /Agent Access Fee/);
      });
    }
  );
});

test('state admin payout receipt email uses ARH-SAW-PAY', async () => {
  await withMockedDb(
    (sql) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'sa@example.test', full_name: 'State Admin' }] };
      }
      if (/FROM admin_commissions/.test(sql)) {
        return { rows: [{ source: 'state_admin_commission', amount: 20000 }] };
      }
      return { rows: [] };
    },
    async () => {
      await withCapturedEmails(async (sent) => {
        const result = await sendAdminPayoutReceipt({
          adminId: 3,
          withdrawalId: 37,
          amount: 20000,
          reference: 'ARH_SAW_37_1792312345678',
        });

        assert.equal(result.success, true);
        assert.match(sent[0].subject, /ARH-SAW-PAY-000037/);
      });
    }
  );
});

test('payout receipt falls back to the reference when no withdrawal id is passed', async () => {
  await withMockedDb(
    (sql) => {
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'jane@example.test', full_name: 'Jane Doe' }] };
      }
      return { rows: [] };
    },
    async () => {
      await withCapturedEmails(async (sent) => {
        const result = await sendUserPayoutReceipt({
          userId: 5,
          amount: 15000,
          bankName: 'Access Bank',
          accountNumber: '0123456789',
          accountName: 'Jane Doe',
          reference: 'WLW_91_1792312345678',
          status: 'processed',
        });

        assert.equal(result.success, true);
        assert.match(sent[0].subject, /ARH-WDR-000091/);
      });
    }
  );
});

// ── Payment receipt email ─────────────────────────────────────────────────────

test('payment receipt email is actually sent with humanized fields', async () => {
  const payment = makePayment();
  await withMockedDb(standardPaymentHandler(payment), async () => {
    await withCapturedEmails(async (sent) => {
      const result = await sendReceiptForPayment(123);

      assert.equal(result.success, true);
      assert.equal(sent.length, 1);
      const html = sent[0].html;
      assert.match(sent[0].subject, /ARH-RCPT-000123/);
      assert.match(html, /OFFICIAL PAYMENT RECEIPT/);
      assert.match(html, /PAID/);
      assert.match(html, /Paystack — Card/);
      assert.match(html, /18 October 2026, 12:27 PM WAT/);
      assert.match(html, /₦5,000/);
      assert.match(html, /Currency:<\/strong> NGN/);
      assert.match(html, /computer-generated receipt/);
    });
  });
});

test('legacy persisted references are shown verbatim, never rewritten', async () => {
  const payment = makePayment({ transaction_reference: 'WALLET_123_OLDTS' });
  await withMockedDb(standardPaymentHandler(payment), async () => {
    const ctx = await loadReceiptContext(123);
    const data = buildReceiptData(ctx);
    assert.equal(data.reference, 'WALLET_123_OLDTS');
    assert.equal(data.receiptNumber, 'ARH-RCPT-000123');
  });
});

test('an unsettled payment is never labelled PAID', async () => {
  const payment = makePayment({ payment_status: 'pending' });
  await withMockedDb(standardPaymentHandler(payment), async () => {
    const ctx = await loadReceiptContext(123);
    const data = buildReceiptData(ctx);
    assert.equal(data.status, 'PENDING');
  });
});

test('combined registration payments still group into one receipt', async () => {
  const base = makePayment({
    id: 50,
    payment_type: 'registration_fee',
    amount: 5000,
    transaction_reference: 'ARH_REGPAY_50_TS_LAWYER_FEE',
  });
  const groupRows = [
    makePayment({ id: 49, payment_type: 'registration_fee', amount: 5000, transaction_reference: 'ARH_REGPAY_50_TS' }),
    base,
  ];

  await withMockedDb(
    (sql) => {
      if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [base] };
      if (/FROM payments[\s\S]*user_id/.test(sql)) return { rows: groupRows };
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'payer@example.test', full_name: 'Payer One' }] };
      }
      return { rows: [] };
    },
    async () => {
      const ctx = await loadReceiptContext(50);
      const data = buildReceiptData(ctx);
      assert.equal(data.items.length, 2);
      assert.equal(data.totalAmount, 10000);
      assert.equal(data.receiptNumber, 'ARH-RCPT-000050');
    }
  );
});

test('diaspora registration receipts still surface the USD quote', async () => {
  const payment = makePayment({
    id: 60,
    payment_type: 'registration_fee',
    amount: 750000,
    transaction_reference: 'ARH_REGPAY_60_TS',
  });

  await withMockedDb(
    (sql) => {
      if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [payment] };
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'payer@example.test', full_name: 'Payer One' }] };
      }
      if (/tenant_registration_payments/.test(sql)) {
        return {
          rows: [{ quote_amount_usd: 500, fx_rate: 1500, fx_markup_pct: 2, quote_currency: 'USD' }],
        };
      }
      return { rows: [] };
    },
    async () => {
      const ctx = await loadReceiptContext(60);
      const data = buildReceiptData(ctx);
      assert.equal(data.quoteUsd, 500);
      assert.equal(data.currency, 'NGN');
    }
  );
});

// ── Receipt endpoint ownership ────────────────────────────────────────────────

test('the payment receipt endpoint enforces ownership', async (t) => {
  let currentUser = { id: 5 };

  const app = express();
  app.use((req, res, next) => {
    req.user = currentUser;
    req.logger = { error: () => {} };
    next();
  });
  app.use('/payments', require('../routes/payments'));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const get = (path) =>
    new Promise((resolve) => {
      const req = http.request({ port, path, method: 'GET' }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.end();
    });

  const payment = makePayment();

  await withMockedDb(
    (sql) => {
      if (/FROM payments WHERE id = \$1/.test(sql)) return { rows: [payment] };
      if (/FROM users WHERE id = \$1/.test(sql)) {
        return { rows: [{ email: 'payer@example.test', full_name: 'Payer One' }] };
      }
      if (/FROM users[\s\S]*token_version/.test(sql)) {
        return {
          rows: [
            {
              id: 5,
              email: 'payer@example.test',
              user_type: 'tenant',
              identity_verified: true,
              subscription_active: true,
              token_version: 1,
              is_active: true,
              deleted_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
    async () => {
      currentUser = { id: 5 };
      const owner = await get('/payments/receipt/123');
      assert.equal(owner.status, 200);
      assert.equal(JSON.parse(owner.body).data.receiptNumber, 'ARH-RCPT-000123');

      currentUser = { id: 99 };
      const denied = await get('/payments/receipt/123');
      assert.equal(denied.status, 403);

      currentUser = {};
      const anonymous = await get('/payments/receipt/123');
      assert.equal(anonymous.status, 401);
    }
  );
});
