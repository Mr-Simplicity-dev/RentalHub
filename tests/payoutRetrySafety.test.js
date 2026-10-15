const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/middleware/database');
const walletLedgerService = require('../services/walletLedgerService');
const paystackTransferService = require('../services/paystackTransfer.service');

const originalQuery = db.query;
const originalReserveWalletBalance = walletLedgerService.reserveWalletBalance;
const originalInitiateTransfer = paystackTransferService.initiateTransfer;
const previousRetryEnabled = process.env.PAYOUT_RETRY_ENABLED;
const previousPaystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

let selectedRows = {};
let claimSucceeds = false;
let reserveError = null;
let adminWalletBalance = 5000;
let databaseCalls = [];
let reserveCalls = [];
let transferCalls = [];

process.env.PAYOUT_RETRY_ENABLED = 'false';

const resetFakes = () => {
  selectedRows = {};
  claimSucceeds = false;
  reserveError = null;
  adminWalletBalance = 5000;
  databaseCalls = [];
  reserveCalls = [];
  transferCalls = [];

  db.query = async (sql, params = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
    databaseCalls.push({ sql: normalizedSql, params });

    if (/^ALTER TABLE /i.test(normalizedSql)) return { rows: [] };

    const selectTable = normalizedSql.match(/^SELECT \* FROM (agent_withdrawal_requests|withdrawal_requests|admin_withdrawals)\b/i)?.[1];
    if (selectTable) {
      const allowedStatuses = selectTable === 'agent_withdrawal_requests'
        ? ['approved', 'processing']
        : ['pending', 'approved'];
      return {
        rows: (selectedRows[selectTable] || []).filter((row) =>
          ['failed', 'reversed'].includes(row.paystack_transfer_status) && allowedStatuses.includes(row.status)
        ),
      };
    }

    if (normalizedSql.includes('COALESCE(payout_retry_count, 0)')) {
      const table = normalizedSql.match(/^UPDATE (agent_withdrawal_requests|withdrawal_requests|admin_withdrawals)\b/i)?.[1];
      const row = (selectedRows[table] || []).find((item) => item.id === params[3]);
      const eligibleStatuses = table === 'agent_withdrawal_requests'
        ? ['approved', 'processing']
        : ['pending', 'approved'];
      if (
        !claimSucceeds ||
        !row ||
        !eligibleStatuses.includes(row.status) ||
        !['failed', 'reversed'].includes(row.paystack_transfer_status) ||
        Number(row.payout_retry_count || 0) !== params[4]
      ) return { rows: [] };
      if (row) {
        Object.assign(row, {
          status: params[0],
          payout_retry_count: params[1],
          last_retry_at: new Date(),
          paystack_transfer_reference: params[2],
          paystack_transfer_status: 'processing',
        });
      }
      return { rows: [{ id: params[3] }] };
    }

    if (normalizedSql.includes('SET admin_wallet_balance = COALESCE(admin_wallet_balance, 0) - $1')) {
      const amount = Number(params[0]);
      if (adminWalletBalance < amount) return { rows: [] };
      adminWalletBalance -= amount;
      return { rows: [{ id: params[1] }] };
    }

    if (normalizedSql.includes('SET admin_wallet_balance = COALESCE(admin_wallet_balance, 0) + $1')) {
      adminWalletBalance += Number(params[0]);
      return { rows: [{ id: params[1] }] };
    }

    return { rows: [] };
  };

  walletLedgerService.reserveWalletBalance = async (options) => {
    reserveCalls.push(options);
    if (reserveError) throw reserveError;
    return { id: 1, user_id: options.userId };
  };

  paystackTransferService.initiateTransfer = async (options) => {
    transferCalls.push(options);
    throw new Error('Paystack request timed out');
  };
};

resetFakes();

const { runPayoutRetryCycle } = require('../services/payoutRetry.service');

test('payout retries default to disabled without database or provider calls', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'false';

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.disabled, true);
  assert.equal(databaseCalls.length, 0);
  assert.equal(transferCalls.length, 0);
});

test('enabled retries require Paystack configuration before touching payout rows', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  delete process.env.PAYSTACK_SECRET_KEY;

  await assert.rejects(runPayoutRetryCycle(), /PAYOUT_RETRY_ENABLED|PAYSTACK_SECRET_KEY/);

  assert.equal(databaseCalls.length, 0);
  assert.equal(transferCalls.length, 0);
  if (previousPaystackSecretKey !== undefined) process.env.PAYSTACK_SECRET_KEY = previousPaystackSecretKey;
});

