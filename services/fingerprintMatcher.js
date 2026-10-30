const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fail } = require('./assistedRegistrationPolicy');
const ENGINE = 'sourceafis-3.18.1';
let active = 0;
const settings = () => {
  const key = String(process.env.FINGERPRINT_ENCRYPTION_KEY || '');
  const threshold = Number(process.env.FINGERPRINT_MATCH_THRESHOLD || 60);
  const jar = path.resolve(__dirname, '../tools/fingerprint-matcher/target/fingerprint-matcher.jar');
  if (!/^[a-f0-9]{64}$/i.test(key) || !Number.isFinite(threshold) || threshold < 40 || threshold > 1000 || !fs.existsSync(jar)) {
    throw fail(503, 'Office fingerprint verification is not configured.');
  }
  return { key: Buffer.from(key, 'hex'), threshold, jar };
};
const validateImage = image => {
  if (typeof image !== 'string' || image.length > 400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw fail(400, 'Scan a valid fingerprint again.');
  const bytes = Buffer.from(image, 'base64');
  if (bytes.toString('base64') !== image || bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw fail(400, 'Only reader PNG samples are accepted.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width < 128 || height < 128 || width > 1024 || height > 1024 || width * height > 600000) throw fail(400, 'Fingerprint image dimensions are invalid.');
};
const seal = (userId, template) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', settings().key, iv);
  cipher.setAAD(Buffer.from(`${ENGINE}:${userId}`));
  const data = Buffer.concat([cipher.update(template, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
};
const unseal = (userId, encrypted) => {
  const bytes = Buffer.from(encrypted, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', settings().key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${ENGINE}:${userId}`));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
};
const run = async (operation, data = {}) => {
  const config = settings();
  if (!['health', 'enroll', 'verify'].includes(operation)) throw fail(400, 'Invalid fingerprint operation.');
  if (operation !== 'health') validateImage(data.image);
  if (operation === 'enroll') {
    validateImage(data.confirmation);
    if (data.image === data.confirmation) throw fail(400, 'Lift your finger and take a new second scan.');
  }
  if (active >= 2) throw fail(503, 'The fingerprint service is busy. Please try again.');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.env.FINGERPRINT_JAVA_PATH || 'java', ['-Xmx256m', '-Djava.awt.headless=true', '-jar', config.jar], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
      let output = '', settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => { child.kill(); finish(fail(503, 'Fingerprint processing timed out. Please scan again.')); }, 20000);
      child.on('error', () => finish(fail(503, 'Fingerprint engine is unavailable.')));
      child.stdin.on('error', () => {});
      child.stderr.on('data', () => {});
      child.stdout.on('data', chunk => {
        output += chunk.toString('utf8');
        if (output.length > 150000) { child.kill(); finish(fail(503, 'Invalid fingerprint engine response.')); }
      });
      child.on('close', code => {
        try {
          const result = JSON.parse(output);
          if (code !== 0 || result.error) return finish(fail(400, 'Unable to process this fingerprint. Please scan again.'));
          if (result.engine !== ENGINE || (operation === 'health' ? result.ready !== true : typeof result.matches !== 'boolean')) throw new Error();
          if (operation === 'enroll' && result.matches && (typeof result.template !== 'string' || result.template.length > 135000)) throw new Error();
          finish(null, result);
        } catch { finish(fail(503, 'Invalid fingerprint engine response.')); }
      });
      child.stdin.end(JSON.stringify({ ...data, operation, threshold: config.threshold }));
    });
  } finally { active--; }
};
module.exports = { ENGINE, settings, validateImage, seal, unseal, run };
