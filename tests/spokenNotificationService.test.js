const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const service = require('../config/utils/spokenNotificationService');

test('spoken notification event types are defined for Phase C', () => {
  assert.equal(service.EVENT_TYPES.RENT_SAVINGS_DUE_REMINDER, 'rent_savings_due_reminder');
  assert.equal(service.EVENT_TYPES.RENT_PAYMENT_SUCCESS, 'rent_payment_success');
});

test('normalizeLanguage only allows supported languages and falls back to en', () => {
  assert.equal(service.normalizeLanguage('en'), 'en');
  assert.equal(service.normalizeLanguage('ha'), 'ha');
  assert.equal(service.normalizeLanguage('ig'), 'ig');
  assert.equal(service.normalizeLanguage('yo'), 'yo');
  assert.equal(service.normalizeLanguage('en-NG'), 'en');
  assert.equal(service.normalizeLanguage('fr'), 'en');
  assert.equal(service.normalizeLanguage(undefined), 'en');
});

test('Phase C migration creates spoken_notification_events with dedup and status constraints', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '2055_spoken_notification_events.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS spoken_notification_events/i);
  assert.match(sql, /dedup_key VARCHAR\(255\) NOT NULL/i);
  assert.match(sql, /idx_spoken_notification_events_user_dedup/i);
  assert.match(sql, /status IN \('pending', 'claimed', 'acknowledged', 'expired', 'cancelled'\)/i);
  assert.match(sql, /expires_at TIMESTAMPTZ NOT NULL/i);
  assert.match(sql, /acknowledged_at TIMESTAMPTZ/i);
});

test('rent-savings due reminder job uses rent-savings wording and emits spoken event', () => {
  const jobPath = path.join(__dirname, '..', 'jobs', 'rentSavingsJobs.js');
  const src = fs.readFileSync(jobPath, 'utf8');
  assert.match(src, /Rent-Savings Contribution Due Reminder/);
  assert.match(src, /rent-savings target/i);
  assert.doesNotMatch(src, /Rent Due Date Approaching!/);
  assert.match(src, /emitSpokenEvent/);
  assert.match(src, /RENT_SAVINGS_DUE_REMINDER/);
});

test('payment service emits spoken event only for completed rent payment with dedup key', () => {
  const paymentPath = path.join(__dirname, '..', 'services', 'paymentService.js');
  const src = fs.readFileSync(paymentPath, 'utf8');
  assert.match(src, /RENT_PAYMENT_SUCCESS/);
  assert.match(src, /rent-payment-success:\$\{paymentId\}/);
  assert.match(src, /event === 'completed'/);
  assert.match(src, /Your rent payment was successful\. You can view the receipt details in the app\./);
});