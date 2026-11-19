const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const controllerPath = require.resolve('../../controllers/locationController');
const previousController = require.cache[controllerPath];
const property = (_req, res) => res.json({ data: { title: 'Test home', landlord_phone: '08000000000', landlord_email: 'owner@example.test' } });
require.cache[controllerPath] = { id: controllerPath, filename: controllerPath, loaded: true, exports: {
  getAreaPage: property, getLocationPage: property, getNigeriaDirectory: property,
} };
const locationRoutes = require('../../routes/locationRoutes');
if (previousController) require.cache[controllerPath] = previousController;
else delete require.cache[controllerPath];

async function withApp(run) {
  const app = express();
  app.use('/', locationRoutes);
  app.use('/api', locationRoutes);
  for (const channel of ['sms', 'whatsapp', 'email']) {
    app.get('/api/' + channel + '-marketing/contacts', (_req, res) => res.json({
      data: [{ phone: '+2348000000000', email: 'recipient@example.test' }],
    }));
  }
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}

for (const channel of ['sms', 'whatsapp', 'email']) {
  test(channel + ' contacts keep their recipient details after passing the location router', async () => {
    await withApp(async base => {
      const response = await fetch(base + '/api/' + channel + '-marketing/contacts');
      assert.equal(response.status, 200);
      const { data } = await response.json();
      assert.equal(data[0].phone, '+2348000000000');
      assert.equal(data[0].email, 'recipient@example.test');
    });
  });
}

test('all public location routes still hide owner phone numbers and email addresses', async () => {
  await withApp(async base => {
    for (const prefix of ['', '/api']) {
      for (const path of ['/nigeria', '/nigeria/lagos', '/nigeria/lagos/ikeja', '/areas/lagos/ikeja/alausa']) {
        const response = await fetch(base + prefix + path);
        assert.equal(response.status, 200);
        const { data } = await response.json();
        assert.equal(data.title, 'Test home');
        assert.equal(data.landlord_phone, undefined);
        assert.equal(data.landlord_email, undefined);
      }
    }
  });
});
