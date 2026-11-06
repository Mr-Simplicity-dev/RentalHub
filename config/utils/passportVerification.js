const crypto = require('crypto');
const sharp = require('sharp');
const alpha = require('./passportCountryCodes.json');
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const aliases = { 'antigua and barbuda':'AG','bosnia and herzegovina':'BA','cabo verde':'CV','congo':'CG','congo (drc)':'CD','czech republic':'CZ','ivory coast':'CI','myanmar':'MM','palestine':'PS','saint kitts and nevis':'KN','saint lucia':'LC','saint vincent and the grenadines':'VC','sao tome and principe':'ST','trinidad and tobago':'TT','turkey':'TR','hong kong':'HK','macau':'MO','macao':'MO' };
const countryNames = Object.fromEntries(Object.keys(alpha).map(code => [names.of(code).toLowerCase(), code]));
Object.assign(countryNames, aliases);
const countryCode = value => {
  const text = String(value || '').trim();
  if (alpha[text.toUpperCase()]) return text.toUpperCase();
  const found = Object.keys(alpha).find(code => alpha[code] === text.toUpperCase());
  return found || countryNames[text.toLowerCase()] || null;
};
const fail = (message, code = 'PASSPORT_DOCUMENT_INVALID') => Object.assign(new Error(message), { statusCode: 400, code });
const channel = (country, hasImage) => {
  const code = countryCode(country);
  if (code === 'NG') throw fail('Nigerian applicants must register using the NIN route.', 'PASSPORT_NIN_REQUIRED');
  if (!code) throw fail('Enter a recognised passport issuing country.', 'PASSPORT_COUNTRY_INVALID');
  if (hasImage) return { code, method: 'document', path: '/verification/document' };
  if (code === 'KE') return { code, method: 'registry', path: '/verification/ke/passport' };
  if (code === 'CN') return { code, method: 'registry', path: '/verification/asia/kyc/china/verify-passport/basic' };
  throw fail('This passport check requires a clear image of the passport bio-data page. Update the mobile app or use the website to attach it. No passport verification has been submitted.', 'PASSPORT_IMAGE_REQUIRED');
};
const documentImage = async value => {
  if (typeof value !== 'string' || value.length > 710000) throw fail('Choose a JPEG or PNG passport image no larger than 500 KB.');
  const matched = value.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!matched) throw fail('Choose a valid JPEG or PNG passport image.');
  const buffer = Buffer.from(matched[2], 'base64');
  if (buffer.length < 100 || buffer.length > 512000 || buffer.toString('base64') !== matched[2]) throw fail('Choose a valid passport image no larger than 500 KB.');
  const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if ((matched[1] === 'jpeg' && !jpeg) || (matched[1] === 'png' && !png)) throw fail('The image content does not match its file type.');
  try {
    const image = sharp(buffer, { limitInputPixels: 16000000, failOn: 'error' });
    const metadata = await image.metadata();
    if (!['jpeg','png'].includes(metadata.format) || metadata.pages > 1 || Math.min(metadata.width || 0, metadata.height || 0) < 400) throw fail('Use a clear, complete passport page at least 400 pixels wide and tall.');
    return (await image.rotate().resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()).toString('base64');
  } catch (error) { if (error.code === 'PASSPORT_DOCUMENT_INVALID') throw error; throw fail('The passport image could not be read. Choose another clear JPEG or PNG.'); }
};
const numberHash = value => crypto.createHmac('sha256', process.env.JWT_SECRET).update('passport-number:' + String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()).digest('hex');
const checkIdentity = (result, { number, country, method }) => {
  if (!result.verified) return result;
  const actualCountry = countryCode(result.document_country);
  const actualNumber = String(result.document_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const expectedNumber = String(number).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  let message;
  if (actualCountry && actualCountry !== countryCode(country)) message = 'The verified passport issuing country does not match your selection.';
  else if ((actualNumber && actualNumber !== expectedNumber) || (result.document_number_hash && result.document_number_hash !== numberHash(expectedNumber))) message = 'The verified passport number does not match the number entered.';
  else if (method === 'document' && (!actualCountry || (!actualNumber && !result.document_number_hash) || !result.document_expiry)) message = 'Prembly did not confirm the passport number and issuing country. Contact support to review the existing verification.';
  else if (method === 'document' && result.document_type && !/passport|^pp$|^p$/i.test(result.document_type)) message = 'The uploaded document was not verified as a passport.';
  else if (result.document_expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(result.document_expiry) || !Number.isFinite(Date.parse(result.document_expiry)) || new Date(result.document_expiry).toISOString().slice(0,10) !== result.document_expiry)) message = 'The passport expiry date could not be confirmed.';
  else if (result.document_expiry && result.document_expiry < new Date().toISOString().slice(0,10)) message = 'This passport has expired. Use a valid passport.';
  return message ? { ...result, verified: false, status: 'not_verified', message } : { ...result, document_country: actualCountry || countryCode(country) };
};
const countryChoices = () => Object.keys(alpha).filter(code => code !== 'NG').map(code => ({ code, name: names.of(code) })).sort((a,b) => a.name.localeCompare(b.name, 'en'));
module.exports = { countryCode, channel, documentImage, checkIdentity, numberHash, countryChoices };
