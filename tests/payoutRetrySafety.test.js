const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/middleware/database');
const walletLedgerService = require('../services/walletLedgerService');
const paystackTransferService = require('../services/paystackTransfer.service');
const AgentWithdrawalService = require('../services/agentWithdrawalService');

const originalQuery = db.query;
const originalConnect = db.connect;
const originalReserveWalletBalance = walletLedgerService.reserveWalletBalance;
const originalInitiateTransfer = paystackTransferService.initiateTransfer;
const originalVerifyTransferByReference = paystackTransferService.verifyTransferByReference;
const previousRetryEnabled = process.env.PAYOUT_RETRY_ENABLED;
const previousPaystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

let selectedRows = {};
let claimSucceeds = false;
let reserveError = null;
let adminWalletBalance = 5000;
let agentPendingEarnings = 100000;
let agentPaidEarnings = 0;
let verifyTransferResult = null;
let mutateRefOnSelect = null;
let databaseCalls = [];
let reserveCalls = [];
let transferCalls = [];
let verifyCalls = [];

process.env.PAYOUT_RETRY_ENABLED = 'false';

const resetFakes = () => {
  selectedRows = {};
  claimSucceeds = false;
  reserveError = null;
  adminWalletBalance = 5000;
  agentPendingEarnings = 100000;
  agentPaidEarnings = 0;
  verifyTransferResult = null;
  mutateRefOnSelect = null;
  databaseCalls = [];
  reserveCalls = [];
  transferCalls = [];
  verifyCalls = [];

  db.query = async (sql, params = []) => {
    const normalizedSql = String(sql).replace(/\s+/g, ' ').trim();
    databaseCalls.push({ sql: normalizedSql, params });

    if (/^ALTER TABLE /i.test(normalizedSql)) return { rows: [] };

    if (normalizedSql.includes('FROM agent_withdrawal_requests') && normalizedSql.includes('WHERE paystack_transfer_reference = $1')) {
      const row = (selectedRows.agent_withdrawal_requests || []).find((item) => item.paystack_transfer_reference === params[0]);
      if (row && mutateRefOnSelect) {
        row.paystack_transfer_reference = mutateRefOnSelect;
        mutateRefOnSelect = null;
      }
      return { rows: row ? [{ ...row }] : [] };
    }

    const selectTable = normalizedSql.match(/^SELECT \* FROM (agent_withdrawal_requests|withdrawal_requests|admin_withdrawals)\b/i)?.[1];
    if (selectTable) {
      const rows = selectedRows[selectTable] || [];
      if (normalizedSql.includes('paystack_transfer_reference IS NOT NULL')) {
        return {
          rows: rows
            .filter((row) =>
              row.paystack_transfer_reference &&
              (row.paystack_transfer_status === 'unknown' ||
               (row.paystack_transfer_status === 'processing' && row.payout_attempted_at))
            )
            .map((row) => ({ ...row })),
        };
      }
      const allowedStatuses = selectTable === 'agent_withdrawal_requests'
        ? ['approved', 'processing']
        : ['pending', 'approved'];
      return {
        rows: rows
          .filter((row) =>
            ['failed', 'reversed'].includes(row.paystack_transfer_status) && allowedStatuses.includes(row.status)
          )
          .map((row) => ({ ...row })),
      };
    }

    if (normalizedSql.includes("paystack_transfer_status IN ('unknown', 'processing')")) {
      const table = normalizedSql.match(/^UPDATE (agent_withdrawal_requests|withdrawal_requests|admin_withdrawals)\b/i)?.[1];
      const isRelease = normalizedSql.includes('payout_failed_reason = $4');
      const idParamIndex = isRelease ? 4 : 2;
      const refParamIndex = isRelease ? 5 : 3;
      const row = (selectedRows[table] || []).find((item) => item.id === params[idParamIndex]);
      if (
        !row ||
        row.paystack_transfer_reference !== params[refParamIndex] ||
        !['unknown', 'processing'].includes(row.paystack_transfer_status)
      ) return { rows: [] };
      row.paystack_transfer_status = isRelease ? params[1] : 'success';
      row.status = params[0];
      return { rows: [{ id: row.id }] };
    }

    if (normalizedSql.includes('completed_date = CASE WHEN $1')) {
      const transferStatus = params[1];
      const row = (selectedRows.agent_withdrawal_requests || []).find((item) => item.id === params[4]);
      if (!row || row.paystack_transfer_reference !== params[5]) return { rows: [] };
      const current = row.paystack_transfer_status;
      const guardPasses =
        transferStatus === 'success'
          ? !['success', 'reversed'].includes(current)
          : transferStatus === 'reversed'
            ? current !== 'reversed'
            : !['success', 'failed', 'reversed'].includes(current);
      if (!guardPasses) return { rows: [] };
      row.status = params[0];
      row.paystack_transfer_status = transferStatus;
      return { rows: [{ ...row }] };
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

    if (normalizedSql.includes('UPDATE agent_earnings_summary') && normalizedSql.includes('total_paid = total_paid + $1')) {
      agentPaidEarnings += Number(params[0]);
      return { rows: [{ agent_user_id: params[1] }] };
    }

    if (normalizedSql.includes('UPDATE agent_earnings_summary') && normalizedSql.includes('total_pending = total_pending - $1')) {
      const amount = Number(params[0]);
      if (agentPendingEarnings < amount) return { rows: [] };
      agentPendingEarnings -= amount;
      return { rows: [{ total_pending: agentPendingEarnings }] };
    }

    if (normalizedSql.includes('UPDATE agent_earnings_summary') && normalizedSql.includes('total_pending = total_pending + $1')) {
      agentPendingEarnings += Number(params[0]);
      return { rows: [{ agent_user_id: params[1] }] };
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

  db.connect = async () => ({
    query: (sql, params) => db.query(sql, params),
    release: () => {},
  });

  walletLedgerService.reserveWalletBalance = async (options) => {
    reserveCalls.push(options);
    if (reserveError) throw reserveError;
    return { id: 1, user_id: options.userId };
  };

  paystackTransferService.initiateTransfer = async (options) => {
    transferCalls.push(options);
    throw new Error('Paystack request timed out');
  };

  paystackTransferService.verifyTransferByReference = async (reference) => {
    verifyCalls.push(reference);
    if (typeof verifyTransferResult === 'function') return verifyTransferResult(reference);
    return verifyTransferResult;
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
  else process.env.PAYSTACK_SECRET_KEY = 'test-key';
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
  assert.equal(transferCalls[0].reference, 'ARH_WLW_91_R1');

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.wallet.scanned, 0);
  assert.equal(transferCalls.length, 1);
  assert.equal(reserveCalls.length, 1);

  const claim = databaseCalls.find((call) => call.sql.includes('COALESCE(payout_retry_count, 0)'));
  assert.equal(claim.params[2], 'ARH_WLW_91_R1');
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
  assert.equal(transferCalls[0].reference, 'ARH_AGW_92_R1');
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
  assert.equal(transferCalls[0].reference, 'ARH_SAW_94_R1');
  assert.equal(adminWalletBalance, startingBalance - 1200);

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.stateAdmin.scanned, 0);
  assert.equal(transferCalls.length, 1);
  assert.equal(adminWalletBalance, startingBalance - 1200);
});

test('an agent retry re-reserves released earnings and holds them through provider timeout', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 95,
      amount: '1800.00',
      status: 'approved',
      agent_user_id: 21,
      landlord_user_id: 31,
      account_name: 'Test Agent',
      account_number: '1234567890',
      bank_code: '044',
      paystack_recipient_code: 'RCP_agent',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'failed',
    }],
  };
  process.env.PAYSTACK_SECRET_KEY = 'test-key';
  const startingPending = agentPendingEarnings;

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.agent.errors, 1);
  assert.equal(transferCalls.length, 1);
  const reserve = databaseCalls.find((call) => call.sql.includes('total_pending = total_pending - $1'));
  assert.ok(reserve, 'retry must re-reserve agent earnings before initiating the transfer');
  assert.deepEqual(reserve.params, ['1800.00', 21, 31]);
  assert.equal(agentPendingEarnings, startingPending - 1800, 'reserved earnings stay held while the transfer outcome is unknown');

  const refund = databaseCalls.find((call) => call.sql.includes('total_pending = total_pending + $1'));
  assert.equal(refund, undefined, 'an uncertain transfer must not refund the reservation');

  const followUpSummary = await runPayoutRetryCycle();
  assert.equal(followUpSummary.agent.scanned, 0);
  assert.equal(agentPendingEarnings, startingPending - 1800);
});

