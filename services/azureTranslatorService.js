const { getAzureTranslatorConfig } = require('../config/utils/multilingualConfig');

class TranslationError extends Error {
  constructor(code, message, statusCode = 502) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TRANSLATED_LENGTH = 5000;

const providerError = (code = 'TRANSLATION_PROVIDER_ERROR', statusCode = 502) => {
  const error = new TranslationError(code, 'Translation failed. Please try again.', statusCode);
  error.retryable = false;
  return error;
};

const oversizedResponseError = () => providerError('TRANSLATION_RESPONSE_TOO_LARGE');

const abortError = () => {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
};

const withAbort = (promise, signal) => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
};

const readBoundedJson = async (response, signal) => {
  const contentLength = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw oversizedResponseError();
  }

  if (response?.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await withAbort(reader.read(), signal);
        if (done) break;
        total += value?.byteLength || 0;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel?.();
          throw oversizedResponseError();
        }
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof TranslationError) throw error;
      if (error?.name === 'AbortError') throw error;
      throw providerError();
    }
    const text = Buffer.concat(chunks).toString('utf8');
    try {
      return JSON.parse(text);
    } catch {
      throw providerError();
    }
  }

  let payload;
  try {
    if (typeof response?.text === 'function') {
      const text = await withAbort(response.text(), signal);
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw oversizedResponseError();
      payload = JSON.parse(text);
    } else {
      payload = await withAbort(response?.json?.(), signal);
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_RESPONSE_BYTES) {
        throw oversizedResponseError();
      }
    }
  } catch (error) {
    if (error instanceof TranslationError) throw error;
    if (error?.name === 'AbortError') throw error;
    throw providerError();
  }
  return payload;
};

const translatePlainText = async ({
  text,
  targetLanguage,
  sourceLanguage = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
} = {}) => {
  const config = getAzureTranslatorConfig(env);
  if (!config.enabled || !config.configured) {
    throw new TranslationError('TRANSLATION_UNAVAILABLE', 'Translation is not available.', 503);
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw new TranslationError('TRANSLATION_INVALID_TEXT', 'No translatable text was found.', 422);
  }

  if (typeof fetchImpl !== 'function') {
    throw new TranslationError('TRANSLATION_UNAVAILABLE', 'Translation is not available.', 503);
  }

  const query = new URLSearchParams({ 'api-version': config.apiVersion, to: targetLanguage });
  if (sourceLanguage) query.set('from', sourceLanguage);
  const url = `${config.endpoint}/translate?${query.toString()}`;
  const body = JSON.stringify([{ text }]);
  const headers = {
    'Ocp-Apim-Subscription-Key': config.key,
    'Ocp-Apim-Subscription-Region': config.region,
    'Content-Type': 'application/json',
  };

  let lastError = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await withAbort(fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      }), controller.signal);

      if (response.ok) {
        const payload = await readBoundedJson(response, controller.signal);
        const translated = Array.isArray(payload)
          ? payload[0]?.translations?.[0]?.text
          : null;
        if (typeof translated !== 'string' || !translated.trim() || translated.length > MAX_TRANSLATED_LENGTH) {
          throw providerError();
        }
        return { translatedText: translated, sourceLanguage: sourceLanguage || 'auto' };
      }

      if (response.status === 429) throw providerError('TRANSLATION_RATE_LIMITED', 429);
      const httpError = new TranslationError(
        'TRANSLATION_PROVIDER_ERROR',
        'Translation failed. Please try again.',
        Number.isInteger(response.status) ? response.status : 502
      );
      if (!RETRYABLE_STATUSES.has(response.status)) {
        httpError.retryable = false;
        throw httpError;
      }
      lastError = httpError;
      if (attempt === config.maxRetries) throw lastError;
    } catch (error) {
      if (error instanceof TranslationError) {
        if (error.retryable === false || error.statusCode === 429) throw error;
        lastError = error;
      } else if (error?.name === 'AbortError') {
        lastError = new TranslationError('TRANSLATION_TIMEOUT', 'Translation timed out. Please try again.', 504);
      } else {
        lastError = providerError();
      }
      if (attempt === config.maxRetries) throw lastError;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(Math.min(1000, 100 * (2 ** attempt)));
  }

  throw lastError || providerError();
};

module.exports = { TranslationError, translatePlainText };
