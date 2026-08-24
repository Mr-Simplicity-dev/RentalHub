const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findTargetResult,
  normalizeHostname,
} = require('../config/utils/serpTracker');

test('normalizes www and non-www hostnames to the same domain', () => {
  assert.equal(
    normalizeHostname('https://www.rentalhub.com.ng/properties'),
    'rentalhub.com.ng'
  );
});

test('finds the actual RentalHub position by domain', () => {
  const result = findTargetResult(
    [
      { position: 1, title: 'Competitor', link: 'https://example.com/listings' },
      {
        position: 7,
        title: 'RentalHub Ikeja',
        link: 'https://www.rentalhub.com.ng/nigeria/lagos/ikeja',
      },
    ],
    'https://rentalhub.com.ng'
  );

  assert.deepEqual(result, {
    position: 7,
    resultUrl: 'https://www.rentalhub.com.ng/nigeria/lagos/ikeja',
    resultTitle: 'RentalHub Ikeja',
  });
});

test('returns null instead of inventing a position when RentalHub is absent', () => {
  const result = findTargetResult(
    [{ position: 1, title: 'Competitor', link: 'https://example.com/listings' }],
    'https://rentalhub.com.ng'
  );

  assert.equal(result, null);
});

test('supports exact page matching when requested', () => {
  const results = [
    {
      position: 3,
      title: 'Another RentalHub page',
      link: 'https://rentalhub.com.ng/properties',
    },
    {
      position: 9,
      title: 'Target RentalHub page',
      link: 'https://rentalhub.com.ng/nigeria/lagos/ikeja/',
    },
  ];

  const result = findTargetResult(
    results,
    'https://www.rentalhub.com.ng/nigeria/lagos/ikeja',
    'exact'
  );

  assert.equal(result.position, 9);
});
