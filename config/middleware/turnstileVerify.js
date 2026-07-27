const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

const verifyTurnstileToken = async (token) => {
  if (!TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification');
    return true;
  }

  try {
    const https = require('https');
    const querystring = require('querystring');

    const data = querystring.stringify({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
    });

    return new Promise((resolve, reject) => {
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
              resolve(result.success === true);
            } catch {
              resolve(false);
            }
          });
        }
      );
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

  verifyTurnstileToken(token).then((valid) => {
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
