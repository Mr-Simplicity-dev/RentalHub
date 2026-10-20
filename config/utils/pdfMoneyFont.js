const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * PDFKit's built-in fonts (Helvetica etc.) use WinAnsi encoding, which has no
 * glyph for the naira sign (U+20A6). PDFKit does not throw — the character is
 * simply dropped, so "₦12,500" printed as "12,500" on every receipt.
 *
 * Money on a PDF must therefore be drawn with a font that actually contains
 * the glyph. DejaVu Sans ships with the Debian base image and does; it is
 * embedded into the PDF, so it renders on every device.
 */

const MONEY_FONT_NAME = 'Money';

const candidatePaths = () => {
  const fromEnv = String(process.env.PDF_MONEY_FONT_PATH || '').trim();
  return [
    fromEnv,
    path.join(__dirname, '..', '..', 'assets', 'DejaVuSans.ttf'),
    path.join(__dirname, '..', '..', 'assets', 'NotoSans-Regular.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    'C:/Windows/Fonts/arial.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
  ].filter(Boolean);
};

exports.findMoneyFontPath = () => {
  for (const candidate of candidatePaths()) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore an unusable path and keep looking.
    }
  }
  return null;
};

/**
 * Register the money font on a PDFKit document and return the font name to
 * use. Falls back to 'Helvetica' when no capable font exists, so receipt
 * generation never breaks — the naira sign is only lost as a last resort.
 */
exports.registerMoneyFont = (doc) => {
  try {
    const fontPath = exports.findMoneyFontPath();
    if (!fontPath) {
      logger.warn('No naira-capable PDF font found; receipts will use Helvetica');
      return 'Helvetica';
    }

    doc.registerFont(MONEY_FONT_NAME, fontPath);
    return MONEY_FONT_NAME;
  } catch (error) {
    // A font we cannot read must never stop a receipt being produced.
    logger.warn(`Money font registration failed: ${error.message}`);
    return 'Helvetica';
  }
};

exports.MONEY_FONT_NAME = MONEY_FONT_NAME;
