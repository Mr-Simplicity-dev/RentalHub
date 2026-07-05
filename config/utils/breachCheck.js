const crypto = require('crypto');
const https = require('https');

const BREACH_CHECK_ENABLED = process.env.PASSWORD_BREACH_CHECK !== 'false';

const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex').toUpperCase();

const fetchBreachedPrefix = (prefix) => new Promise((resolve, reject) => {
  const req = https.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'User-Agent': 'RentalHub-NG/1.0' },
    timeout: 3000,
  }, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => resolve(body));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
});

const checkPasswordBreached = async (password) => {
  if (!BREACH_CHECK_ENABLED) return false;

  const hash = sha1(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const response = await fetchBreachedPrefix(prefix);
    const isBreached = response.split('\r\n').some(line => line.startsWith(suffix));
    return isBreached;
  } catch {
    return false;
  }
};

module.exports = { checkPasswordBreached };