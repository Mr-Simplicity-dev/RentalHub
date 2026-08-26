const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_SITEVERIFY_TIMEOUT_MS = Number(process.env.TURNSTILE_SITEVERIFY_TIMEOUT_MS || 3000);
// Fail-closed policy: verification is skipped ONLY when explicitly opted in
// with TURNSTILE_SKIP_VERIFICATION=true (local development). A missing secret
// key or misconfigured environment is NEVER silently ignored.
const TURNSTILE_SKIP_VERIFICATION = process.env.TURNSTILE_SKIP_VERIFICATION === 'true';

// Cloudflare recommends binding verification to a widget action so a token
// minted on one page cannot be replayed against a different protected action.
// Every protected route MUST pass the exact action its form's widget uses.
const verifyTurnstileToken = async (token, remoteIp = '', expectedAction = '') => {
  if (TURNSTILE_SKIP_VERIFICATION) {
    if (!TURNSTILE_SECRET_KEY) {
      console.warn('Turnstile verification is explicitly SKIPPED (TURNSTILE_SKIP_VERIFICATION=true). Never use this in production.');
    }
    return true;
  }

  if (!TURNSTILE_SECRET_KEY) {
    // Fail closed: a missing secret must never silently disable the check.
    console.error('TURNSTILE_SECRET_KEY is not set - rejecting Turnstile-protected request (fail closed)');
    return false;
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
              const actionMatches = !expectedAction || result.action === expectedAction;
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

// Factory: every protected route declares the exact widget action it accepts,
// so a token minted on one form cannot be replayed on another endpoint.
const requireTurnstile = (expectedAction) => {
  if (!expectedAction) {
    throw new Error('requireTurnstile requires an expected action (e.g. requireTurnstile("rentalhub_login"))');
  }

  return (req, res, next) => {
    const token = req.body?.turnstile_token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Security check required. Please refresh and try again.',
      });
    }

    verifyTurnstileToken(token, req.ip, expectedAction).then((valid) => {
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Security check failed. Please refresh and try again.',
        });
      }
      next();
    });
  };
};

module.exports = { requireTurnstile, verifyTurnstileToken };
