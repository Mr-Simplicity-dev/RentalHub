const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const {
  consumeCaptureTickets,
  getCommittedClipRetry,
  hashCaptureToken,
  issueCaptureTicket,
  lockCaptureTickets,
} = require('../../services/propertyCaptureTicketService');

const migration = fs.readFileSync(
  path.join(__dirname, '../../migrations/2062_property_capture_ticket_storage.sql'),
  'utf8'
);

const createDatabase = async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (7);
    CREATE TABLE properties (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL,
      user_id INTEGER
    );
    CREATE TABLE property_photos (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      photo_url TEXT NOT NULL,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      upload_order INTEGER
    );
  `);
  await pg.exec(migration);
  return pg;
};

test('capture tickets persist only hashed tokens and are visible to another worker', async () => {
  const pg = await createDatabase();
  try {
    const rawToken = await issueCaptureTicket(7, pg);
    const stored = await pg.query(
      'SELECT token_hash, user_id, expires_at FROM property_capture_tickets'
    );

    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].token_hash, hashCaptureToken(rawToken));
    assert.notEqual(stored.rows[0].token_hash, rawToken);

    const secondWorker = await lockCaptureTickets(pg, 7, [rawToken]);
    assert.equal(secondWorker.valid, true);
    assert.equal(secondWorker.hashes[0], stored.rows[0].token_hash);
  } finally {
    await pg.close();
  }
});

test('tickets are one-use and failed validation does not consume them', async () => {
  const pg = await createDatabase();
  try {
    const rawToken = await issueCaptureTicket(7, pg);
    const failedValidation = await lockCaptureTickets(pg, 7, [rawToken]);
    assert.equal(failedValidation.valid, true);
    assert.equal((await pg.query(
      'SELECT consumed_at FROM property_capture_tickets'
    )).rows[0].consumed_at, null);

    await pg.query('INSERT INTO properties (landlord_id) VALUES (7)');
    const tickets = await lockCaptureTickets(pg, 7, [rawToken]);
    await consumeCaptureTickets(pg, 7, tickets.hashes, 1);

    const reused = await lockCaptureTickets(pg, 7, [rawToken]);
    assert.deepEqual(reused, { valid: false, reason: 'used' });
  } finally {
    await pg.close();
  }
});

test('expired, unknown, duplicate, and wrong-owner tickets remain unconsumed', async () => {
  const pg = await createDatabase();
  try {
    const rawToken = await issueCaptureTicket(7, pg);
    await pg.query(
      `UPDATE property_capture_tickets
       SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'`
    );

    assert.deepEqual(await lockCaptureTickets(pg, 7, [rawToken]), {
      valid: false,
      reason: 'expired',
    });
    assert.deepEqual(await lockCaptureTickets(pg, 8, [rawToken]), {
      valid: false,
      reason: 'invalid',
    });
    assert.deepEqual(await lockCaptureTickets(pg, 7, [rawToken, rawToken]), {
      valid: false,
      reason: 'invalid',
    });
    assert.equal((await pg.query(
      'SELECT consumed_at FROM property_capture_tickets'
    )).rows[0].consumed_at, null);
  } finally {
    await pg.close();
  }
});

test('committed clip tickets return the existing clips for a safe retry', async () => {
  const pg = await createDatabase();
  try {
    const rawToken = await issueCaptureTicket(7, pg);
    const ticket = await lockCaptureTickets(pg, 7, [rawToken]);
    await pg.query('INSERT INTO properties (landlord_id) VALUES (7)');
    await pg.query(
      `INSERT INTO property_clips (property_id, clip_url, capture_token_hash)
       VALUES (1, 'https://example.test/clip.mp4', $1)`,
      [ticket.hashes[0]]
    );
    await consumeCaptureTickets(pg, 7, ticket.hashes, 1);

    const retry = await getCommittedClipRetry(pg, 7, ticket.hashes, 1);
    assert.equal(retry.length, 1);
    assert.equal(retry[0].clip_url, 'https://example.test/clip.mp4');
    assert.equal(await getCommittedClipRetry(pg, 7, ticket.hashes, 2), null);
  } finally {
    await pg.close();
  }
});

test('submission key index prevents duplicate rows for the same landlord', async () => {
  const pg = await createDatabase();
  try {
    await pg.query(
      `INSERT INTO properties (landlord_id, submission_key, submission_fingerprint)
       VALUES (7, 'listing-retry-identifier-123', 'fingerprint')`
    );
    await assert.rejects(
      pg.query(
        `INSERT INTO properties (landlord_id, submission_key, submission_fingerprint)
         VALUES (7, 'listing-retry-identifier-123', 'fingerprint')`
      ),
      { code: '23505' }
    );
  } finally {
    await pg.close();
  }
});
