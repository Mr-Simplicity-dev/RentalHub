const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const { findMoneyFontPath, registerMoneyFont, MONEY_FONT_NAME } = require('../config/utils/pdfMoneyFont');

test('a naira-capable font is found on this machine, or we fall back honestly', () => {
  const found = findMoneyFontPath();
  if (found) {
    assert.ok(fs.existsSync(found), 'the discovered font path must exist');
    const bytes = fs.readFileSync(found);
    // U+20A6 as UTF-16BE inside the cmap.
    assert.ok(
      bytes.includes(Buffer.from([0x20, 0xa6])),
      'the money font must actually contain the naira glyph'
    );
  } else {
    // On a machine with no such font the helper must still not throw.
    assert.equal(found, null);
  }
});

test('registerMoneyFont never throws and always returns a usable font name', () => {
  const registered = [];
  const fakeDoc = {
    registerFont: (name, file) => {
      registered.push({ name, file });
    },
  };

  const name = registerMoneyFont(fakeDoc);
  assert.ok(typeof name === 'string' && name.length > 0);

  if (registered.length) {
    assert.equal(name, MONEY_FONT_NAME);
    assert.ok(fs.existsSync(registered[0].file));
  } else {
    // No capable font available: Helvetica is the safe fallback.
    assert.equal(name, 'Helvetica');
  }
});

test('a broken font path degrades to Helvetica instead of failing a receipt', () => {
  const fakeDoc = {
    registerFont: () => {
      throw new Error('font file is corrupt');
    },
  };

  const name = registerMoneyFont(fakeDoc);
  assert.equal(name, 'Helvetica');
});

test('PDFKit measurably drops the naira glyph in Helvetica but not in the money font', (t) => {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch {
    t.skip('pdfkit is not installed');
    return;
  }

  const helveticaDoc = new PDFDocument();
  helveticaDoc.font('Helvetica');
  assert.equal(
    helveticaDoc.widthOfString('\u20A6'),
    0,
    'Helvetica must have no naira glyph (this is the bug being guarded)'
  );

  const moneyFontFile = findMoneyFontPath();
  if (!moneyFontFile) {
    t.skip('no naira-capable font installed on this machine');
    return;
  }

  const moneyDoc = new PDFDocument();
  const moneyFont = registerMoneyFont(moneyDoc);
  moneyDoc.font(moneyFont);
  assert.ok(
    moneyDoc.widthOfString('\u20A6') > 0,
    'the money font must render the naira sign with a real width'
  );
});

test('receipt PDF routes draw amounts with the money font, not Helvetica', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'payments.js'), 'utf8');
  assert.ok(source.includes("require('../config/utils/pdfMoneyFont')"));
  // All three PDFs must set up the money font.
  const setupCalls = source.match(/const moneyFont = registerMoneyFont\(doc\);/g) || [];
  assert.equal(setupCalls.length, 3, 'receipt, savings receipt and commission statement each need it');
  // No money line may be drawn with Helvetica any more.
  const helveticaWithNaira = source
    .split('\n')
    .filter((line) => line.includes('\u20A6') && line.includes("doc.font('Helvetica"));
  assert.deepEqual(helveticaWithNaira, [], 'no naira amount may be drawn with Helvetica');
});
