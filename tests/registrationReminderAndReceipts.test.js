const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runRegistrationReminders,
  expireAbandonedRegistrations,
  reconcileRegisteredUsers,
  getAbandonedRegistrationsSummary,
} = require('../jobs/registrationReminderJobs');

const {
  sendAdminPayoutReceipt,
  sendAgentPayoutReceipt,
  sendUserPayoutReceipt,
} = require('../config/utils/paymentReceipt');

test('registrationReminderJobs exports expected functions', () => {
  assert.equal(typeof runRegistrationReminders, 'function');
  assert.equal(typeof expireAbandonedRegistrations, 'function');
  assert.equal(typeof reconcileRegisteredUsers, 'function');
  assert.equal(typeof getAbandonedRegistrationsSummary, 'function');
});

test('paymentReceipt functions handle missing or empty snapshots gracefully without throwing', async () => {
  assert.equal(typeof sendAdminPayoutReceipt, 'function');
  assert.equal(typeof sendAgentPayoutReceipt, 'function');
  assert.equal(typeof sendUserPayoutReceipt, 'function');

  // Verify non-throwing invocation on missing adminId
  await assert.doesNotReject(async () => {
    await sendAdminPayoutReceipt({
      adminId: null,
      amount: 50000,
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'John Doe',
      reference: 'SAW_TEST_1',
      snapshot: null,
    });
  });

  await assert.doesNotReject(async () => {
    await sendAdminPayoutReceipt({
      adminId: null,
      amount: 50000,
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'John Doe',
      reference: 'SAW_TEST_2',
      status: 'rejected',
      note: 'Account name mismatch',
      snapshot: [
        { id: 1, source: 'inspection_fee', amount: 5000, commission_rate: '10%' },
        { id: 2, source: 'agreement_fee', amount: 45000, commission_rate: '15%' },
      ],
    });
  });

  await assert.doesNotReject(async () => {
    await sendAgentPayoutReceipt({
      agentUserId: null,
      amount: 25000,
      reference: 'AG_TEST_1',
      status: 'rejected',
      note: 'KYC documents expired',
    });
  });

  await assert.doesNotReject(async () => {
    await sendUserPayoutReceipt({
      userId: null,
      amount: 15000,
      bankName: 'Access Bank',
      accountNumber: '1234567890',
      accountName: 'Jane Doe',
      reference: 'WDR_TEST_1',
      status: 'rejected',
      note: 'Invalid bank account number',
    });
  });
});
