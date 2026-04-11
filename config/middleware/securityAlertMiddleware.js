const ATTEMPT_WINDOW_MS = Number(process.env.SECURITY_ALERT_WINDOW_MS) || 15 * 60 * 1000;
const ATTEMPT_THRESHOLD = Number(process.env.SECURITY_ALERT_THRESHOLD) || 10;

const deniedAccessAttempts = new Map();

const cleanupExpiredAttempts = (bucket, now) => {
  while (bucket.length > 0 && now - bucket[0] > ATTEMPT_WINDOW_MS) {
    bucket.shift();
  }
};

const securityAlertMiddleware = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode !== 401 && res.statusCode !== 403) {
      return;
    }

    const now = Date.now();
    const actor = req.user?.id ? `user:${req.user.id}` : 'anonymous';
    const key = `${req.ip || 'unknown'}|${actor}|${req.baseUrl || ''}${req.path || ''}`;

    if (!deniedAccessAttempts.has(key)) {
      deniedAccessAttempts.set(key, []);
    }

    const bucket = deniedAccessAttempts.get(key);
    bucket.push(now);
    cleanupExpiredAttempts(bucket, now);

    if (bucket.length >= ATTEMPT_THRESHOLD) {
      console.warn('[SECURITY ALERT] Repeated denied access attempts detected', {
        ip: req.ip || 'unknown',
        actor,
        method: req.method,
        route: `${req.baseUrl || ''}${req.path || ''}`,
        statusCode: res.statusCode,
        attemptsInWindow: bucket.length,
        windowMs: ATTEMPT_WINDOW_MS,
      });

      deniedAccessAttempts.set(key, []);
    }
  });

  next();
};

module.exports = securityAlertMiddleware;
