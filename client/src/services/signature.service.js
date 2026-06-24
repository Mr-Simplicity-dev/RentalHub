// services/signature.service.js
const crypto = require('crypto');
const UserKey = require('../models/UserKey');
const DocumentSignature = require('../models/DocumentSignature');

function decryptPrivateKey(encrypted) {
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts.shift(), 'hex');
  const encryptedKey = parts.join(':');

  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    crypto.createHash('sha256')
      .update(process.env.KEY_ENCRYPTION_SECRET)
      .digest(),
    iv
  );

  let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

exports.signDocument = async ({ userId, documentId, documentType, documentBuffer }) => {
  const userKey = await UserKey.findOne({ userId });
  if (!userKey) throw new Error('User key not found');

  const hash = crypto.createHash('sha256')
    .update(documentBuffer)
    .digest('hex');

  const privateKey = decryptPrivateKey(userKey.privateKeyEncrypted);

  const sign = crypto.createSign('SHA256');
  sign.update(hash);
  sign.end();

  const signature = sign.sign(privateKey, 'hex');

  await DocumentSignature.create({
    documentId,
    documentType,
    signerId: userId,
    signature,
    signedHash: hash
  });

  return { hash, signature };
};