test('a lost atomic claim skips each payout without calling Paystack', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  selectedRows = {
    agent_withdrawal_requests: [{ id: 11, status: 'approved', paystack_transfer_status: 'failed', payout_retry_count: 0, last_retry_at: null }],
    withdrawal_requests: [{ id: 22, status: 'pending', paystack_transfer_status: 'failed', payout_retry_count: 0, last_retry_at: null }],
    admin_withdrawals: [{ id: 33, status: 'pending', paystack_transfer_status: 'failed', payout_retry_count: 0, last_retry_at: null }],
  };

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.agent.skipped, 1);
  assert.equal(summary.wallet.skipped, 1);
  assert.equal(summary.stateAdmin.skipped, 1);
  assert.equal(transferCalls.length, 0);
  assert.equal(reserveCalls.length, 0);
  const claims = databaseCalls.filter((call) => call.sql.includes('COALESCE(payout_retry_count, 0)'));
  assert.equal(claims.length, 3);
  assert.ok(claims.every((call) => call.sql.includes("paystack_transfer_status IN ('failed', 'reversed')")));
});

test('a timed-out wallet transfer remains claimed with a stable reference for reconciliation', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  selectedRows = {
    withdrawal_requests: [{
      id: 91,
      user_id: 17,
      amount: '2500.00',
      status: 'pending',
      bank_code: '044',
      account_name: 'Test User',
      account_number: '0123456789',
      paystack_recipient_code: 'RCP_test',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'failed',
    }],
  };
  process.env.PAYSTACK_SECRET_KEY = 'test-key';

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.wallet.errors, 1);
  assert.equal(reserveCalls.length, 1);
  assert.equal(transferCalls.length, 1);
  assert.equal(transferCalls[0].reference, 'WLW_91_R1');

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.wallet.scanned, 0);
  assert.equal(transferCalls.length, 1);
  assert.equal(reserveCalls.length, 1);

  const claim = databaseCalls.find((call) => call.sql.includes('COALESCE(payout_retry_count, 0)'));
  assert.equal(claim.params[2], 'WLW_91_R1');
  assert.match(claim.sql, /paystack_transfer_status = 'processing'/);

  const reconciliationUpdate = databaseCalls.find((call) => call.sql.includes('SET payout_failed_reason = $1'));
  assert.ok(reconciliationUpdate);
  assert.match(reconciliationUpdate.params[0], /outcome is uncertain/i);
  assert.equal(databaseCalls.some((call) => call.sql.includes('paystack_transfer_status = $2')), false);
});

test('parallel cycles submit an agent payout at most once', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 92,
      amount: '1800.00',
      status: 'approved',
      account_name: 'Test Agent',
      account_number: '1234567890',
      bank_code: '044',
      paystack_recipient_code: 'RCP_agent',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'failed',
    }],
  };

  const summaries = await Promise.all([runPayoutRetryCycle(), runPayoutRetryCycle()]);

  assert.equal(transferCalls.length, 1);
  assert.equal(transferCalls[0].reference, 'AGW_92_R1');
  assert.equal(summaries.reduce((errors, summary) => errors + summary.agent.errors, 0), 1);
});

test('an uncertain wallet reservation stays claimed without sending a transfer', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  reserveError = new Error('Database connection dropped after reserve');
  selectedRows = {
    withdrawal_requests: [{
      id: 93,
      user_id: 18,
      amount: '900.00',
      status: 'pending',
      bank_code: '044',
      account_name: 'Test Wallet User',
      account_number: '0123456790',
      paystack_recipient_code: 'RCP_wallet',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'reversed',
    }],
  };
  process.env.PAYSTACK_SECRET_KEY = 'test-key';

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.wallet.errors, 1);
  assert.equal(reserveCalls.length, 1);
  assert.equal(transferCalls.length, 0);
  const reconciliationUpdate = databaseCalls.find((call) => call.sql.includes('SET payout_failed_reason = $1'));
  assert.match(reconciliationUpdate.params[0], /wallet reserve outcome is uncertain/i);

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.wallet.scanned, 0);
  assert.equal(reserveCalls.length, 1);
});

test('state-admin retry re-debits the refunded balance once and holds it through provider timeout', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  selectedRows = {
    admin_withdrawals: [{
      id: 94,
      admin_id: 19,
      amount: '1200.00',
      status: 'pending',
      bank_code: '044',
      account_name: 'Test Admin',
      account_number: '0123456789',
      paystack_recipient_code: 'RCP_admin',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'failed',
    }],
  };
  const startingBalance = adminWalletBalance;

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.stateAdmin.errors, 1);
  assert.equal(transferCalls.length, 1);
  assert.equal(transferCalls[0].reference, 'SAW_94_R1');
  assert.equal(adminWalletBalance, startingBalance - 1200);

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.stateAdmin.scanned, 0);
  assert.equal(transferCalls.length, 1);
  assert.equal(adminWalletBalance, startingBalance - 1200);
});

test.after(() => {
  db.query = originalQuery;
  walletLedgerService.reserveWalletBalance = originalReserveWalletBalance;
  paystackTransferService.initiateTransfer = originalInitiateTransfer;
  if (previousRetryEnabled === undefined) delete process.env.PAYOUT_RETRY_ENABLED;
  else process.env.PAYOUT_RETRY_ENABLED = previousRetryEnabled;
  if (previousPaystackSecretKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousPaystackSecretKey;
});
