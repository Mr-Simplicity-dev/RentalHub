const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const db = require('../config/middleware/database');
const { cloudinary } = require('../config/middleware/upload');
const propertyService = require('../services/propertyService');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

test('valid listing saves against landlord_id, links photos, retries once, and appears in My Properties', async () => {
  const pg = new PGlite();
  const originalQuery = db.query;
  const originalConnect = db.connect;
  const originalDestroy = cloudinary.uploader.destroy;
  const cleanedUploads = [];

  await pg.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      user_type TEXT NOT NULL,
      identity_verified BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE states (
      id INTEGER PRIMARY KEY,
      state_name TEXT NOT NULL,
      state_code TEXT NOT NULL
    );
    CREATE TABLE properties (
      id SERIAL PRIMARY KEY,
      landlord_id INTEGER NOT NULL REFERENCES users(id),
      state VARCHAR(120),
      state_id INTEGER NOT NULL REFERENCES states(id),
      city VARCHAR(100) NOT NULL,
      area VARCHAR(100) NOT NULL,
      full_address TEXT NOT NULL,
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      property_type VARCHAR(50) NOT NULL,
      bedrooms INTEGER NOT NULL,
      bathrooms INTEGER NOT NULL,
      parking_spaces INTEGER NOT NULL DEFAULT 0,
      price DECIMAL(12, 2),
      rent_amount DECIMAL(12, 2) NOT NULL,
      payment_frequency VARCHAR(20) DEFAULT 'yearly',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      amenities JSONB DEFAULT '[]',
      structured_features JSONB DEFAULT '{}',
      is_available BOOLEAN DEFAULT TRUE,
      is_verified BOOLEAN DEFAULT FALSE,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      video_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE property_photos (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      photo_url VARCHAR(500) NOT NULL,
      is_primary BOOLEAN DEFAULT FALSE,
      upload_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE payments (id SERIAL PRIMARY KEY);
    CREATE TABLE property_update_requests (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE applications (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id)
    );
    CREATE TABLE reviews (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id),
      rating INTEGER NOT NULL
    );
    INSERT INTO users (id, user_type, identity_verified) VALUES (7, 'landlord', TRUE);
    INSERT INTO states (id, state_name, state_code) VALUES (1, 'Lagos', 'LA');
  `);

  const query = async (sql, params = []) => {
    const statement = String(sql);
    if (statement.split(';').filter((part) => part.trim()).length > 1) {
      await pg.exec(statement);
      return { rows: [], rowCount: 0 };
    }
    return pg.query(statement, params);
  };
  const client = {
    query,
    release() {},
  };
  db.query = query;
  db.connect = async () => client;
  cloudinary.uploader.destroy = async (publicId) => {
    cleanedUploads.push(publicId);
    return { result: 'ok' };
  };

  const landlordRequest = (body) => ({
    body,
    files: {
      images: [{
        path: 'https://test.invalid/landlord-photo.jpg',
        filename: 'test/listing-photo',
        mimetype: 'image/jpeg',
      }],
      video: [],
    },
    user: { id: 7, user_type: 'landlord' },
    query: {},
    params: {},
    logger: { error() {} },
  });

  try {
    const ownerColumns = (await pg.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'properties'
         AND column_name IN ('landlord_id', 'user_id')
       ORDER BY column_name`
    )).rows.map((row) => row.column_name);
    assert.deepEqual(ownerColumns, ['landlord_id']);

    const captureResponse = response();
    await propertyService.createPropertyImageCaptureSession(
      { user: { id: 7 }, logger: { error() {} } },
      captureResponse
    );
    assert.equal(captureResponse.statusCode, 200);
    const captureToken = captureResponse.body.data.token;

    const validBody = {
      state_id: '1',
      state: 'Lagos',
      lga_name: 'Ikeja',
      city: 'Ikeja',
      area: 'Allen Avenue',
      full_address: '10 Allen Avenue, Ikeja, Lagos',
      latitude: '6.6018',
      longitude: '3.3515',
      property_type: 'apartment',
      bedrooms: '2',
      bathrooms: '1',
      parking_spaces: '1',
      rent_amount: '1200000',
      payment_frequency: 'yearly',
      title: 'Integration test listing',
      description: 'A complete, isolated listing submission.',
      amenities: '[]',
      structured_features: '{}',
      submission_key: 'valid-listing-submit-key-2026',
      image_capture_source: 'live_camera',
      image_capture_tokens: JSON.stringify([captureToken]),
    };

    const failedSaveResponse = response();
    await propertyService.createProperty(
      landlordRequest({ ...validBody, rent_amount: 'not-a-number' }),
      failedSaveResponse
    );
    assert.equal(failedSaveResponse.statusCode, 500);
    assert.equal(failedSaveResponse.body.success, false);
    assert.equal(Number((await pg.query('SELECT COUNT(*) FROM properties')).rows[0].count), 0);
    assert.equal(Number((await pg.query('SELECT COUNT(*) FROM property_photos')).rows[0].count), 0);
    assert.equal(
      (await pg.query('SELECT consumed_at FROM property_capture_tickets')).rows[0].consumed_at,
      null
    );

    const submittedResponse = response();
    await propertyService.createProperty(landlordRequest(validBody), submittedResponse);
    assert.equal(submittedResponse.statusCode, 201);
    assert.equal(submittedResponse.body.success, true);

    const saved = (await pg.query(
      `SELECT id, landlord_id, status, is_verified
       FROM properties`
    )).rows[0];
    assert.equal(Number(saved.landlord_id), 7);
    assert.equal(saved.status, 'pending');
    assert.equal(saved.is_verified, false);

    const photos = (await pg.query(
      `SELECT property_id, photo_url, is_primary
       FROM property_photos`
    )).rows;
    assert.equal(photos.length, 1);
    assert.equal(Number(photos[0].property_id), Number(saved.id));
    assert.equal(photos[0].photo_url, 'https://test.invalid/landlord-photo.jpg');
    assert.equal(photos[0].is_primary, true);

    const retryResponse = response();
    await propertyService.createProperty(landlordRequest(validBody), retryResponse);
    assert.equal(retryResponse.statusCode, 200);
    assert.equal(retryResponse.body.already_submitted, true);
    assert.equal(Number((await pg.query('SELECT COUNT(*) FROM properties')).rows[0].count), 1);
    assert.equal(Number((await pg.query('SELECT COUNT(*) FROM property_photos')).rows[0].count), 1);

    const myPropertiesResponse = response();
    await propertyService.getMyProperties(
      landlordRequest({}),
      myPropertiesResponse
    );
    assert.equal(myPropertiesResponse.body.success, true);
    assert.equal(myPropertiesResponse.body.data.length, 1);
    assert.equal(Number(myPropertiesResponse.body.data[0].id), Number(saved.id));
    assert.equal(myPropertiesResponse.body.data[0].primary_photo, photos[0].photo_url);
    assert.equal(Number(myPropertiesResponse.body.data[0].photo_count), 1);
    assert.deepEqual(cleanedUploads, ['test/listing-photo', 'test/listing-photo']);
  } finally {
    db.query = originalQuery;
    db.connect = originalConnect;
    cloudinary.uploader.destroy = originalDestroy;
    await pg.close();
  }
});
