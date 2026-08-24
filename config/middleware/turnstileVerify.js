const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_SITEVERIFY_TIMEOUT_MS = Number(process.env.TURNSTILE_SITEVERIFY_TIMEOUT_MS || 8000);
const TURNSTILE_EXPECTED_ACTION = 'rentalhub_form';

// Cloudflare recommends binding verification to a widget action so a token
// minted on one page cannot be replayed against a different protected action.
const verifyTurnstileToken = async (token, remoteIp = '') => {
  if (!TURNSTILE_SECRET_KEY) {
    // Fail closed in production: a missing secret must not silently disable
    // the security check. In local development the check is skipped so the
    // app remains runnable without credentials.
    if (process.env.NODE_ENV === 'production') {
      console.error('TURNSTILE_SECRET_KEY is not set - Turnstile verification disabled');
      return false;
    }
    console.warn('TURNSTILE_SECRET_KEY not set - skipping verification');
    return true;
  }

  try {
    const https = require('https');
    const querystring = require('querystring');

    const payload = { secret: TURNSTILE_SECRET_KEY, response: token };
    if (remoteIp) payload.remoteip = remoteIp;

    const data = querystring.stringify(payload);

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: 'challenges.cloudflare.com',
          path: '/turnstile/v0/siteverify',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const result = JSON.parse(body);
              const actionMatches = !result.action || result.action === TURNSTILE_EXPECTED_ACTION;
              resolve(result.success === true && actionMatches);
            } catch {
              resolve(false);
            }
          });
        }
      );

      // A slow Siteverify connection must never leave the request hanging.
      req.setTimeout(TURNSTILE_SITEVERIFY_TIMEOUT_MS, () => {
        req.destroy(new Error('Turnstile siteverify timed out'));
      });
      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  } catch {
    return false;
  }
};

const requireTurnstile = (req, res, next) => {
  const token = req.body?.turnstile_token;

  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'Security check required. Please refresh and try again.',
    });
  }

  verifyTurnstileToken(token, req.ip).then((valid) => {
    if (!valid) {
      return res.status(400).json({
        success: false,
        message: 'Security check failed. Please refresh and try again.',
      });
    }
    next();
  });
};

module.exports = { requireTurnstile, verifyTurnstileToken };