test('a retry with insufficient pending earnings restores the claim without calling Paystack', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  claimSucceeds = true;
  agentPendingEarnings = 500;
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 96,
      amount: '1800.00',
      status: 'approved',
      agent_user_id: 22,
      landlord_user_id: 32,
      account_name: 'Test Agent',
      account_number: '1234567890',
      bank_code: '044',
      paystack_recipient_code: 'RCP_agent',
      payout_retry_count: 0,
      last_retry_at: null,
      paystack_transfer_status: 'failed',
    }],
  };
  process.env.PAYSTACK_SECRET_KEY = 'test-key';

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.agent.skipped, 1);
  assert.equal(transferCalls.length, 0);
  assert.equal(agentPendingEarnings, 500);
  const restore = databaseCalls.find((call) => call.sql.includes('payout_failed_reason = $3') && call.sql.includes("paystack_transfer_status = 'processing'"));
  assert.ok(restore, 'the retry claim must be released when earnings cannot be reserved');
  assert.equal(restore.params[2], 'Agent earnings reserve unavailable for retry');
  const audit = databaseCalls.find((call) => call.sql.includes('INSERT INTO payout_retry_audit'));
  assert.ok(audit);
  assert.equal(audit.params[7], 'skipped_insufficient_funds');
});

test('reconciliation cannot settle a payout whose reference changed after verification', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  process.env.PAYSTACK_SECRET_KEY = 'test-key';
  const staleRow = {
    id: 97,
    amount: '2200.00',
    status: 'processing',
    agent_user_id: 23,
    landlord_user_id: 33,
    payout_retry_count: 1,
    paystack_transfer_reference: 'AGW_97_R1',
    paystack_transfer_status: 'unknown',
    payout_attempted_at: new Date(Date.now() - 60 * 60 * 1000),
    updated_at: new Date(Date.now() - 60 * 60 * 1000),
  };
  selectedRows = { agent_withdrawal_requests: [staleRow] };
  verifyTransferResult = async () => {
    staleRow.paystack_transfer_reference = 'AGW_97_R2';
    return { status: 'success', transfer_code: 'TRF_stale' };
  };

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.unknown.agent.scanned, 1);
  assert.equal(agentPaidEarnings, 0, 'a stale reference must not receive the settlement accounting');
  const settleClaim = databaseCalls.find((call) => call.sql.includes("paystack_transfer_status IN ('unknown', 'processing')") && call.sql.includes('$4'));
  assert.ok(settleClaim);
  assert.equal(settleClaim.params[3], 'AGW_97_R1');
  assert.equal(staleRow.paystack_transfer_status, 'unknown');
  assert.equal(staleRow.status, 'processing');
});

