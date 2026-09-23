// services/key.service.js
const crypto = require('crypto');
const UserKey = require('../models/UserKey');

const AES_SECRET = process.env.KEY_ENCRYPTION_SECRET;

function encryptPrivateKey(privateKey) {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256').update(AES_SECRET).digest(),
    Buffer.alloc(16, 0)
  );

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

exports.generateKeysForUser = async (userId) => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const encryptedPrivateKey = encryptPrivateKey(
    privateKey.export({ type: 'pkcs1', format: 'pem' })
  );

  const userKey = await UserKey.create({
    userId,
    publicKey: publicKey.export({ type: 'pkcs1', format: 'pem' }),
    privateKeyEncrypted: encryptedPrivateKey
  });

  return userKey;
};