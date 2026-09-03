const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('survey boundary: polygon resolve + name-key matching', () => {
  const fixture = {
    count: 2,
    source: 'test',
    features: [
      {
        s: 'FederalCapitalTerritory',
        lga: 'Gwagwalada',
        c: [[[6.9, 8.7], [7.3, 8.7], [7.3, 9.1], [6.9, 9.1], [6.9, 8.7]]],
      },
      {
        s: 'Abia',
        lga: 'AbaNorth',
        c: [[[7.3, 5.0], [7.6, 5.0], [7.6, 5.4], [7.3, 5.4], [7.3, 5.0]]],
      },
    ],
  };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rb-')), 'lgas.json');
  fs.writeFileSync(file, JSON.stringify(fixture));
  process.env.SURVEY_BOUNDARY_FILE = file;

  const sb = require('../services/surveyBoundary');
  assert.strictEqual(sb.boundariesReady(), true);

  let r = sb.resolve(8.9, 7.1);
  assert.ok(r, 'expected a polygon hit inside Gwagwalada');
  assert.strictEqual(r.lga, 'Gwagwalada');
  assert.strictEqual(sb.stateKeyMatches('Federal Capital Territory', r.state), true);
  assert.strictEqual(sb.stateKeyMatches('FCT', r.state), true);
  assert.strictEqual(sb.lgaKeyMatches('Gwagwalada', r.lga), true);

  r = sb.resolve(5.2, 7.4);
  assert.ok(r, 'expected a polygon hit inside Aba North');
  assert.strictEqual(r.lga, 'AbaNorth');
  assert.strictEqual(sb.lgaKeyMatches('Aba North', r.lga), true);

  assert.strictEqual(sb.resolve(-4.0, 12.0), null, 'point outside every polygon should miss');
});