test('reconciliation settles earnings exactly once for the matching reference', async () => {
  process.env.PAYOUT_RETRY_ENABLED = 'true';
  resetFakes();
  process.env.PAYSTACK_SECRET_KEY = 'test-key';
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 98,
      amount: '1500.00',
      status: 'processing',
      agent_user_id: 24,
      landlord_user_id: 34,
      payout_retry_count: 1,
      paystack_transfer_reference: 'AGW_98_R1',
      paystack_transfer_status: 'unknown',
      payout_attempted_at: new Date(Date.now() - 60 * 60 * 1000),
      updated_at: new Date(Date.now() - 60 * 60 * 1000),
    }],
  };
  verifyTransferResult = { status: 'success', transfer_code: 'TRF_ok' };

  const summary = await runPayoutRetryCycle();

  assert.equal(summary.unknown.agent.reconciled, 1);
  assert.equal(agentPaidEarnings, 1500);
  const paidCalls = databaseCalls.filter((call) => call.sql.includes('total_paid = total_paid + $1'));
  assert.equal(paidCalls.length, 1);
  assert.equal(selectedRows.agent_withdrawal_requests[0].paystack_transfer_status, 'success');

  const secondSummary = await runPayoutRetryCycle();
  assert.equal(secondSummary.unknown.agent.scanned, 0);
  assert.equal(agentPaidEarnings, 1500, 'a settled payout must never be credited twice');
});

