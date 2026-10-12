const test = require('node:test');
const assert = require('node:assert/strict');

const walletLedgerService = require('../services/walletLedgerService');

test('reserveWalletBalance reserves available funds without reducing wallet balance', async () => {
  const calls = [];
  const fakeExecutor = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ id: 9, user_id: 42, balance: '100.00', reserved_balance: '50.00' }],
      };
    },
  };

  const result = await walletLedgerService.reserveWalletBalance({
    userId: 42,
    amount: 50,
    executor: fakeExecutor,
  });

  assert.equal(result.user_id, 42);
  assert.equal(result.reserved_balance, '50.00');

  const reserveCall = calls.find((call) => /reserved_balance = reserved_balance \+ \$1/i.test(call.sql));
  assert.ok(reserveCall);
  assert.match(reserveCall.sql, /balance\s*-\s*reserved_balance/i);
});

test('releaseWalletReservation removes only the reservation without restoring balance', async () => {
  const calls = [];
  const fakeExecutor = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{ id: 9, user_id: 42, balance: '100.00', reserved_balance: '0.00' }],
      };
    },
  };

  const result = await walletLedgerService.releaseWalletReservation({
    userId: 42,
    amount: 50,
    executor: fakeExecutor,
  });

  assert.equal(result.user_id, 42);
  assert.equal(result.reserved_balance, '0.00');

  const releaseCall = calls.find((call) => /GREATEST\(reserved_balance - \$1, 0\)/i.test(call.sql));
  assert.ok(releaseCall);
});
