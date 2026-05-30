/**
 * Centralized Logger
 *
 * Replaces ad-hoc console.log/error across the application.
 * Uses winston with structured logging, correlation ID support,
 * and environment-aware formatting.
 *
 * Usage:
 *   const logger = require('../config/utils/logger');
 *   logger.info('Server started', { port: 5000 });
 *   logger.error('Database query failed', { error: err.message, query: 'SELECT ...' });
 *   logger.warn('Rate limit approaching', { ip: req.ip });
 */

const winston = require('winston');
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

/**
 * Custom format that includes timestamp, level, message, and optional metadata.
 * In production, outputs JSON for log aggregation.
 * In development, outputs colorized text.
 */
const createFormat = () => {
  if (isProduction) {
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  }

  return winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
      const corr = correlationId ? ` [${correlationId}]` : '';
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} ${level}${corr}: ${message}${metaStr}`;
    })
  );
};

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: createFormat(),
  defaultMeta: { service: 'rentalhub-ng' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// In production, also log to files
if (isProduction) {
  const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  logger.add(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
}

/**
 * Create a child logger with a correlation ID pre-populated.
 * Use this in route handlers: req.logger = logger.child({ correlationId: req.correlationId });
 */
logger.child = (bindings) => {
  return winston.createLogger({
    level: logger.level,
    format: logger.format,
    defaultMeta: { ...logger.defaultMeta, ...bindings },
    transports: logger.transports,
  });
};

module.exports = logger;
