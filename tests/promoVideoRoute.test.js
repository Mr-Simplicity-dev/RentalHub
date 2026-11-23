const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const promoVideosRoutes = require('../routes/promoVideos');

const startApp = async () => {
  const app = express();
  app.use('/api/promo-videos', promoVideosRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
};

test('promo manifest endpoint returns public catalog', async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const res = await fetch(`${baseUrl}/api/promo-videos/manifest`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.assets.flagship.vertical.en.available, true);
  assert.equal(body.data.assets.flagship.vertical.ha.available, false);
  assert.equal(JSON.stringify(body).includes('absPath'), false);
});

test('promo download serves English asset with meaningful filename and rejects unavailable languages', async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const enRes = await fetch(`${baseUrl}/api/promo-videos/download/flagship/vertical/en`);
  assert.equal(enRes.status, 200);
  const disposition = enRes.headers.get('content-disposition') || '';
  assert.match(disposition, /amana-app-tour-9x16-en\.mp4/);
  const buf = Buffer.from(await enRes.arrayBuffer());
  assert.ok(buf.length > 1000);

  const haRes = await fetch(`${baseUrl}/api/promo-videos/download/flagship/vertical/ha`);
  assert.equal(haRes.status, 404);
  const haBody = await haRes.json();
  assert.equal(haBody.success, false);
  assert.equal(haBody.code, 'PROMO_LANGUAGE_UNAVAILABLE');
});

test('promo download rejects invalid selection params', async (t) => {
  const { server, baseUrl } = await startApp();
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const badEdition = await fetch(`${baseUrl}/api/promo-videos/download/bad/vertical/en`);
  assert.equal(badEdition.status, 400);
  const badFormat = await fetch(`${baseUrl}/api/promo-videos/download/flagship/square/en`);
  assert.equal(badFormat.status, 400);
  const badLang = await fetch(`${baseUrl}/api/promo-videos/download/flagship/vertical/fr`);
  assert.equal(badLang.status, 400);
});