test('webhook reconciliation credits the earnings once and ignores duplicate deliveries', async () => {
  resetFakes();
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 99,
      amount: '1800.00',
      status: 'processing',
      agent_user_id: 25,
      landlord_user_id: 35,
      payout_retry_count: 1,
      paystack_transfer_reference: 'AGW_99_R1',
      paystack_transfer_status: 'processing',
      payout_attempted_at: new Date(),
    }],
  };
  const startingPending = agentPendingEarnings;

  const first = await AgentWithdrawalService.reconcilePaystackTransfer('AGW_99_R1', 'success', { transfer_code: 'TRF_99' });
  assert.ok(first);
  assert.equal(first.status, 'completed');
  assert.equal(agentPaidEarnings, 1800);
  assert.equal(agentPendingEarnings, startingPending);

  const duplicate = await AgentWithdrawalService.reconcilePaystackTransfer('AGW_99_R1', 'failed', { failure_reason: 'late failure event' });
  assert.equal(duplicate, null, 'a settled payout must reject later contradictory deliveries');
  assert.equal(agentPaidEarnings, 1800);
  assert.equal(agentPendingEarnings, startingPending, 'a duplicate delivery must not release reserved earnings again');
  const paidCalls = databaseCalls.filter((call) => call.sql.includes('total_paid = total_paid + $1'));
  assert.equal(paidCalls.length, 1);
});

test('webhook reconciliation cannot apply a stale reference to a newer retry', async () => {
  resetFakes();
  selectedRows = {
    agent_withdrawal_requests: [{
      id: 100,
      amount: '900.00',
      status: 'processing',
      agent_user_id: 26,
      landlord_user_id: 36,
      payout_retry_count: 2,
      paystack_transfer_reference: 'AGW_100_R2',
      paystack_transfer_status: 'processing',
      payout_attempted_at: new Date(),
    }],
  };
  const startingPending = agentPendingEarnings;

  const staleLookup = await AgentWithdrawalService.reconcilePaystackTransfer('AGW_100_R1', 'failed', { failure_reason: 'stale delivery' });
  assert.equal(staleLookup, null, 'a reference that no longer exists must be a no-op');

  mutateRefOnSelect = 'AGW_100_R3';
  const raced = await AgentWithdrawalService.reconcilePaystackTransfer('AGW_100_R2', 'failed', { failure_reason: 'raced delivery' });
  assert.equal(raced, null, 'a reference superseded between lookup and claim must be a no-op');
  assert.equal(agentPendingEarnings, startingPending, 'no earnings accounting may run for a stale reference');
  const releaseCalls = databaseCalls.filter((call) => call.sql.includes('total_pending = total_pending + $1'));
  assert.equal(releaseCalls.length, 0);
});

test.after(() => {
  db.query = originalQuery;
  db.connect = originalConnect;
  walletLedgerService.reserveWalletBalance = originalReserveWalletBalance;
  paystackTransferService.initiateTransfer = originalInitiateTransfer;
  paystackTransferService.verifyTransferByReference = originalVerifyTransferByReference;
  if (previousRetryEnabled === undefined) delete process.env.PAYOUT_RETRY_ENABLED;
  else process.env.PAYOUT_RETRY_ENABLED = previousRetryEnabled;
  if (previousPaystackSecretKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousPaystackSecretKey;
});
