const logger = require('../utils/logger');

const getSecretKey = () => String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const getSiteverifyTimeoutMs = () => {
  const value = Number(process.env.TURNSTILE_SITEVERIFY_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : 3000;
};

// Skipping is allowed only for explicit test runs. Production cannot activate
// this path, even if the environment variable is set by mistake.
const canSkipTurnstile = () => (
  process.env.NODE_ENV === 'test' && process.env.TURNSTILE_SKIP_VERIFICATION === 'true'
);

const turnstileRejection = (res) => res.status(400).json({
  success: false,
  message: 'Security check required. Please refresh and try again.',
});

// Cloudflare recommends binding verification to a widget action so a token
// minted on one page cannot be replayed against a different protected action.
// Every protected route MUST pass the exact action its form's widget uses.
const verifyTurnstileToken = async (token, remoteIp = '', expectedAction = '') => {
  if (canSkipTurnstile()) {
    logger.warn('Turnstile verification is skipped by explicit test-only configuration.');
    return true;
  }

  const secret = getSecretKey();
  if (!secret) {
    logger.error('TURNSTILE_SECRET_KEY is missing - rejecting Turnstile-protected request');
    return false;
  }

  try {
    const https = require('https');
    const querystring = require('querystring');

    const payload = { secret, response: token };
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
              const actionMatches = !expectedAction || result.action === expectedAction;
              resolve(result.success === true && actionMatches);
            } catch {
              resolve(false);
            }
          });
        }
      );

      // A slow Siteverify connection must never leave the request hanging.
      req.setTimeout(getSiteverifyTimeoutMs(), () => {
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

// Factory: every protected route declares the exact widget action it accepts,
// so a token minted on one form cannot be replayed on another endpoint.
const requireTurnstile = (expectedAction) => {
  if (!expectedAction) {
    throw new Error('requireTurnstile requires an expected action (e.g. requireTurnstile("rentalhub_login"))');
  }

  return (req, res, next) => {
    if (canSkipTurnstile()) {
      return next();
    }

    const token = req.body?.turnstile_token;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return turnstileRejection(res);
    }

    return verifyTurnstileToken(token, req.ip, expectedAction)
      .then((valid) => (valid ? next() : turnstileRejection(res)))
      .catch(() => turnstileRejection(res));
  };
};

module.exports = { requireTurnstile, verifyTurnstileToken };
